export type CommandIntent =
  | { readonly kind: "readFile"; readonly path: string }
  | { readonly kind: "readFiles"; readonly paths: readonly string[] }
  | { readonly kind: "editFile"; readonly path: string | null }
  | { readonly kind: "listDir"; readonly path: string | null }
  | { readonly kind: "searchContent"; readonly pattern: string; readonly path: string | null }
  | { readonly kind: "searchFiles"; readonly path: string | null; readonly pattern: string | null };

type AtomicCommandIntent =
  | { readonly kind: "readFile"; readonly path: string }
  | { readonly kind: "editFile"; readonly path: string | null }
  | { readonly kind: "listDir"; readonly path: string | null }
  | { readonly kind: "searchContent"; readonly pattern: string; readonly path: string | null }
  | { readonly kind: "searchFiles"; readonly path: string | null; readonly pattern: string | null };

const READ_PROGRAMS = new Set(["cat", "head", "tail", "less", "more", "nl", "bat", "type", "get-content", "gc"]);
const LIST_PROGRAMS = new Set(["ls", "dir", "get-childitem", "gci"]);
const SEARCH_CONTENT_PROGRAMS = new Set(["rg", "grep", "egrep", "fgrep", "ag", "ack", "select-string", "sls"]);
const POSIX_SHELL_PROGRAMS = new Set(["bash", "sh", "zsh"]);
const POWERSHELL_PROGRAMS = new Set(["pwsh", "powershell"]);
const IGNORED_PROGRAMS = new Set([
  "chcp",
  "echo",
  "if",
  "out-null",
  "select-object",
  "test-path",
  "where-object",
  "write-host",
  "write-output",
]);
const HEAD_TAIL_VALUE_FLAGS: ReadonlySet<string> = new Set(["-n", "--lines", "-c", "--bytes"]);
const POWERSHELL_READ_VALUE_FLAGS = new Set(["-tail", "-head", "-totalcount", "-encoding", "-readcount", "-wait"]);
const POWERSHELL_READ_PATH_FLAGS = new Set(["-path", "-literalpath"]);
const POWERSHELL_LIST_VALUE_FLAGS = new Set(["-filter", "-include", "-exclude", "-depth"]);
const POWERSHELL_LIST_PATH_FLAGS = new Set(["-path", "-literalpath"]);
const POWERSHELL_SEARCH_VALUE_FLAGS = new Set(["-pattern", "-simplematch", "-casesensitive", "-list", "-allmatches", "-notmatch", "-encoding", "-context"]);
const POWERSHELL_SEARCH_PATH_FLAGS = new Set(["-path", "-literalpath"]);
const SEARCH_CONTENT_VALUE_FLAGS = new Set([
  "-A",
  "-B",
  "-C",
  "-e",
  "-f",
  "-g",
  "-m",
  "-t",
  "-T",
  "--context",
  "--file",
  "--glob",
  "--iglob",
  "--max-count",
  "--regexp",
  "--type",
  "--type-not",
]);
const EMPTY_FLAGS: ReadonlySet<string> = new Set<string>();

export function classifyCommand(command: string): CommandIntent | null {
  const trimmed = command.trim();
  if (trimmed.length === 0) return null;
  const unwrapped = unwrapShell(trimmed);
  const intents = splitCompoundCommand(unwrapped)
    .map((part) => classifySingleCommand(part))
    .filter((intent): intent is AtomicCommandIntent => intent !== null);
  if (intents.length === 0) return null;
  return combineCommandIntents(intents);
}

function classifySingleCommand(command: string): AtomicCommandIntent | null {
  const tokens = tokenize(command);
  if (tokens.length === 0) return null;
  const programToken = tokens[0];
  const program = normalizeProgram(programToken);
  const rest = tokens.slice(1);

  if (program.length === 0 || IGNORED_PROGRAMS.has(program) || looksLikePseudoCommand(programToken)) return null;
  if (program === "apply_patch" || program === "apply-patch") return classifyApplyPatch(command);
  if (program === "sed") return classifySed(rest);
  if (READ_PROGRAMS.has(program)) return classifyRead(program, rest);
  if (LIST_PROGRAMS.has(program)) return classifyList(program, rest);
  if (SEARCH_CONTENT_PROGRAMS.has(program)) return classifySearchContent(program, rest);
  if (program === "find") return classifyFind(rest);
  return null;
}

function classifyRead(program: string, args: readonly string[]): AtomicCommandIntent | null {
  const isPowerShell = program === "get-content" || program === "gc" || program === "type";
  const usesHeadTailFlags = program === "head" || program === "tail";
  const path = isPowerShell
    ? findPath(args, POWERSHELL_READ_VALUE_FLAGS, POWERSHELL_READ_PATH_FLAGS)
    : findPath(args, usesHeadTailFlags ? HEAD_TAIL_VALUE_FLAGS : EMPTY_FLAGS, EMPTY_FLAGS);
  if (path === null) return null;
  return { kind: "readFile", path };
}

function classifyList(program: string, args: readonly string[]): AtomicCommandIntent | null {
  const isPowerShell = program === "get-childitem" || program === "gci";
  const path = isPowerShell
    ? findPath(args, POWERSHELL_LIST_VALUE_FLAGS, POWERSHELL_LIST_PATH_FLAGS)
    : findPath(args, EMPTY_FLAGS, EMPTY_FLAGS);
  return { kind: "listDir", path };
}

function classifyApplyPatch(command: string): AtomicCommandIntent {
  const paths = Array.from(command.matchAll(/\*\*\* (?:Add|Delete|Update) File: ([^\r\n]+)/g), (match) => sanitizeValue(match[1]))
    .filter((path): path is string => path !== null);
  if (paths.length === 1) return { kind: "editFile", path: paths[0] };
  return { kind: "editFile", path: null };
}

function classifySed(args: readonly string[]): AtomicCommandIntent | null {
  const hasInPlace = args.some((arg) => arg === "-i" || arg.startsWith("-i."));
  const positionals = args.filter((arg, index) => isSedPositional(arg, index, args));
  const path = positionals.length > 0 ? sanitizeValue(positionals[positionals.length - 1]) : null;
  if (hasInPlace) return { kind: "editFile", path };
  const hasQuiet = args.some((arg) => arg === "-n" || arg === "--quiet" || arg === "--silent");
  if (hasQuiet && path !== null) return { kind: "readFile", path };
  return null;
}

function isSedPositional(arg: string, index: number, args: readonly string[]): boolean {
  if (arg.startsWith("-")) return false;
  const previous = index > 0 ? args[index - 1] : "";
  if (previous === "-e" || previous === "-f" || previous === "--expression" || previous === "--file") return false;
  if (/^\d*[,;]?\d*\s*[pd]$/.test(arg)) return false;
  if (/^s\//.test(arg)) return false;
  return true;
}

function classifySearchContent(program: string, args: readonly string[]): AtomicCommandIntent | null {
  if (program === "select-string" || program === "sls") {
    const pattern = findFlagValue(args, new Set(["-pattern"])) ?? collectPositionals(args, POWERSHELL_SEARCH_VALUE_FLAGS)[0] ?? null;
    const path = findFlagValue(args, POWERSHELL_SEARCH_PATH_FLAGS) ?? collectPositionals(args, POWERSHELL_SEARCH_VALUE_FLAGS).at(-1) ?? null;
    if (pattern === null) return null;
    return { kind: "searchContent", pattern, path: path === pattern ? null : path };
  }
  const positionals = collectPositionals(args, SEARCH_CONTENT_VALUE_FLAGS);
  if (positionals.length === 0) return null;
  const [pattern, ...tail] = positionals;
  const path = tail.length > 0 ? tail[tail.length - 1] : null;
  return { kind: "searchContent", pattern, path };
}

function classifyFind(args: readonly string[]): AtomicCommandIntent | null {
  let path: string | null = null;
  let pattern: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    if (arg === "-name" || arg === "-iname" || arg === "-path" || arg === "-ipath") {
      pattern = sanitizeValue(args[index + 1]) ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (path === null) path = arg;
  }
  if (path === null && pattern === null) return null;
  return { kind: "searchFiles", path, pattern };
}

function findPath(args: readonly string[], valueFlags: ReadonlySet<string>, pathFlags: ReadonlySet<string>): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    const lower = arg.toLowerCase();
    if (pathFlags.has(lower)) return sanitizeValue(args[index + 1]) ?? null;
    if (arg.startsWith("-")) {
      if (valueFlags.has(lower)) index += 1;
      continue;
    }
    if (/^\d+$/.test(arg)) continue;
    return arg;
  }
  return null;
}

function findFlagValue(args: readonly string[], flags: ReadonlySet<string>): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    if (flags.has(arg.toLowerCase())) return sanitizeValue(args[index + 1]) ?? null;
  }
  return null;
}

function collectPositionals(args: readonly string[], valueFlags: ReadonlySet<string>): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    if (arg === "--") {
      positionals.push(
        ...args
          .slice(index + 1)
          .map((value) => sanitizeValue(value))
          .filter((value): value is string => value !== null),
      );
      break;
    }
    if (arg.startsWith("-")) {
      if (valueFlags.has(arg.toLowerCase())) index += 1;
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

function unwrapShell(command: string): string {
  let current = command.trim();
  for (let depth = 0; depth < 4; depth += 1) {
    const next = unwrapShellOnce(current);
    if (next === null) break;
    const trimmed = next.trim();
    if (trimmed.length === 0 || trimmed === current) break;
    current = trimmed;
  }
  return current;
}

function unwrapShellOnce(command: string): string | null {
  const tokens = tokenize(command);
  if (tokens.length === 0) return null;
  const program = normalizeProgram(tokens[0]);
  const args = tokens.slice(1);
  if (POSIX_SHELL_PROGRAMS.has(program)) return extractShellCommand(args);
  if (POWERSHELL_PROGRAMS.has(program)) return extractArgumentTail(args, new Set(["-command", "-c"]));
  if (program === "cmd") return extractArgumentTail(args, new Set(["/c"]));
  if (program === "wsl") return extractWslCommand(args);
  return null;
}

function extractShellCommand(args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    const lower = arg.toLowerCase();
    if (lower === "--command" || /^-[a-z]*c[a-z]*$/i.test(lower)) return args.slice(index + 1).join(" ");
  }
  return null;
}

function extractArgumentTail(args: readonly string[], flags: ReadonlySet<string>): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg !== null && flags.has(arg.toLowerCase())) return args.slice(index + 1).join(" ");
  }
  return null;
}

function extractWslCommand(args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = sanitizeValue(args[index]);
    if (arg === null) continue;
    const lower = arg.toLowerCase();
    if (lower === "--" || lower === "-e" || lower === "--exec") return args.slice(index + 1).join(" ");
    if (lower === "-d" || lower === "--distribution" || lower === "-u" || lower === "--user" || lower === "--cd") {
      index += 1;
      continue;
    }
    if (lower.startsWith("-")) continue;
    return args.slice(index).join(" ");
  }
  return null;
}

function splitCompoundCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  const pushCurrent = () => {
    const value = cleanSegment(current);
    if (value.length > 0) parts.push(value);
    current = "";
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1] ?? "";
    if (quote !== null) {
      if (char === quote && !isEscaped(command, index)) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if ((char === '"' || char === "'") && shouldStartQuote(command, index, current)) {
      quote = char;
      continue;
    }
    if (char === "\r" || char === "\n" || char === ";") {
      pushCurrent();
      continue;
    }
    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushCurrent();
      index += 1;
      continue;
    }
    if (char === "|") {
      pushCurrent();
      continue;
    }
    current += char;
  }

  pushCurrent();
  return parts;
}

function combineCommandIntents(intents: readonly AtomicCommandIntent[]): CommandIntent {
  const editIntents = intents.filter((intent): intent is Extract<AtomicCommandIntent, { readonly kind: "editFile" }> => intent.kind === "editFile");
  if (editIntents.length > 0) {
    const editPaths = uniquePaths(editIntents.flatMap((intent) => (intent.path === null ? [] : [intent.path])));
    return { kind: "editFile", path: editPaths.length === 1 ? editPaths[0] : null };
  }

  const searchContent = findLastIntent(intents, "searchContent");
  if (searchContent !== null) return searchContent;

  const searchFiles = findLastIntent(intents, "searchFiles");
  if (searchFiles !== null) return searchFiles;

  const readPaths = uniquePaths(
    intents
      .filter((intent): intent is Extract<AtomicCommandIntent, { readonly kind: "readFile" }> => intent.kind === "readFile")
      .map((intent) => intent.path),
  );
  if (readPaths.length === 1) return { kind: "readFile", path: readPaths[0] };
  if (readPaths.length > 1) return { kind: "readFiles", paths: readPaths };

  const listDir = findLastIntent(intents, "listDir");
  if (listDir !== null) return listDir;

  return { kind: "editFile", path: null };
}

function findLastIntent<Kind extends AtomicCommandIntent["kind"]>(
  intents: readonly AtomicCommandIntent[],
  kind: Kind,
): Extract<AtomicCommandIntent, { readonly kind: Kind }> | null {
  for (let index = intents.length - 1; index >= 0; index -= 1) {
    const intent = intents[index];
    if (intent.kind === kind) return intent as Extract<AtomicCommandIntent, { readonly kind: Kind }>;
  }
  return null;
}

function uniquePaths(paths: readonly string[]): string[] {
  return Array.from(new Set(paths));
}

function cleanSegment(value: string): string {
  return value.trim().replace(/^[{}()\[\]]+/, "").replace(/[{}()\[\]]+$/, "").trim();
}

function normalizeProgram(value: string): string {
  return stripExecutableExtension(baseName(value)).toLowerCase();
}

function baseName(value: string): string {
  const sanitized = sanitizeValue(value) ?? value;
  return sanitized.split(/[\\/]/).at(-1) ?? sanitized;
}

function stripExecutableExtension(value: string): string {
  return value.replace(/\.(?:exe|cmd|bat|ps1)$/i, "");
}

function looksLikePseudoCommand(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("$") || trimmed.includes("=") || trimmed.includes("::");
}

function sanitizeValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const sanitized = value
    .trim()
    .replace(/\\(["'])/g, "$1")
    .replace(/[`"']/g, "")
    .replace(/^[{}()\[\]]+/, "")
    .replace(/[{}()\[\],;]+$/, "")
    .trim();
  return sanitized.length > 0 ? sanitized : null;
}

function shouldStartQuote(command: string, index: number, current: string): boolean {
  if (isEscaped(command, index)) return false;
  if (current.length === 0) return true;
  const previous = command[index - 1] ?? "";
  return /\s|[=({\[,;|&]/.test(previous);
}

function isEscaped(command: string, index: number): boolean {
  let escapeCount = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = command[cursor];
    if (char !== "\\" && char !== "`") break;
    escapeCount += 1;
  }
  return escapeCount % 2 === 1;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote && !isEscaped(command, index)) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if ((char === '"' || char === "'") && shouldStartQuote(command, index, current)) {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}
