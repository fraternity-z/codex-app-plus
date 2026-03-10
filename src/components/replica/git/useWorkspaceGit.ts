import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitDiffOutput, GitStatusOutput, HostBridge } from "../../../bridge/types";
import { createGitDiffKey } from "./gitDiffKey";
import type { GitNotice, WorkspaceGitController } from "./types";
import { useWorkspaceGitActions } from "./useWorkspaceGitActions";
import { useWorkspaceGitAutoRefresh } from "./useWorkspaceGitAutoRefresh";
import {
  addLoadingDiffKey,
  createStaleDiffKeys,
  findRetainedDiffTarget,
  formatActionError,
  isSameDiffTarget,
  pickBranchName,
  pruneDiffCache,
  removeLoadingDiffKey,
  removeStaleDiffKey,
  storeDiff,
  type GitDiffTarget
} from "./workspaceGitHelpers";

interface UseWorkspaceGitOptions {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly autoRefreshEnabled: boolean;
}

type RefreshMode = "initial" | "incremental";

function createDiffTarget(path: string, staged: boolean): GitDiffTarget {
  return { path, staged };
}

function getMatchingDiff(controllerDiff: GitDiffOutput | null, target: GitDiffTarget | null): GitDiffOutput | null {
  if (controllerDiff === null || target === null) {
    return null;
  }
  return controllerDiff.path === target.path && controllerDiff.staged === target.staged ? controllerDiff : null;
}

export function useWorkspaceGit(options: UseWorkspaceGitOptions): WorkspaceGitController {
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<GitStatusOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<GitNotice | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [diff, setDiff] = useState<GitDiffOutput | null>(null);
  const [diffCache, setDiffCache] = useState<Readonly<Record<string, GitDiffOutput>>>({});
  const [diffTarget, setDiffTarget] = useState<GitDiffTarget | null>(null);
  const [loadingDiffKeys, setLoadingDiffKeys] = useState<ReadonlyArray<string>>([]);
  const [staleDiffKeys, setStaleDiffKeys] = useState<ReadonlyArray<string>>([]);

  const requestIdRef = useRef(0);
  const selectionIdRef = useRef(0);
  const previousRootRef = useRef<string | null>(null);
  const diffCacheRef = useRef<Readonly<Record<string, GitDiffOutput>>>({});
  const diffTargetRef = useRef<GitDiffTarget | null>(null);
  const loadingDiffKeysRef = useRef<ReadonlyArray<string>>([]);
  const staleDiffKeysRef = useRef<ReadonlyArray<string>>([]);

  const writeDiffCache = useCallback((nextCache: Readonly<Record<string, GitDiffOutput>>) => {
    diffCacheRef.current = nextCache;
    setDiffCache(nextCache);
  }, []);

  const writeDiffTarget = useCallback((nextTarget: GitDiffTarget | null) => {
    diffTargetRef.current = nextTarget;
    setDiffTarget(nextTarget);
  }, []);

  const writeLoadingDiffKeys = useCallback((nextKeys: ReadonlyArray<string>) => {
    loadingDiffKeysRef.current = nextKeys;
    setLoadingDiffKeys(nextKeys);
  }, []);

  const writeStaleDiffKeys = useCallback((nextKeys: ReadonlyArray<string>) => {
    staleDiffKeysRef.current = nextKeys;
    setStaleDiffKeys(nextKeys);
  }, []);

  const resetRepositoryState = useCallback(() => {
    setStatus(null);
    setError(null);
    setNotice(null);
    setDiff(null);
    writeDiffCache({});
    writeDiffTarget(null);
    writeLoadingDiffKeys([]);
    writeStaleDiffKeys([]);
  }, [writeDiffCache, writeDiffTarget, writeLoadingDiffKeys, writeStaleDiffKeys]);

  const clearTransientState = useCallback(() => {
    resetRepositoryState();
    setCommitMessage("");
    setSelectedBranch("");
    setNewBranchName("");
  }, [resetRepositoryState]);

  const loadDiff = useCallback(
    async (repoPath: string, target: GitDiffTarget): Promise<GitDiffOutput> => {
      const diffKey = createGitDiffKey(target.path, target.staged);
      writeLoadingDiffKeys(addLoadingDiffKey(loadingDiffKeysRef.current, diffKey));
      try {
        const nextDiff = await options.hostBridge.git.getDiff({ repoPath, path: target.path, staged: target.staged });
        writeDiffCache(storeDiff(diffCacheRef.current, nextDiff));
        writeStaleDiffKeys(removeStaleDiffKey(staleDiffKeysRef.current, diffKey));
        return nextDiff;
      } finally {
        writeLoadingDiffKeys(removeLoadingDiffKey(loadingDiffKeysRef.current, diffKey));
      }
    },
    [options.hostBridge.git, writeDiffCache, writeLoadingDiffKeys, writeStaleDiffKeys]
  );

  const syncSelectedDiff = useCallback(
    async (
      repoPath: string,
      nextStatus: GitStatusOutput,
      requestId: number,
      nextCache: Readonly<Record<string, GitDiffOutput>>
    ) => {
      const nextTarget = findRetainedDiffTarget(nextStatus, diffTargetRef.current);
      if (nextTarget === null) {
        if (requestId === requestIdRef.current) {
          setDiff(null);
          writeDiffTarget(null);
        }
        return;
      }

      const diffKey = createGitDiffKey(nextTarget.path, nextTarget.staged);
      const cachedDiff = nextCache[diffKey] ?? null;
      if (requestId === requestIdRef.current) {
        writeDiffTarget(nextTarget);
        if (cachedDiff !== null) {
          setDiff(cachedDiff);
        }
      }

      const nextDiff = await loadDiff(repoPath, nextTarget);
      if (requestId === requestIdRef.current && isSameDiffTarget(diffTargetRef.current, nextTarget)) {
        setDiff(nextDiff);
      }
    },
    [loadDiff, writeDiffTarget]
  );

  const refreshSnapshot = useCallback(
    async (mode: RefreshMode) => {
      if (options.selectedRootPath === null) {
        clearTransientState();
        previousRootRef.current = null;
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoading(true);
      setError(null);

      try {
        const nextStatus = await options.hostBridge.git.getStatus({ repoPath: options.selectedRootPath });
        if (requestId !== requestIdRef.current) {
          return;
        }

        const nextCache = pruneDiffCache(diffCacheRef.current, nextStatus);
        writeDiffCache(nextCache);
        writeStaleDiffKeys(createStaleDiffKeys(nextStatus));
        setStatus(nextStatus);
        setSelectedBranch((currentBranch) => pickBranchName(nextStatus, currentBranch));
        await syncSelectedDiff(options.selectedRootPath, nextStatus, requestId, nextCache);
      } catch (reason) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        if (mode === "initial") {
          resetRepositoryState();
        }
        setError(String(reason));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [clearTransientState, options.hostBridge.git, options.selectedRootPath, resetRepositoryState, syncSelectedDiff, writeDiffCache, writeStaleDiffKeys]
  );

  const refresh = useCallback(async () => {
    await refreshSnapshot("incremental");
  }, [refreshSnapshot]);

  useEffect(() => {
    const previousRootPath = previousRootRef.current;
    previousRootRef.current = options.selectedRootPath;
    if (options.selectedRootPath === null) {
      clearTransientState();
      return;
    }
    if (previousRootPath !== options.selectedRootPath) {
      resetRepositoryState();
      void refreshSnapshot("initial");
    }
  }, [clearTransientState, options.selectedRootPath, refreshSnapshot, resetRepositoryState]);

  useWorkspaceGitAutoRefresh({
    enabled: options.autoRefreshEnabled,
    selectedRootPath: options.selectedRootPath,
    loading,
    pendingAction,
    refresh
  });

  const selectDiff = useCallback(
    async (path: string, staged: boolean) => {
      if (options.selectedRootPath === null) {
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
        const nextDiff = await loadDiff(options.selectedRootPath, nextTarget);
        if (selectionId === selectionIdRef.current && isSameDiffTarget(diffTargetRef.current, nextTarget)) {
          setDiff(nextDiff);
        }
      } catch (reason) {
        setNotice({ kind: "error", text: formatActionError("加载差异", reason) });
      }
    },
    [diff, loadDiff, options.selectedRootPath, writeDiffTarget]
  );

  const ensureDiff = useCallback(
    async (path: string, staged: boolean) => {
      if (options.selectedRootPath === null) {
        return;
      }
      const diffKey = createGitDiffKey(path, staged);
      const hasFreshDiff = diffCacheRef.current[diffKey] !== undefined && !staleDiffKeysRef.current.includes(diffKey);
      if (hasFreshDiff || loadingDiffKeysRef.current.includes(diffKey)) {
        return;
      }
      try {
        await loadDiff(options.selectedRootPath, createDiffTarget(path, staged));
      } catch (reason) {
        setNotice({ kind: "error", text: formatActionError("加载差异", reason) });
      }
    },
    [loadDiff, options.selectedRootPath]
  );

  const {
    initRepository,
    fetch,
    pull,
    push,
    stagePaths,
    unstagePaths,
    discardPaths,
    commit,
    checkoutBranch,
    createBranchFromName,
    checkoutSelectedBranch,
    createBranch
  } = useWorkspaceGitActions({
    hostBridge: options.hostBridge,
    selectedRootPath: options.selectedRootPath,
    commitMessage,
    selectedBranch,
    newBranchName,
    setCommitMessage,
    setSelectedBranch,
    setNewBranchName,
    setPendingAction,
    setError,
    setNotice,
    refresh
  });

  return useMemo(
    () => ({
      loading,
      pendingAction,
      status,
      statusLoaded: status !== null,
      hasRepository: status?.isRepository ?? false,
      error,
      notice,
      commitMessage,
      selectedBranch,
      newBranchName,
      diff,
      diffCache,
      diffTarget,
      loadingDiffKeys,
      staleDiffKeys,
      refresh,
      initRepository,
      fetch,
      pull,
      push,
      stagePaths,
      unstagePaths,
      discardPaths,
      commit,
      checkoutBranch,
      createBranchFromName,
      checkoutSelectedBranch,
      createBranch,
      ensureDiff,
      selectDiff,
      clearDiff: () => {
        setDiff(null);
        writeDiffTarget(null);
      },
      setCommitMessage,
      setSelectedBranch,
      setNewBranchName
    }),
    [
      checkoutBranch,
      checkoutSelectedBranch,
      commit,
      commitMessage,
      createBranch,
      createBranchFromName,
      diff,
      diffCache,
      diffTarget,
      discardPaths,
      ensureDiff,
      error,
      fetch,
      loading,
      loadingDiffKeys,
      initRepository,
      newBranchName,
      notice,
      options.hostBridge.git,
      pendingAction,
      pull,
      push,
      refresh,
      selectDiff,
      selectedBranch,
      stagePaths,
      staleDiffKeys,
      status,
      unstagePaths,
      writeDiffTarget
    ]
  );
}
