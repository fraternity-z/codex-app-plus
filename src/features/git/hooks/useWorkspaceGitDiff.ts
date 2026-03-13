import { useCallback } from "react";
import type { GitDiffOutput, GitStatusOutput, HostBridge } from "../../../bridge/types";
import { createGitDiffKey } from "../model/gitDiffKey";
import type { WorkspaceGitState } from "./useWorkspaceGitState";
import {
  addLoadingDiffKey,
  findRetainedDiffTarget,
  formatActionError,
  isSameDiffTarget,
  removeLoadingDiffKey,
  removeStaleDiffKey,
  storeDiff,
  type GitDiffTarget,
} from "../model/workspaceGitHelpers";

interface UseWorkspaceGitDiffOptions {
  readonly diffStateEnabled: boolean;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}

interface SyncSelectedDiffInput {
  readonly repoPath: string;
  readonly requestId: number;
  readonly nextCache: Readonly<Record<string, GitDiffOutput>>;
  readonly nextStatus: GitStatusOutput;
}

function createDiffTarget(path: string, staged: boolean): GitDiffTarget {
  return { path, staged };
}

function getMatchingDiff(diff: GitDiffOutput | null, target: GitDiffTarget | null): GitDiffOutput | null {
  if (diff === null || target === null) {
    return null;
  }
  return diff.path === target.path && diff.staged === target.staged ? diff : null;
}

export function useWorkspaceGitDiff(options: UseWorkspaceGitDiffOptions) {
  const {
    diffStateEnabled,
    hostBridge,
    selectedRootPath,
    state,
  } = options;
  const {
    requestIdRef,
    selectionIdRef,
    diffCacheRef,
    diffTargetRef,
    loadingDiffKeysRef,
    staleDiffKeysRef,
    setDiff,
    setNotice,
    writeDiffCache,
    writeDiffTarget,
    writeLoadingDiffKeys,
    writeStaleDiffKeys,
    diff,
  } = state;

  const loadDiff = useCallback(async (repoPath: string, target: GitDiffTarget): Promise<GitDiffOutput> => {
    const diffKey = createGitDiffKey(target.path, target.staged);
    writeLoadingDiffKeys(addLoadingDiffKey(loadingDiffKeysRef.current, diffKey));
    try {
      const nextDiff = await hostBridge.git.getDiff({
        repoPath,
        path: target.path,
        staged: target.staged,
      });
      writeDiffCache(storeDiff(diffCacheRef.current, nextDiff));
      writeStaleDiffKeys(removeStaleDiffKey(staleDiffKeysRef.current, diffKey));
      return nextDiff;
    } finally {
      writeLoadingDiffKeys(removeLoadingDiffKey(loadingDiffKeysRef.current, diffKey));
    }
  }, [
    diffCacheRef,
    hostBridge.git,
    loadingDiffKeysRef,
    staleDiffKeysRef,
    writeDiffCache,
    writeLoadingDiffKeys,
    writeStaleDiffKeys,
  ]);

  const syncSelectedDiff = useCallback(async (input: SyncSelectedDiffInput) => {
    const nextTarget = findRetainedDiffTarget(input.nextStatus, diffTargetRef.current);
    if (nextTarget === null) {
      if (input.requestId === requestIdRef.current) {
        setDiff(null);
        writeDiffTarget(null);
      }
      return;
    }

    const diffKey = createGitDiffKey(nextTarget.path, nextTarget.staged);
    const cachedDiff = input.nextCache[diffKey] ?? null;
    if (input.requestId === requestIdRef.current) {
      writeDiffTarget(nextTarget);
      if (cachedDiff !== null) {
        setDiff(cachedDiff);
      }
    }

    const nextDiff = await loadDiff(input.repoPath, nextTarget);
    if (input.requestId === requestIdRef.current && isSameDiffTarget(diffTargetRef.current, nextTarget)) {
      setDiff(nextDiff);
    }
  }, [diffTargetRef, loadDiff, requestIdRef, setDiff, writeDiffTarget]);

  const selectDiff = useCallback(async (path: string, staged: boolean) => {
    if (!diffStateEnabled || selectedRootPath === null) {
      return;
    }

    const selectionId = selectionIdRef.current + 1;
    selectionIdRef.current = selectionId;
    const nextTarget = createDiffTarget(path, staged);
    const diffKey = createGitDiffKey(path, staged);
    const cachedDiff = diffCacheRef.current[diffKey] ?? null;
    writeDiffTarget(nextTarget);

    const matchedDiff = getMatchingDiff(diff, nextTarget);
    if (cachedDiff !== null) {
      setDiff(cachedDiff);
    } else if (matchedDiff === null) {
      setDiff(null);
    }
    if (cachedDiff !== null && !staleDiffKeysRef.current.includes(diffKey)) {
      return;
    }

    try {
      const nextDiff = await loadDiff(selectedRootPath, nextTarget);
      if (selectionId === selectionIdRef.current && isSameDiffTarget(diffTargetRef.current, nextTarget)) {
        setDiff(nextDiff);
      }
    } catch (reason) {
      setNotice({ kind: "error", text: formatActionError("加载差异", reason) });
    }
  }, [
    diff,
    diffCacheRef,
    diffStateEnabled,
    diffTargetRef,
    loadDiff,
    selectedRootPath,
    selectionIdRef,
    setDiff,
    setNotice,
    staleDiffKeysRef,
    writeDiffTarget,
  ]);

  const ensureDiff = useCallback(async (path: string, staged: boolean) => {
    if (!diffStateEnabled || selectedRootPath === null) {
      return;
    }

    const diffKey = createGitDiffKey(path, staged);
    const hasFreshDiff = diffCacheRef.current[diffKey] !== undefined
      && !staleDiffKeysRef.current.includes(diffKey);
    if (hasFreshDiff || loadingDiffKeysRef.current.includes(diffKey)) {
      return;
    }

    try {
      await loadDiff(selectedRootPath, createDiffTarget(path, staged));
    } catch (reason) {
      setNotice({ kind: "error", text: formatActionError("加载差异", reason) });
    }
  }, [
    diffCacheRef,
    diffStateEnabled,
    loadDiff,
    loadingDiffKeysRef,
    selectedRootPath,
    setNotice,
    staleDiffKeysRef,
  ]);

  return {
    ensureDiff,
    selectDiff,
    syncSelectedDiff,
  };
}
