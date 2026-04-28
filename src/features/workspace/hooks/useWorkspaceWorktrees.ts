import { useCallback, useEffect, useMemo, useState } from "react";
import type { GitWorktreeEntry, HostBridge } from "../../../bridge/types";
import type { ManagedWorktreeRecord, WorkspaceRoot, WorkspaceRootController } from "./useWorkspaceRoots";
import {
  createManagedWorktreeRecordMap,
  filterManagedWorktreeEntries,
  findManagedWorktreeRecord,
  isSameWorkspacePath,
} from "../model/worktreeRecords";
import { trimWorkspaceText } from "../model/workspacePath";

interface UseWorkspaceWorktreesOptions {
  readonly hostBridge: HostBridge;
  readonly workspace: WorkspaceRootController;
  readonly selectedRootPath: string | null;
  readonly enabled?: boolean;
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

export function useWorkspaceWorktrees(options: UseWorkspaceWorktreesOptions): WorkspaceWorktreeController {
  const enabled = options.enabled ?? true;
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

  const createStableWorktree = useCallback(async (root: WorkspaceRoot, projectName: string) => {
    const normalizedName = trimWorkspaceText(projectName);
    if (normalizedName.length === 0) {
      throw new Error("项目名称不能为空。");
    }

    const created = await options.hostBridge.git.addWorktree({
      repoPath: root.path,
      name: normalizedName,
    });
    options.workspace.addRoot({
      name: normalizedName,
      path: created.path,
    });
    options.workspace.addManagedWorktree({
      path: created.path,
      repoPath: root.path,
      branch: created.branch,
    });
    await refreshWorktrees(root.path, [created.path]);
    return created;
  }, [options.hostBridge.git, options.workspace, refreshWorktrees]);

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
