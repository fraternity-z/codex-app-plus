export interface SubagentIdentity {
  readonly source?: unknown;
  readonly threadSource?: unknown;
  readonly isSubagent?: boolean;
  readonly agentNickname?: string | null;
  readonly agentRole?: string | null;
}

export interface SubagentDisplayThread {
  readonly title: string;
  readonly agentNickname?: string | null;
  readonly agentRole?: string | null;
}

export interface SubagentDisplayMetadata {
  readonly detail: string | null;
  readonly label: string;
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readSubagentParentThreadId(source: unknown): string | null {
  if (!isRecord(source)) {
    return null;
  }
  const subagent = source.subAgent ?? source.subagent;
  if (!isRecord(subagent)) {
    return null;
  }
  const spawn = subagent.thread_spawn;
  if (!isRecord(spawn)) {
    return null;
  }
  const parentThreadId = spawn.parent_thread_id;
  return typeof parentThreadId === "string" && hasText(parentThreadId) ? parentThreadId : null;
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

export function createSubagentDisplayMetadata(
  thread: SubagentDisplayThread | null | undefined,
  fallbackId: string,
): SubagentDisplayMetadata {
  const nickname = thread?.agentNickname?.trim() ?? "";
  const title = thread?.title.trim() ?? "";
  const role = thread?.agentRole?.trim() ?? "";
  return {
    detail: role.length > 0 ? role : null,
    label: nickname || title || fallbackId,
  };
}
