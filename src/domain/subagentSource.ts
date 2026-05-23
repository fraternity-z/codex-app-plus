export interface SubagentIdentity {
  readonly source?: unknown;
  readonly threadSource?: unknown;
  readonly isSubagent?: boolean;
  readonly agentNickname?: string | null;
  readonly agentRole?: string | null;
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSubagentSessionSource(source: unknown): boolean {
  return isRecord(source) && ("subAgent" in source || "subagent" in source);
}

export function isThreadLikeSubagent(thread: SubagentIdentity): boolean {
  return thread.isSubagent === true
    || isSubagentSessionSource(thread.source)
    || thread.threadSource === "subagent"
    || hasText(thread.agentNickname)
    || hasText(thread.agentRole);
}
