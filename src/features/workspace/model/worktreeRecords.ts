import type { GitWorktreeEntry } from "../../../bridge/types";
import type { ManagedWorktreeRecord, WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import { normalizeWorkspacePath, trimWorkspaceText } from "./workspacePath";

export function createManagedWorktreePathSet(
  records: ReadonlyArray<ManagedWorktreeRecord>,
  extraPaths: ReadonlyArray<string> = [],
  excludedPaths: ReadonlyArray<string> = [],
): Set<string> {
  const excluded = new Set(excludedPaths.map(normalizeWorkspacePath).filter((path) => path.length > 0));
  const paths = new Set<string>();
  for (const record of records) {
    const key = normalizeWorkspacePath(record.path);
    if (key.length > 0 && !excluded.has(key)) {
      paths.add(key);
    }
  }
  for (const path of extraPaths) {
    const key = normalizeWorkspacePath(path);
    if (key.length > 0 && !excluded.has(key)) {
      paths.add(key);
    }
  }
  return paths;
}

export function createManagedWorktreeRecordMap(
  records: ReadonlyArray<ManagedWorktreeRecord>,
): Map<string, ManagedWorktreeRecord> {
  return new Map(records.map((record) => [normalizeWorkspacePath(record.path), record]));
}

export function findManagedWorktreeRecord(
  records: ReadonlyArray<ManagedWorktreeRecord>,
  path: string,
): ManagedWorktreeRecord | null {
  return createManagedWorktreeRecordMap(records).get(normalizeWorkspacePath(path)) ?? null;
}

export function isSameWorkspacePath(left: string, right: string): boolean {
  return normalizeWorkspacePath(left) === normalizeWorkspacePath(right);
}

export function filterManagedWorktreeEntries(
  entries: ReadonlyArray<GitWorktreeEntry>,
  records: ReadonlyArray<ManagedWorktreeRecord>,
  extraPaths: ReadonlyArray<string> = [],
  excludedPaths: ReadonlyArray<string> = [],
): ReadonlyArray<GitWorktreeEntry> {
  const managedPaths = createManagedWorktreePathSet(records, extraPaths, excludedPaths);
  return entries.filter((entry) => managedPaths.has(normalizeWorkspacePath(entry.path)));
}

export function createDefaultWorktreeProjectName(
  root: WorkspaceRoot | null,
  roots: ReadonlyArray<WorkspaceRoot>,
): string {
  const baseName = trimWorkspaceText(root?.name ?? "") || "worktree";
  const existingNames = new Set(roots.map((item) => trimWorkspaceText(item.name).toLowerCase()));
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName}_${index}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${baseName}_${Date.now()}`;
}
