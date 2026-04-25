import { useCallback, useMemo } from "react";
import type { AgentEnvironment, HostBridge } from "../../../bridge/types";
import type { WorkspaceGitController } from "../model/types";
import { useWorkspaceGitActions } from "./useWorkspaceGitActions";
import { useWorkspaceGitAutoRefresh } from "./useWorkspaceGitAutoRefresh";
import { useWorkspaceGitData } from "./useWorkspaceGitData";
import { useWorkspaceGitState } from "./useWorkspaceGitState";

interface UseWorkspaceGitOptions {
  readonly diffStateEnabled?: boolean;
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly autoRefreshEnabled: boolean;
  readonly gitBranchPrefix: string;
  readonly gitPushForceWithLease: boolean;
  readonly gitCommitInstructions: string;
  readonly agentEnvironment?: AgentEnvironment;
}

export function useWorkspaceGit(options: UseWorkspaceGitOptions): WorkspaceGitController {
  const diffStateEnabled = options.diffStateEnabled ?? true;
  const state = useWorkspaceGitState(options.selectedRootPath);
  const data = useWorkspaceGitData({
    diffStateEnabled,
    hostBridge: options.hostBridge,
    selectedRootPath: options.selectedRootPath,
    state,
  });

  useWorkspaceGitAutoRefresh({
    enabled: options.autoRefreshEnabled,
    selectedRootPath: options.selectedRootPath,
    loading: state.loading,
    pendingAction: state.pendingAction,
    refresh: data.refresh,
  });

  const actions = useWorkspaceGitActions({
    hostBridge: options.hostBridge,
    selectedRootPath: options.selectedRootPath,
    status: state.status,
    commitMessage: state.commitMessage,
    commitInstructions: options.gitCommitInstructions,
    selectedBranch: state.selectedBranch,
    newBranchName: state.newBranchName,
    branchPrefix: options.gitBranchPrefix,
    pushForceWithLease: options.gitPushForceWithLease,
    agentEnvironment: options.agentEnvironment,
    setCommitMessage: state.setCommitMessage,
    setSelectedBranch: state.setSelectedBranch,
    setNewBranchName: state.setNewBranchName,
    setPendingAction: state.setPendingAction,
    setError: state.setError,
    setNotice: state.setNotice,
    setCommitDialogOpen: state.setCommitDialogOpen,
    setCommitDialogError: state.setCommitDialogError,
    refresh: data.refresh,
    invalidateBranchRefs: state.resetBranchRefsState,
    invalidateRemoteUrl: () => state.resetRemoteUrlState(false),
  });

  const clearDiff = useCallback(() => {
    state.setDiff(null);
    state.writeDiffTarget(null);
  }, [state.setDiff, state.writeDiffTarget]);

  return useMemo(() => ({
    loading: state.loading,
    pendingAction: state.pendingAction,
    status: state.status,
    statusLoaded: state.snapshot !== null,
    hasRepository: state.status?.isRepository ?? false,
    error: state.error,
    notice: state.notice,
    commitDialogOpen: state.commitDialogOpen,
    commitDialogError: state.commitDialogError,
    branchRefsLoading: state.branchRefsLoading,
    branchRefsLoaded: state.branchRefsLoaded,
    remoteUrlLoading: state.remoteUrlLoading,
    remoteUrlLoaded: state.remoteUrlLoaded,
    commitMessage: state.commitMessage,
    commitInstructions: options.gitCommitInstructions,
    selectedBranch: state.selectedBranch,
    newBranchName: state.newBranchName,
    diff: state.diff,
    diffCache: state.diffCache,
    diffTarget: state.diffTarget,
    loadingDiffKeys: state.loadingDiffKeys,
    staleDiffKeys: state.staleDiffKeys,
    refresh: data.refresh,
    initRepository: actions.initRepository,
    fetch: actions.fetch,
    pull: actions.pull,
    push: actions.push,
    stagePaths: actions.stagePaths,
    unstagePaths: actions.unstagePaths,
    discardPaths: actions.discardPaths,
    commit: actions.commit,
    openCommitDialog: actions.openCommitDialog,
    closeCommitDialog: actions.closeCommitDialog,
    checkoutBranch: actions.checkoutBranch,
    deleteBranch: actions.deleteBranch,
    createBranchFromName: actions.createBranchFromName,
    checkoutSelectedBranch: actions.checkoutSelectedBranch,
    createBranch: actions.createBranch,
    ensureBranchRefs: data.ensureBranchRefs,
    ensureRemoteUrl: data.ensureRemoteUrl,
    ensureDiff: data.ensureDiff,
    selectDiff: data.selectDiff,
    clearDiff,
    setCommitMessage: state.setCommitMessage,
    setSelectedBranch: state.setSelectedBranch,
    setNewBranchName: state.setNewBranchName,
  }), [
    actions.checkoutBranch,
    actions.checkoutSelectedBranch,
    actions.closeCommitDialog,
    actions.commit,
    actions.createBranch,
    actions.createBranchFromName,
    actions.deleteBranch,
    actions.discardPaths,
    actions.fetch,
    actions.initRepository,
    actions.openCommitDialog,
    actions.pull,
    actions.push,
    actions.stagePaths,
    actions.unstagePaths,
    clearDiff,
    data.ensureBranchRefs,
    data.ensureDiff,
    data.ensureRemoteUrl,
    data.refresh,
    data.selectDiff,
    state.branchRefsLoaded,
    state.branchRefsLoading,
    state.commitDialogError,
    state.commitDialogOpen,
    state.commitMessage,
    options.gitCommitInstructions,
    state.diff,
    state.diffCache,
    state.diffTarget,
    state.error,
    state.loading,
    state.loadingDiffKeys,
    state.newBranchName,
    state.notice,
    state.pendingAction,
    state.remoteUrlLoaded,
    state.remoteUrlLoading,
    state.selectedBranch,
    state.snapshot,
    state.staleDiffKeys,
    state.status,
  ]);
}
