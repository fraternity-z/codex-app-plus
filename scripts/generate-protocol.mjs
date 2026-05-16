import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, extname, join, resolve } from "node:path";

const OUTPUT_TS = resolve("src/protocol/generated");
const OUTPUT_SCHEMA = resolve("src/protocol/schema");
const BUNDLED_CODEX_ROOT = resolve("src-tauri/bundled/codex-cli");
const BUNDLED_MANIFEST = "manifest.json";
const CODEX_BINARY_ENV = "CODEX_BINARY_PATH";
const WINDOWS_CANDIDATES = Object.freeze(["codex.cmd", "codex.exe", "codex.ps1", "codex"]);
const PLATFORM_TARGETS = Object.freeze({
  "win32:x64": {
    packageKey: "windowsX64",
    triple: "x86_64-pc-windows-msvc",
    binaryName: "codex.exe"
  },
  "win32:arm64": {
    packageKey: "windowsArm64",
    triple: "aarch64-pc-windows-msvc",
    binaryName: "codex.exe"
  },
  "linux:x64": {
    packageKey: "linuxX64",
    triple: "x86_64-unknown-linux-musl",
    binaryName: "codex"
  },
  "linux:arm64": {
    packageKey: "linuxArm64",
    triple: "aarch64-unknown-linux-musl",
    binaryName: "codex"
  }
});
const codexCli = resolveCodexCli();

function resolveCodexCli() {
  const override = process.env[CODEX_BINARY_ENV]?.trim();
  if (override) {
    return buildCodexCli(override);
  }

  const bundledPath = resolveBundledCodexCli();
  if (bundledPath) {
    return buildCodexCli(bundledPath);
  }

  if (process.platform !== "win32") {
    return buildCodexCli("codex");
  }

  const discoveredPath = findWindowsPathCandidate();
  return buildCodexCli(discoveredPath ?? "codex");
}

function resolveBundledCodexCli() {
  const target = PLATFORM_TARGETS[`${process.platform}:${process.arch}`];
  if (!target) {
    return null;
  }

  const manifestPath = join(BUNDLED_CODEX_ROOT, BUNDLED_MANIFEST);
  if (!isFile(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const roots = [
    manifest?.npmPackage?.platformPackages?.[target.packageKey],
    manifest?.npmPackage?.root
  ].filter(Boolean);

  for (const root of roots) {
    const candidate = join(
      BUNDLED_CODEX_ROOT,
      root,
      "vendor",
      target.triple,
      "codex",
      target.binaryName
    );
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findWindowsPathCandidate() {
  const pathText = process.env.PATH;
  if (!pathText) {
    return null;
  }

  for (const directory of pathText.split(delimiter)) {
    if (!directory) {
      continue;
    }
    for (const candidate of WINDOWS_CANDIDATES) {
      const candidatePath = join(directory, candidate);
      if (isFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function buildCodexCli(binaryPath) {
  const extension = extname(binaryPath).toLowerCase();
  if (process.platform === "win32" && (extension === ".cmd" || extension === ".bat")) {
    return {
      program: "cmd.exe",
      prefixArgs: ["/C", binaryPath],
      displayPath: binaryPath
    };
  }

  if (process.platform === "win32" && extension === ".ps1") {
    return {
      program: "powershell.exe",
      prefixArgs: ["-File", binaryPath],
      displayPath: binaryPath
    };
  }

  if (
    process.platform === "win32"
    && extension === ""
    && !binaryPath.includes("\\")
    && !binaryPath.includes("/")
  ) {
    return {
      program: "cmd.exe",
      prefixArgs: ["/C", binaryPath],
      displayPath: binaryPath
    };
  }

  return {
    program: binaryPath,
    prefixArgs: [],
    displayPath: binaryPath
  };
}

function formatSpawnError(error) {
  if (error?.code === "ENOENT") {
    return new Error(
      `Unable to find the official codex CLI. Add codex to PATH or set ${CODEX_BINARY_ENV} to the executable path.`
    );
  }

  return error;
}

function runCodex(args) {
  const result = spawnSync(codexCli.program, [...codexCli.prefixArgs, ...args], {
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) {
    throw formatSpawnError(result.error);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${codexCli.displayPath} ${args.join(" ")}`);
  }
}

function recreate(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
  mkdirSync(dirPath, { recursive: true });
}

function main() {
  recreate(OUTPUT_TS);
  recreate(OUTPUT_SCHEMA);
  runCodex(["app-server", "generate-ts", "--out", OUTPUT_TS, "--experimental"]);
  runCodex(["app-server", "generate-json-schema", "--out", OUTPUT_SCHEMA, "--experimental"]);
}

main();
