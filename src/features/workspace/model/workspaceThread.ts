import type { ThreadSummary } from "../../../domain/types";
import { normalizeWorkspacePath } from "./workspacePath";

const SESSION_RETENTION_DAY_MS = 24 * 60 * 60 * 1000;

function toUpdatedAtTimestamp(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSubagentThread(
  thread: Pick<ThreadSummary, "isSubagent" | "agentNickname" | "agentRole">,
): boolean {
  return thread.isSubagent === true || hasText(thread.agentNickname) || hasText(thread.agentRole);
}

function pathDepth(value: string | null): number {
  if (value === null) {
    return 0;
  }
  return normalizeWorkspacePath(value)
    .split("/")
    .filter((part) => part.length > 0).length;
}

export function threadBelongsToWorkspace(
  threadPath: string | null,
  workspacePath: string | null,
): boolean {
  if (workspacePath === null) {
    return false;
  }
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  if (normalizedWorkspacePath.length === 0) {
    return false;
  }
  const normalizedThreadPath = normalizeWorkspacePath(threadPath ?? "");
  if (normalizedThreadPath.length === 0) {
    return false;
  }
  return normalizedThreadPath === normalizedWorkspacePath
    || normalizedThreadPath.startsWith(`${normalizedWorkspacePath}/`);
}

export function listThreadsForWorkspace(
  threads: ReadonlyArray<ThreadSummary>,
  workspacePath: string | null
): ReadonlyArray<ThreadSummary> {
  if (workspacePath === null) {
    return [];
  }

  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  if (normalizedWorkspacePath.length === 0) {
    return [];
  }

  return [...threads]
    .filter((thread) => !isSubagentThread(thread) && threadBelongsToWorkspace(thread.cwd, normalizedWorkspacePath))
    .sort((left, right) => {
      const updatedAtDelta = toUpdatedAtTimestamp(right.updatedAt) - toUpdatedAtTimestamp(left.updatedAt);
      if (updatedAtDelta !== 0) {
        return updatedAtDelta;
      }
      return pathDepth(left.cwd) - pathDepth(right.cwd);
    });
}

export function findLatestThreadForWorkspace(
  threads: ReadonlyArray<ThreadSummary>,
  workspacePath: string | null
): ThreadSummary | null {
  return listThreadsForWorkspace(threads, workspacePath)[0] ?? null;
}

export function parseSessionRetentionDays(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const days = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(days) ? days : null;
}

export function listWorkspaceSessionCleanupCandidates(
  threads: ReadonlyArray<ThreadSummary>,
  workspacePath: string | null,
  retentionDays: number,
  nowMs = Date.now(),
): ReadonlyArray<ThreadSummary> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 0) {
    return [];
  }
  const cutoff = nowMs - retentionDays * SESSION_RETENTION_DAY_MS;
  return listThreadsForWorkspace(threads, workspacePath).filter((thread) => {
    const updatedAt = Date.parse(thread.updatedAt);
    return Number.isNaN(updatedAt) ? false : updatedAt < cutoff;
  });
}
