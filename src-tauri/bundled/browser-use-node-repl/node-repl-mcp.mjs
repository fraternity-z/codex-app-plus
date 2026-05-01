import net from "node:net";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { Buffer } from "node:buffer";
import { builtinModules } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const SERVER_INFO = {
  name: "node_repl",
  version: "0.1.0",
};

const JS_TOOL = {
  name: "js",
  description:
    "Run JavaScript in a persistent Node.js REPL. Supports top-level await and dynamic import.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "JavaScript code to run.",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
};

const RESET_TOOL = {
  name: "js_reset",
  description: "Reset the persistent Node.js REPL state.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

let repl = createRepl();
let pendingInput = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pendingInput += chunk;
  let newlineIndex;
  while ((newlineIndex = pendingInput.indexOf("\n")) >= 0) {
    const line = pendingInput.slice(0, newlineIndex).trim();
    pendingInput = pendingInput.slice(newlineIndex + 1);
    if (line.length === 0) {
      continue;
    }
    void handleLine(line);
  }
});

async function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: String(error?.message ?? error) },
    });
    return;
  }

  if (Array.isArray(message)) {
    await Promise.all(message.map((item) => handleMessage(item)));
    return;
  }
  await handleMessage(message);
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.id === undefined) {
    return;
  }

  try {
    switch (message.method) {
      case "initialize":
        writeResult(message.id, {
          protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        });
        return;
      case "tools/list":
        writeResult(message.id, { tools: [JS_TOOL, RESET_TOOL] });
        return;
      case "tools/call":
        writeResult(message.id, await callTool(message.params ?? {}));
        return;
      case "ping":
        writeResult(message.id, {});
        return;
      default:
        writeError(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    writeError(message.id, -32000, String(error?.message ?? error));
  }
}

async function callTool(params) {
  const name = params.name;
  const args = params.arguments ?? {};
  if (name === "js_reset") {
    await repl.dispose?.();
    repl = createRepl();
    return {
      content: [{ type: "text", text: "Node REPL state reset." }],
    };
  }
  if (name !== "js") {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (typeof args.code !== "string") {
    throw new Error("js requires a string code argument.");
  }
  return runJavaScript(args.code);
}

async function runJavaScript(code) {
  const logs = [];
  const images = [];
  const responseMeta = {};
  repl.logs = logs;
  repl.images = images;
  repl.responseMeta = responseMeta;

  try {
    const script = new vm.Script(`(async () => {\n${code}\n})()`, {
      filename: "node_repl.js",
      importModuleDynamically: (specifier, referrer) =>
        repl.loadModule(specifier, referrer?.identifier),
    });
    const result = await script.runInContext(repl.context);
    const content = [];
    if (logs.length > 0) {
      content.push({ type: "text", text: logs.join("\n") });
    }
    if (result !== undefined) {
      content.push({ type: "text", text: formatValue(result) });
    }
    for (const image of images) {
      content.push(image);
    }
    return {
      content: content.length > 0 ? content : [{ type: "text", text: "" }],
      _meta: responseMeta,
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: String(error?.stack ?? error?.message ?? error) }],
      _meta: responseMeta,
    };
  }
}

function createRepl() {
  const moduleCache = new Map();
  const state = {
    logs: [],
    images: [],
    responseMeta: {},
    context: null,
    loadModule: null,
    nativeSockets: new Set(),
    dispose: null,
  };

  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    clearInterval,
    clearTimeout,
    fetch: createBrowserUseFetch(),
    setInterval,
    setTimeout,
  };

  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = createConsole(state);
  sandbox.nodeRepl = createNodeReplBridge(state);
  state.context = vm.createContext(sandbox);
  state.loadModule = (specifier, referrer) =>
    loadModule(specifier, referrer, state.context, moduleCache);
  state.dispose = async () => {
    const sockets = [...state.nativeSockets];
    state.nativeSockets.clear();
    await Promise.allSettled(sockets.map(closeNativeSocket));
  };
  return state;
}

function closeNativeSocket(socket) {
  return new Promise((resolve) => {
    if (socket.destroyed) {
      resolve();
      return;
    }
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    socket.once("close", done);
    try {
      socket.end();
    } catch {
      // Ignore cleanup errors while resetting the REPL context.
    }
    try {
      socket.destroy();
    } catch {
      done();
    }
    if (socket.destroyed) {
      setImmediate(done);
    }
  });
}

function createConsole(state) {
  const push = (level, values) => {
    const text = values.map(formatValue).join(" ");
    state.logs.push(level === "log" ? text : `${level}: ${text}`);
  };
  return {
    debug: (...values) => push("debug", values),
    error: (...values) => push("error", values),
    info: (...values) => push("info", values),
    log: (...values) => push("log", values),
    warn: (...values) => push("warn", values),
  };
}

function createNodeReplBridge(state) {
  const sessionId = `browser-use-${process.pid}`;
  return {
    requestMeta: {
      "x-codex-turn-metadata": {
        session_id: sessionId,
        turn_id: "local-turn",
      },
    },
    fetch: globalThis.fetch,
    nativePipe: {
      createConnection: (pipePath) =>
        new Promise((resolve, reject) => {
          const socket = net.createConnection(pipePath);
          const onError = (error) => {
            socket.off("connect", onConnect);
            reject(error);
          };
          const onConnect = () => {
            socket.off("error", onError);
            state.nativeSockets.add(socket);
            socket.once("close", () => {
              state.nativeSockets.delete(socket);
            });
            resolve(socket);
          };
          socket.once("error", onError);
          socket.once("connect", onConnect);
        }),
    },
    setResponseMeta: (meta) => {
      if (meta && typeof meta === "object") {
        Object.assign(state.responseMeta, meta);
      }
    },
    emitImage: (dataUrl) => {
      const match = /^data:([^;,]+);base64,(.*)$/u.exec(dataUrl);
      if (!match) {
        return;
      }
      state.images.push({
        type: "image",
        mimeType: match[1],
        data: match[2],
      });
    },
    createElicitation: handleBrowserUseElicitation,
  };
}

function createBrowserUseFetch() {
  const nativeFetch = globalThis.fetch;
  return async (input, init) => {
    if (isBrowserUseSiteStatusRequest(input)) {
      return createSiteStatusAllowedResponse();
    }
    return nativeFetch(input, init);
  };
}

function isBrowserUseSiteStatusRequest(input) {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : typeof input?.url === "string"
          ? input.url
          : null;
  if (rawUrl === null) {
    return false;
  }
  try {
    const url = new URL(rawUrl);
    return url.hostname === "chatgpt.com" && url.pathname.endsWith("/backend-api/aura/site_status");
  } catch {
    return false;
  }
}

function createSiteStatusAllowedResponse() {
  const payload = { feature_status: { agent: false } };
  if (typeof Response === "function") {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

async function handleBrowserUseElicitation(request) {
  const origin = normalizeOrigin(request?.meta?.origin);
  if (origin === null) {
    return { action: "accept" };
  }
  const settings = await readBrowserUsePermissionSettings();
  if (settings.deniedOrigins.includes(origin)) {
    return { action: "reject" };
  }
  return { action: "accept" };
}

async function readBrowserUsePermissionSettings() {
  try {
    return parseBrowserUseConfig(await readFile(browserUseConfigPath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { allowedOrigins: [], deniedOrigins: [] };
    }
    return { allowedOrigins: [], deniedOrigins: [] };
  }
}

function browserUseConfigPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (typeof localAppData === "string" && localAppData.length > 0) {
    return path.join(localAppData, "CodexAppPlus", "browser", "config.toml");
  }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, "AppData", "Local", "CodexAppPlus", "browser", "config.toml");
}

function parseBrowserUseConfig(text) {
  const settings = { allowedOrigins: [], deniedOrigins: [] };
  let section = "";
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = stripTomlComment(rawLine).trim();
    if (line.length === 0) {
      continue;
    }
    const sectionMatch = /^\[([^\]]+)\]$/u.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const keyValueMatch = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/u.exec(line);
    if (!keyValueMatch || section !== "origins") {
      continue;
    }
    const key = keyValueMatch[1];
    const value = keyValueMatch[2];
    if (key === "allowed") {
      settings.allowedOrigins = parseTomlStringArray(value).map(normalizeOrigin).filter(Boolean);
    } else if (key === "denied") {
      settings.deniedOrigins = parseTomlStringArray(value).map(normalizeOrigin).filter(Boolean);
    }
  }
  return settings;
}

function stripTomlComment(line) {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (ch === "#" && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTomlStringArray(value) {
  try {
    const parsed = JSON.parse(value.trim());
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    const result = [];
    const pattern = /"((?:\\.|[^"\\])*)"/gu;
    let match;
    while ((match = pattern.exec(value)) !== null) {
      try {
        result.push(JSON.parse(`"${match[1]}"`));
      } catch {
        // Skip malformed entries.
      }
    }
    return result;
  }
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(value.includes("://") ? value.trim() : `https://${value.trim()}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function loadModule(specifier, referrer, context, moduleCache) {
  const resolved = resolveModuleSpecifier(specifier, referrer);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached;
  }

  if (resolved.startsWith("node:")) {
    const imported = await import(resolved);
    const module = createSyntheticModule(resolved, imported, context);
    moduleCache.set(resolved, module);
    await module.link(() => {
      throw new Error(`Unexpected import from synthetic module: ${resolved}`);
    });
    await module.evaluate();
    return module;
  }

  const source = await readFile(fileURLToPath(resolved), "utf8");
  const module = new vm.SourceTextModule(source, {
    context,
    identifier: resolved,
    initializeImportMeta: (meta) => {
      meta.url = resolved;
      meta.__codexNativePipe = context.nodeRepl.nativePipe;
    },
    importModuleDynamically: (childSpecifier, childModule) =>
      loadModule(childSpecifier, childModule.identifier, context, moduleCache),
  });
  moduleCache.set(resolved, module);
  await module.link((childSpecifier, childModule) =>
    loadModule(childSpecifier, childModule.identifier, context, moduleCache),
  );
  await module.evaluate();
  return module;
}

function createSyntheticModule(identifier, imported, context) {
  const names = new Set(["default", ...Object.keys(imported)]);
  return new vm.SyntheticModule(
    [...names],
    function initialize() {
      for (const name of names) {
        this.setExport(name, name === "default" ? imported.default ?? imported : imported[name]);
      }
    },
    { context, identifier },
  );
}

function resolveModuleSpecifier(specifier, referrer) {
  if (specifier.startsWith("node:")) {
    return specifier;
  }
  if (builtinModules.includes(specifier)) {
    return `node:${specifier}`;
  }
  if (specifier.startsWith("file:")) {
    return pathToFileURL(fileURLToPath(specifier)).href;
  }
  if (path.isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  if (/^[A-Za-z]:[\\/]/u.test(specifier)) {
    return pathToFileURL(specifier).href;
  }
  const basePath =
    referrer && referrer.startsWith("file:")
      ? path.dirname(fileURLToPath(referrer))
      : process.cwd();
  return pathToFileURL(path.resolve(basePath, specifier)).href;
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
