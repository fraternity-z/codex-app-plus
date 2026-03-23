import type { AgentEnvironment } from "../../../bridge/types";
import type { CommandApprovalRequest } from "../../../domain/serverRequests";
import type { CommandExecutionApprovalDecision } from "../../../protocol/generated/v2/CommandExecutionApprovalDecision";
import type { CommandExecutionRequestApprovalParams } from "../../../protocol/generated/v2/CommandExecutionRequestApprovalParams";

export type CommandApprovalAllowlist = Readonly<Record<string, ReadonlyArray<ReadonlyArray<string>>>>;

type CommandInfo = {
  readonly preview: string;
  readonly tokens: ReadonlyArray<string>;
};

const COMMAND_KEYS = [
  "argv",
  "args",
  "command",
  "cmd",
  "exec",
  "shellCommand",
  "script",
  "proposedExecpolicyAmendment",
  "proposed_execpolicy_amendment",
] as const;

export function appendCommandApprovalPrefix(
  allowlist: CommandApprovalAllowlist,
  scopeKey: string,
  prefix: ReadonlyArray<string>,
): CommandApprovalAllowlist {
  const normalized = normalizeCommandTokens(prefix);
  if (normalized.length === 0) {
    return allowlist;
  }
  const current = allowlist[scopeKey] ?? [];
  const exists = current.some((entry) => hasExactCommandPrefix(entry, normalized));
  if (exists) {
    return allowlist;
  }
  return { ...allowlist, [scopeKey]: [...current, normalized] };
}

export function buildCommandApprovalScopeKey(
  agentEnvironment: AgentEnvironment,
  request: Pick<CommandApprovalRequest, "threadId" | "params">,
): string {
  const cwd = request.params.cwd?.trim();
  const scope = cwd !== undefined && cwd.length > 0 ? cwd : `thread:${request.threadId}`;
  return `${agentEnvironment}:${scope}`;
}

export function extractCommandApprovalCommand(
  params: CommandExecutionRequestApprovalParams,
): CommandInfo | null {
  const tokens = extractTokens(params);
  if (tokens === null || tokens.length === 0) {
    return null;
  }
  return {
    preview: tokens.map((token) => token.includes(" ") ? JSON.stringify(token) : token).join(" "),
    tokens,
  };
}

export function extractRememberedCommandPrefix(
  params: CommandExecutionRequestApprovalParams,
): ReadonlyArray<string> | null {
  const preferred = normalizeCommandTokens(params.proposedExecpolicyAmendment ?? []);
  if (preferred.length > 0) {
    return preferred;
  }
  return extractCommandApprovalCommand(params)?.tokens ?? null;
}

export function isRememberCommandDecision(
  decision: CommandExecutionApprovalDecision,
): decision is Extract<CommandExecutionApprovalDecision, { acceptWithExecpolicyAmendment: unknown }> {
  return typeof decision === "object" && decision !== null && "acceptWithExecpolicyAmendment" in decision;
}

export function matchesCommandApprovalAllowlist(
  allowlist: CommandApprovalAllowlist,
  scopeKey: string,
  tokens: ReadonlyArray<string>,
): boolean {
  const normalized = normalizeCommandTokens(tokens);
  if (normalized.length === 0) {
    return false;
  }
  return (allowlist[scopeKey] ?? []).some((prefix) => isCommandPrefixMatch(prefix, normalized));
}

export function normalizeCommandTokens(tokens: ReadonlyArray<string>): ReadonlyArray<string> {
  return tokens.map((token) => token.trim()).filter((token) => token.length > 0);
}

function extractTokens(value: unknown): ReadonlyArray<string> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return extractStringArray(value);
  }
  if (typeof value === "string") {
    const tokens = splitCommandLine(value);
    return tokens.length > 0 ? tokens : null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of COMMAND_KEYS) {
    const tokens = extractTokens(record[key]);
    if (tokens !== null && tokens.length > 0) {
      return tokens;
    }
  }
  for (const [key, nested] of Object.entries(record)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("execpolicy") || normalized.includes("exec_policy")) {
      const tokens = extractTokens(nested);
      if (tokens !== null && tokens.length > 0) {
        return tokens;
      }
    }
  }
  return null;
}

function extractStringArray(value: ReadonlyArray<unknown>): ReadonlyArray<string> | null {
  if (!value.every((entry) => typeof entry === "string")) {
    return null;
  }
  const tokens = normalizeCommandTokens(value as ReadonlyArray<string>);
  return tokens.length > 0 ? tokens : null;
}

function hasExactCommandPrefix(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function isCommandPrefixMatch(
  prefix: ReadonlyArray<string>,
  command: ReadonlyArray<string>,
): boolean {
  if (prefix.length === 0 || prefix.length > command.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== command[index]) {
      return false;
    }
  }
  return true;
}

function splitCommandLine(input: string): ReadonlyArray<string> {
  const tokens: Array<string> = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote !== null) {
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
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

  if (current.length > 0) {
    tokens.push(current);
  }
  return normalizeCommandTokens(tokens);
}
