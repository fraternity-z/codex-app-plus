import { useCallback, useEffect } from "react";
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
  const diffControls = useWorkspaceGitDiff(options);

  const refreshSnapshot = useRefreshSnapshot({
    diffControls,
    diffStateEnabled,
    hostBridge,
    selectedRootPath,
    state,
  });
  const refresh = useCallback(async () => {
    await refreshSnapshot("incremental");
  }, [refreshSnapshot]);
  const ensureBranchRefs = useEnsureBranchRefs({ hostBridge, selectedRootPath, state });
  const ensureRemoteUrl = useEnsureRemoteUrl({ hostBridge, selectedRootPath, state });

  useEffect(() => {
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
    ensureDiff: diffControls.ensureDiff,
    selectDiff: diffControls.selectDiff,
  };
}

function useRefreshSnapshot(options: {
  readonly diffControls: ReturnType<typeof useWorkspaceGitDiff>;
  readonly diffStateEnabled: boolean;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}) {
  const { diffControls, diffStateEnabled, hostBridge, selectedRootPath, state } = options;

  return useCallback(async (mode: RefreshMode) => {
    if (selectedRootPath === null) {
      state.clearTransientState();
      state.previousRootRef.current = null;
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = state.requestIdRef.current + 1;
    state.requestIdRef.current = requestId;
    state.setLoading(true);
    state.setError(null);

    try {
      const nextSnapshot = await hostBridge.git.getStatusSnapshot({ repoPath });
      if (requestId !== state.requestIdRef.current) {
        return;
      }

      if (!nextSnapshot.isRepository) {
        state.resetBranchRefsState();
      }
      syncRemoteMetadata(nextSnapshot, state.snapshotRef.current, state.resetRemoteUrlState);
      state.writeSnapshot(nextSnapshot);

      const nextStatus = toStatus(
        nextSnapshot,
        state.branchRefsRef.current,
        state.branchRefsLoadedRef.current,
        state.remoteUrlRef.current,
        state.remoteUrlLoadedRef.current,
      );
      if (nextStatus === null) {
        return;
      }

      state.setSelectedBranch(pickBranchName(nextStatus, state.selectedBranchRef.current));
      if (!diffStateEnabled) {
        state.writeDiffCache({});
        state.writeDiffTarget(null);
        state.writeLoadingDiffKeys([]);
        state.writeStaleDiffKeys([]);
        return;
      }

      const nextCache = pruneDiffCache(state.diffCacheRef.current, nextStatus);
      state.writeDiffCache(nextCache);
      state.writeStaleDiffKeys(createStaleDiffKeys(nextStatus));
      await diffControls.syncSelectedDiff({ repoPath, requestId, nextCache, nextStatus });
    } catch (reason) {
      if (requestId !== state.requestIdRef.current) {
        return;
      }
      if (mode === "initial") {
        state.resetRepositoryState();
      }
      state.setError(String(reason));
    } finally {
      if (requestId === state.requestIdRef.current) {
        state.setLoading(false);
      }
    }
  }, [
    diffControls,
    diffStateEnabled,
    hostBridge.git,
    selectedRootPath,
    state,
  ]);
}

function useEnsureBranchRefs(options: {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}) {
  const { hostBridge, selectedRootPath, state } = options;

  return useCallback(async () => {
    const currentSnapshot = state.snapshotRef.current;
    if (
      selectedRootPath === null
      || currentSnapshot === null
      || !currentSnapshot.isRepository
      || state.branchRefsLoadedRef.current
      || state.branchRefsLoading
    ) {
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = state.branchRefsRequestIdRef.current + 1;
    state.branchRefsRequestIdRef.current = requestId;
    state.setBranchRefsLoading(true);
    try {
      const nextBranchRefs = await hostBridge.git.getBranchRefs({ repoPath });
      if (requestId !== state.branchRefsRequestIdRef.current || state.selectedRootRef.current !== repoPath) {
        return;
      }
      state.writeBranchRefs(nextBranchRefs);
      state.writeBranchRefsLoaded(true);
      state.setSelectedBranch(pickBranchName(
        toStatus(currentSnapshot, nextBranchRefs, true, state.remoteUrlRef.current, state.remoteUrlLoadedRef.current),
        state.selectedBranchRef.current,
      ));
    } catch (reason) {
      if (requestId === state.branchRefsRequestIdRef.current && state.selectedRootRef.current === repoPath) {
        state.setNotice({ kind: "error", text: formatActionError("加载分支", reason) });
      }
    } finally {
      if (requestId === state.branchRefsRequestIdRef.current && state.selectedRootRef.current === repoPath) {
        state.setBranchRefsLoading(false);
      }
    }
  }, [hostBridge.git, selectedRootPath, state]);
}

function useEnsureRemoteUrl(options: {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly state: WorkspaceGitState;
}) {
  const { hostBridge, selectedRootPath, state } = options;

  return useCallback(async () => {
    const currentSnapshot = state.snapshotRef.current;
    if (
      selectedRootPath === null
      || currentSnapshot === null
      || !currentSnapshot.isRepository
      || state.remoteUrlLoading
      || state.remoteUrlLoadedRef.current
    ) {
      return;
    }
    if (currentSnapshot.remoteName === null) {
      state.resetRemoteUrlState(true);
      return;
    }

    const repoPath = selectedRootPath;
    const requestId = state.remoteUrlRequestIdRef.current + 1;
    state.remoteUrlRequestIdRef.current = requestId;
    state.setRemoteUrlLoading(true);
    try {
      const nextRemoteUrl = await hostBridge.git.getRemoteUrl({
        repoPath,
        remoteName: currentSnapshot.remoteName,
      });
      if (requestId !== state.remoteUrlRequestIdRef.current || state.selectedRootRef.current !== repoPath) {
        return;
      }
      state.writeRemoteUrl(nextRemoteUrl);
      state.writeRemoteUrlLoaded(true);
    } catch (reason) {
      if (requestId === state.remoteUrlRequestIdRef.current && state.selectedRootRef.current === repoPath) {
        state.setNotice({ kind: "error", text: formatActionError("加载远端地址", reason) });
      }
    } finally {
      if (requestId === state.remoteUrlRequestIdRef.current && state.selectedRootRef.current === repoPath) {
        state.setRemoteUrlLoading(false);
      }
    }
  }, [hostBridge.git, selectedRootPath, state]);
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
