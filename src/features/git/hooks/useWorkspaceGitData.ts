import { useCallback, useLayoutEffect } from "react";
import type { GitBranchRef, GitStatusSnapshotOutput, HostBridge } from "../../../bridge/types";
import type { WorkspaceGitState } from "./useWorkspaceGitState";
import { useWorkspaceGitDiff } from "./useWorkspaceGitDiff";
import { composeGitStatus } from "../model/workspaceGitStatus";
import {
  createStaleDiffKeys,
  formatActionError,
  pickBranchName,
  pruneDiffCache,
} from "../model/workspaceGitHelpers";

type RefreshMode = "initial" | "incremental";

interface UseWorkspaceGitDataOptions {
  readonly diffStateEnabled: boolean;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}

function toStatus(
  snapshot: GitStatusSnapshotOutput,
  branchRefs: ReadonlyArray<GitBranchRef>,
  branchRefsLoaded: boolean,
  remoteUrl: string | null,
  remoteUrlLoaded: boolean,
) {
  return composeGitStatus(snapshot, branchRefs, branchRefsLoaded, remoteUrl, remoteUrlLoaded);
}

export function useWorkspaceGitData(options: UseWorkspaceGitDataOptions) {
  const { state, selectedRootPath, diffStateEnabled, hostBridge } = options;
  const { ensureDiff, selectDiff, syncSelectedDiff } = useWorkspaceGitDiff(options);

  const refreshSnapshot = useRefreshSnapshot({
    diffStateEnabled,
    hostBridge,
    selectedRootPath,
    state,
    syncSelectedDiff,
  });
  const refresh = useCallback(async () => {
    await refreshSnapshot("incremental");
  }, [refreshSnapshot]);
  const ensureBranchRefs = useEnsureBranchRefs({ hostBridge, selectedRootPath, state });
  const ensureRemoteUrl = useEnsureRemoteUrl({ hostBridge, selectedRootPath, state });

  useLayoutEffect(() => {
    const previousRootPath = state.previousRootRef.current;
    state.previousRootRef.current = selectedRootPath;
    if (selectedRootPath === null) {
      state.clearTransientState();
      return;
    }
    if (previousRootPath !== selectedRootPath) {
      state.resetRepositoryState();
      void refreshSnapshot("initial");
    }
  }, [
    refreshSnapshot,
    selectedRootPath,
    state.clearTransientState,
    state.previousRootRef,
    state.resetRepositoryState,
  ]);

  return {
    refresh,
    ensureBranchRefs,
    ensureRemoteUrl,
    ensureDiff,
    selectDiff,
  };
}

function useRefreshSnapshot(options: {
  readonly diffStateEnabled: boolean;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
  readonly syncSelectedDiff: ReturnType<typeof useWorkspaceGitDiff>["syncSelectedDiff"];
}) {
  const { diffStateEnabled, hostBridge, selectedRootPath, state, syncSelectedDiff } = options;
  const {
    branchRefsLoadedRef,
    branchRefsRef,
    clearTransientState,
    diffCacheRef,
    previousRootRef,
    remoteUrlLoadedRef,
    remoteUrlRef,
    requestIdRef,
    resetBranchRefsState,
    resetRemoteUrlState,
    resetRepositoryState,
    selectedBranchRef,
    setError,
    setLoading,
    setSelectedBranch,
    snapshotRef,
    writeDiffCache,
    writeDiffTarget,
    writeLoadingDiffKeys,
    writeSnapshot,
    writeStaleDiffKeys,
  } = state;

  return useCallback(async (mode: RefreshMode) => {
    if (selectedRootPath === null) {
      clearTransientState();
      previousRootRef.current = null;
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await hostBridge.git.getStatusSnapshot({ repoPath });
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!nextSnapshot.isRepository) {
        resetBranchRefsState();
      }
      syncRemoteMetadata(nextSnapshot, snapshotRef.current, resetRemoteUrlState);
      writeSnapshot(nextSnapshot);

      const nextStatus = toStatus(
        nextSnapshot,
        branchRefsRef.current,
        branchRefsLoadedRef.current,
        remoteUrlRef.current,
        remoteUrlLoadedRef.current,
      );
      if (nextStatus === null) {
        return;
      }

      setSelectedBranch(pickBranchName(nextStatus, selectedBranchRef.current));
      if (!diffStateEnabled) {
        writeDiffCache({});
        writeDiffTarget(null);
        writeLoadingDiffKeys([]);
        writeStaleDiffKeys([]);
        return;
      }

      const nextCache = pruneDiffCache(diffCacheRef.current, nextStatus);
      writeDiffCache(nextCache);
      writeStaleDiffKeys(createStaleDiffKeys(nextStatus));
      await syncSelectedDiff({ repoPath, requestId, nextCache, nextStatus });
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
  }, [
    diffStateEnabled,
    clearTransientState,
    branchRefsLoadedRef,
    branchRefsRef,
    diffCacheRef,
    hostBridge.git,
    previousRootRef,
    remoteUrlLoadedRef,
    remoteUrlRef,
    requestIdRef,
    resetBranchRefsState,
    resetRemoteUrlState,
    resetRepositoryState,
    selectedRootPath,
    selectedBranchRef,
    setError,
    setLoading,
    setSelectedBranch,
    snapshotRef,
    syncSelectedDiff,
    writeDiffCache,
    writeDiffTarget,
    writeLoadingDiffKeys,
    writeSnapshot,
    writeStaleDiffKeys,
  ]);
}

function useEnsureBranchRefs(options: {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}) {
  const { hostBridge, selectedRootPath, state } = options;
  const {
    branchRefsLoadedRef,
    branchRefsLoading,
    branchRefsRequestIdRef,
    remoteUrlLoadedRef,
    remoteUrlRef,
    selectedBranchRef,
    selectedRootRef,
    setBranchRefsLoading,
    setNotice,
    setSelectedBranch,
    snapshotRef,
    writeBranchRefs,
    writeBranchRefsLoaded,
  } = state;

  return useCallback(async () => {
    const currentSnapshot = snapshotRef.current;
    if (
      selectedRootPath === null
      || currentSnapshot === null
      || !currentSnapshot.isRepository
      || branchRefsLoadedRef.current
      || branchRefsLoading
    ) {
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = branchRefsRequestIdRef.current + 1;
    branchRefsRequestIdRef.current = requestId;
    setBranchRefsLoading(true);
    try {
      const nextBranchRefs = await hostBridge.git.getBranchRefs({ repoPath });
      if (requestId !== branchRefsRequestIdRef.current || selectedRootRef.current !== repoPath) {
        return;
      }
      writeBranchRefs(nextBranchRefs);
      writeBranchRefsLoaded(true);
      setSelectedBranch(pickBranchName(
        toStatus(currentSnapshot, nextBranchRefs, true, remoteUrlRef.current, remoteUrlLoadedRef.current),
        selectedBranchRef.current,
      ));
    } catch (reason) {
      if (requestId === branchRefsRequestIdRef.current && selectedRootRef.current === repoPath) {
        setNotice({ kind: "error", text: formatActionError("加载分支", reason) });
      }
    } finally {
      if (requestId === branchRefsRequestIdRef.current && selectedRootRef.current === repoPath) {
        setBranchRefsLoading(false);
      }
    }
  }, [
    branchRefsLoadedRef,
    branchRefsLoading,
    branchRefsRequestIdRef,
    hostBridge.git,
    remoteUrlLoadedRef,
    remoteUrlRef,
    selectedBranchRef,
    selectedRootPath,
    selectedRootRef,
    setBranchRefsLoading,
    setNotice,
    setSelectedBranch,
    snapshotRef,
    writeBranchRefs,
    writeBranchRefsLoaded,
  ]);
}

function useEnsureRemoteUrl(options: {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}) {
  const { hostBridge, selectedRootPath, state } = options;
  const {
    remoteUrlLoadedRef,
    remoteUrlLoading,
    remoteUrlRequestIdRef,
    resetRemoteUrlState,
    selectedRootRef,
    setNotice,
    setRemoteUrlLoading,
    snapshotRef,
    writeRemoteUrl,
    writeRemoteUrlLoaded,
  } = state;

  return useCallback(async () => {
    const currentSnapshot = snapshotRef.current;
    if (
      selectedRootPath === null
      || currentSnapshot === null
      || !currentSnapshot.isRepository
      || remoteUrlLoading
      || remoteUrlLoadedRef.current
    ) {
      return;
    }
    if (currentSnapshot.remoteName === null) {
      resetRemoteUrlState(true);
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = remoteUrlRequestIdRef.current + 1;
    remoteUrlRequestIdRef.current = requestId;
    setRemoteUrlLoading(true);
    try {
      const nextRemoteUrl = await hostBridge.git.getRemoteUrl({
        repoPath,
        remoteName: currentSnapshot.remoteName,
      });
      if (requestId !== remoteUrlRequestIdRef.current || selectedRootRef.current !== repoPath) {
        return;
      }
      writeRemoteUrl(nextRemoteUrl);
      writeRemoteUrlLoaded(true);
    } catch (reason) {
      if (requestId === remoteUrlRequestIdRef.current && selectedRootRef.current === repoPath) {
        setNotice({ kind: "error", text: formatActionError("加载远端地址", reason) });
      }
    } finally {
      if (requestId === remoteUrlRequestIdRef.current && selectedRootRef.current === repoPath) {
        setRemoteUrlLoading(false);
      }
    }
  }, [
    hostBridge.git,
    remoteUrlLoadedRef,
    remoteUrlLoading,
    remoteUrlRequestIdRef,
    resetRemoteUrlState,
    selectedRootPath,
    selectedRootRef,
    setNotice,
    setRemoteUrlLoading,
    snapshotRef,
    writeRemoteUrl,
    writeRemoteUrlLoaded,
  ]);
}

function syncRemoteMetadata(
  nextSnapshot: GitStatusSnapshotOutput,
  previousSnapshot: GitStatusSnapshotOutput | null,
  resetRemoteUrlState: (loaded: boolean) => void,
): void {
  if (nextSnapshot.remoteName === null) {
    resetRemoteUrlState(true);
    return;
  }
  if (nextSnapshot.remoteName !== previousSnapshot?.remoteName) {
    resetRemoteUrlState(false);
  }
}
