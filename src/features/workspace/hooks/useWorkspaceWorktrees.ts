import { useCallback, useEffect, useMemo, useState } from "react";
import type { GitWorktreeEntry, HostBridge } from "../../../bridge/types";
import type { ManagedWorktreeRecord, WorkspaceRoot, WorkspaceRootController } from "./useWorkspaceRoots";
import {
  createManagedWorktreeRecordMap,
  filterManagedWorktreeEntries,
  findManagedWorktreeRecord,
  isSameWorkspacePath,
} from "../model/worktreeRecords";
import { normalizeWorkspacePath, trimWorkspaceText } from "../model/workspacePath";

interface UseWorkspaceWorktreesOptions {
  readonly hostBridge: HostBridge;
  readonly workspace: WorkspaceRootController;
  readonly selectedRootPath: string | null;
  readonly enabled?: boolean;
  readonly autoCleanupEnabled?: boolean;
  readonly autoCleanupRetention?: number;
  readonly reportError?: (message: string, error: unknown) => void;
}

export interface WorkspaceWorktreeController {
  readonly worktrees: ReadonlyArray<GitWorktreeEntry>;
  readonly managedWorktreeMap: ReadonlyMap<string, ManagedWorktreeRecord>;
  createStableWorktree: (root: WorkspaceRoot, projectName: string) => Promise<GitWorktreeEntry>;
  deleteManagedWorktree: (worktreePath: string) => Promise<void>;
  refreshWorktrees: (
    repoPath?: string | null,
    extraManagedPaths?: ReadonlyArray<string>,
    excludedManagedPaths?: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<GitWorktreeEntry>>;
}

const DEFAULT_AUTO_CLEANUP_RETENTION = 15;

function normalizeRetentionCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_CLEANUP_RETENTION;
  }
  return Math.max(1, Math.trunc(value));
}

function getCreatedAtTime(record: ManagedWorktreeRecord): number {
  const parsed = Date.parse(record.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function selectOldManagedWorktreesForCleanup(
  records: ReadonlyArray<ManagedWorktreeRecord>,
  retentionCount: number,
  protectedPaths: ReadonlyArray<string>,
): ReadonlyArray<ManagedWorktreeRecord> {
  const protectedPathSet = new Set(
    protectedPaths.map(normalizeWorkspacePath).filter((path) => path.length > 0),
  );
  return [...records]
    .sort((left, right) => getCreatedAtTime(right) - getCreatedAtTime(left))
    .slice(retentionCount)
    .filter((record) => !protectedPathSet.has(normalizeWorkspacePath(record.path)));
}

export function useWorkspaceWorktrees(options: UseWorkspaceWorktreesOptions): WorkspaceWorktreeController {
  const enabled = options.enabled ?? true;
  const autoCleanupEnabled = options.autoCleanupEnabled ?? false;
  const autoCleanupRetention = normalizeRetentionCount(options.autoCleanupRetention);
  const [worktrees, setWorktrees] = useState<ReadonlyArray<GitWorktreeEntry>>([]);
  const managedWorktreeMap = useMemo(
    () => createManagedWorktreeRecordMap(options.workspace.managedWorktrees),
    [options.workspace.managedWorktrees],
  );

  const refreshWorktrees = useCallback(async (
    repoPath: string | null = options.selectedRootPath,
    extraManagedPaths: ReadonlyArray<string> = [],
    excludedManagedPaths: ReadonlyArray<string> = [],
  ) => {
    if (!enabled || repoPath === null) {
      setWorktrees([]);
      return [];
    }
    const entries = await options.hostBridge.git.getWorktrees({ repoPath });
    const filtered = filterManagedWorktreeEntries(
      entries,
      options.workspace.managedWorktrees,
      extraManagedPaths,
      excludedManagedPaths,
    );
    setWorktrees(filtered);
    return filtered;
  }, [enabled, options.hostBridge.git, options.selectedRootPath, options.workspace.managedWorktrees]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || options.selectedRootPath === null) {
      setWorktrees([]);
      return;
    }

    void options.hostBridge.git.getWorktrees({ repoPath: options.selectedRootPath })
      .then((entries) => {
        if (!cancelled) {
          setWorktrees(filterManagedWorktreeEntries(entries, options.workspace.managedWorktrees));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setWorktrees([]);
          options.reportError?.("读取工作树失败", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    options.hostBridge.git,
    options.reportError,
    options.selectedRootPath,
    options.workspace.managedWorktrees,
  ]);

  const cleanupOldManagedWorktrees = useCallback(async (
    records: ReadonlyArray<ManagedWorktreeRecord>,
    protectedPaths: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<string>> => {
    if (!autoCleanupEnabled) {
      return [];
    }

    const candidates = selectOldManagedWorktreesForCleanup(
      records,
      autoCleanupRetention,
      protectedPaths,
    );
    const removedPaths: string[] = [];

    for (const candidate of candidates) {
      try {
        await options.hostBridge.git.removeWorktree({
          repoPath: candidate.repoPath,
          worktreePath: candidate.path,
        });
        const matchedRoot = options.workspace.roots.find((root) => isSameWorkspacePath(root.path, candidate.path));
        if (matchedRoot !== undefined) {
          options.workspace.removeRoot(matchedRoot.id);
        }
        options.workspace.removeManagedWorktree(candidate.path);
        removedPaths.push(candidate.path);
      } catch (error) {
        options.reportError?.("自动清理旧工作树失败", error);
      }
    }

    return removedPaths;
  }, [
    autoCleanupEnabled,
    autoCleanupRetention,
    options.hostBridge.git,
    options.reportError,
    options.workspace,
  ]);

  const createStableWorktree = useCallback(async (root: WorkspaceRoot, projectName: string) => {
    const normalizedName = trimWorkspaceText(projectName);
    if (normalizedName.length === 0) {
      throw new Error("项目名称不能为空。");
    }

    const created = await options.hostBridge.git.addWorktree({
      repoPath: root.path,
      name: normalizedName,
    });
    const createdAt = new Date().toISOString();
    options.workspace.addRoot({
      name: normalizedName,
      path: created.path,
    });
    options.workspace.addManagedWorktree({
      path: created.path,
      repoPath: root.path,
      branch: created.branch,
    });
    const cleanupRecords = [
      ...options.workspace.managedWorktrees.filter(
        (record) => !isSameWorkspacePath(record.path, created.path),
      ),
      {
        path: created.path,
        repoPath: root.path,
        branch: created.branch,
        createdAt,
      },
    ];
    const removedPaths = await cleanupOldManagedWorktrees(cleanupRecords, [created.path]);
    await refreshWorktrees(root.path, [created.path], removedPaths);
    return created;
  }, [cleanupOldManagedWorktrees, options.hostBridge.git, options.workspace, refreshWorktrees]);

  const deleteManagedWorktree = useCallback(async (worktreePath: string) => {
    const record = findManagedWorktreeRecord(options.workspace.managedWorktrees, worktreePath);
    const repoPath = record?.repoPath ?? options.selectedRootPath ?? worktreePath;
    await options.hostBridge.git.removeWorktree({
      repoPath,
      worktreePath,
    });
    const matchedRoot = options.workspace.roots.find((root) => isSameWorkspacePath(root.path, worktreePath));
    if (matchedRoot !== undefined) {
      options.workspace.removeRoot(matchedRoot.id);
    }
    options.workspace.removeManagedWorktree(worktreePath);
    await refreshWorktrees(repoPath, [], [worktreePath]);
  }, [
    options.hostBridge.git,
    options.selectedRootPath,
    options.workspace,
    options.workspace.managedWorktrees,
    options.workspace.roots,
    refreshWorktrees,
  ]);

  return useMemo(() => ({
    worktrees,
    managedWorktreeMap,
    createStableWorktree,
    deleteManagedWorktree,
    refreshWorktrees,
  }), [
    createStableWorktree,
    deleteManagedWorktree,
    managedWorktreeMap,
    refreshWorktrees,
    worktrees,
  ]);
}
