import type { ThreadSummary } from "../../../domain/types";
import { normalizeWorkspacePath } from "./workspacePath";

function toUpdatedAtTimestamp(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
    .filter((thread) => threadBelongsToWorkspace(thread.cwd, normalizedWorkspacePath))
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
