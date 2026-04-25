import { useCallback } from "react";
import type { AgentEnvironment, HostBridge } from "../../../bridge/types";
import type { GitCommitFollowUp, GitCommitOptions, GitNotice } from "../model/types";
import {
  collectAutoStagePaths,
  formatActionError,
  hasCommitableChanges,
  hasUnresolvedConflicts,
  normalizePaths,
} from "../model/workspaceGitHelpers";
import type { GitStatusOutput } from "../../../bridge/types";

interface UseWorkspaceGitActionsOptions {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly status: GitStatusOutput | null;
  readonly commitMessage: string;
  readonly selectedBranch: string;
  readonly newBranchName: string;
  readonly branchPrefix: string;
  readonly pushForceWithLease: boolean;
  readonly commitInstructions: string;
  readonly agentEnvironment?: AgentEnvironment;
  readonly setCommitMessage: (value: string) => void;
  readonly setSelectedBranch: (value: string) => void;
  readonly setNewBranchName: (value: string) => void;
  readonly setPendingAction: (value: string | null) => void;
  readonly setError: (value: string | null) => void;
  readonly setNotice: (value: GitNotice | null) => void;
  readonly setCommitDialogOpen: (value: boolean) => void;
  readonly setCommitDialogError: (value: string | null) => void;
  readonly refresh: () => Promise<void>;
  readonly invalidateBranchRefs: () => void;
  readonly invalidateRemoteUrl: () => void;
}

const COMMIT_ACTION_NAME = "提交更改";
const COMMIT_GENERATE_ACTION_NAME = "生成提交消息";
const COMMIT_CONFLICT_MESSAGE = "请先解决冲突后再提交。";
const COMMIT_EMPTY_CHANGES_MESSAGE = "当前没有可提交的更改。";
const COMMIT_STAGED_REQUIRED_MESSAGE = "请先暂存更改，或开启包含未暂存的更改。";

function applyBranchPrefix(branchPrefix: string, branchName: string): string {
  const normalizedPrefix = branchPrefix.trim();
  if (normalizedPrefix.length === 0 || branchName.startsWith(normalizedPrefix)) {
    return branchName;
  }
  return `${normalizedPrefix}${branchName}`;
}

function useRunAction(options: UseWorkspaceGitActionsOptions) {
  return useCallback(
    async (actionName: string, operation: (repoPath: string) => Promise<void>, successText: string): Promise<boolean> => {
      if (options.selectedRootPath === null) {
        return false;
      }
      options.setPendingAction(actionName);
      options.setError(null);
      options.setNotice(null);
      try {
        await operation(options.selectedRootPath);
        options.setNotice({ kind: "success", text: successText });
        await options.refresh();
        return true;
      } catch (reason) {
        options.setNotice({ kind: "error", text: formatActionError(actionName, reason) });
        return false;
      } finally {
        options.setPendingAction(null);
      }
    },
    [options]
  );
}

async function prepareCommit(
  options: UseWorkspaceGitActionsOptions,
  repoPath: string,
  includeUnstaged: boolean,
): Promise<string | null> {
  if (hasUnresolvedConflicts(options.status)) {
    return COMMIT_CONFLICT_MESSAGE;
  }
  if (!hasCommitableChanges(options.status)) {
    return COMMIT_EMPTY_CHANGES_MESSAGE;
  }
  if (options.status === null || options.status.staged.length > 0) {
    if (!includeUnstaged) {
      return null;
    }
  }

  if (options.status === null) {
    return null;
  }

  if (!includeUnstaged) {
    return options.status.staged.length > 0 ? null : COMMIT_STAGED_REQUIRED_MESSAGE;
  }

  const paths = collectAutoStagePaths(options.status);
  if (paths.length === 0) {
    return options.status.staged.length > 0 ? null : COMMIT_EMPTY_CHANGES_MESSAGE;
  }
  await options.hostBridge.git.stagePaths({ repoPath, paths });
  return null;
}

async function resolveCommitMessage(
  options: UseWorkspaceGitActionsOptions,
  repoPath: string,
): Promise<string> {
  const message = options.commitMessage.trim();
  if (message.length > 0) {
    return message;
  }
  options.setPendingAction(COMMIT_GENERATE_ACTION_NAME);
  const generated = await options.hostBridge.git.generateCommitMessage({
    repoPath,
    instructions: options.commitInstructions,
    agentEnvironment: options.agentEnvironment,
  });
  const generatedMessage = generated.message.trim();
  if (generatedMessage.length === 0) {
    throw new Error("Codex 未返回提交消息。");
  }
  options.setCommitMessage(generatedMessage);
  return generatedMessage;
}

function commitSuccessText(followUp: GitCommitFollowUp): string {
  return followUp === "push" ? "提交已创建并推送。" : "提交已创建。";
}

export function useWorkspaceGitActions(options: UseWorkspaceGitActionsOptions) {
  const runAction = useRunAction(options);
  const stagePaths = useCallback(async (paths: ReadonlyArray<string>) => {
    const normalized = normalizePaths(paths);
    if (normalized.length === 0) {
      return;
    }
    await runAction("暂存更改", (repoPath) => options.hostBridge.git.stagePaths({ repoPath, paths: normalized }), "已更新暂存区。");
  }, [options.hostBridge.git, runAction]);
  const unstagePaths = useCallback(async (paths: ReadonlyArray<string>) => {
    const normalized = normalizePaths(paths);
    if (normalized.length === 0) {
      return;
    }
    await runAction("取消暂存", (repoPath) => options.hostBridge.git.unstagePaths({ repoPath, paths: normalized }), "已更新暂存区。");
  }, [options.hostBridge.git, runAction]);
  const discardPaths = useCallback(async (paths: ReadonlyArray<string>, deleteUntracked: boolean) => {
    const normalized = normalizePaths(paths);
    if (normalized.length === 0) {
      return;
    }
    const actionName = deleteUntracked ? "删除未跟踪文件" : "还原工作区";
    const successText = deleteUntracked ? "未跟踪文件已删除。" : "工作区更改已还原。";
    await runAction(actionName, (repoPath) => options.hostBridge.git.discardPaths({ repoPath, paths: normalized, deleteUntracked }), successText);
  }, [options.hostBridge.git, runAction]);
  const commit = useCallback(async (commitOptions?: GitCommitOptions) => {
    const resolvedOptions = commitOptions ?? {
      includeUnstaged: true,
      followUp: "commit" as const,
    };
    if (options.selectedRootPath === null) {
      return;
    }
    options.setPendingAction(COMMIT_ACTION_NAME);
    options.setError(null);
    options.setNotice(null);
    options.setCommitDialogError(null);
    let commitCreated = false;
    try {
      const preparationError = await prepareCommit(
        options,
        options.selectedRootPath,
        resolvedOptions.includeUnstaged,
      );
      if (preparationError !== null) {
        options.setCommitDialogError(preparationError);
        options.setNotice({ kind: "error", text: preparationError });
        return;
      }
      const message = await resolveCommitMessage(options, options.selectedRootPath);
      options.setPendingAction(COMMIT_ACTION_NAME);
      await options.hostBridge.git.commit({ repoPath: options.selectedRootPath, message });
      commitCreated = true;
      if (resolvedOptions.followUp === "push") {
        options.setPendingAction("推送分支");
        await options.hostBridge.git.push({
          repoPath: options.selectedRootPath,
          forceWithLease: options.pushForceWithLease,
        });
      }
      options.setNotice({ kind: "success", text: commitSuccessText(resolvedOptions.followUp) });
      options.setCommitDialogOpen(false);
      options.setCommitMessage("");
      await options.refresh();
    } catch (reason) {
      const errorText = commitCreated
        ? formatActionError("推送分支", reason)
        : formatActionError(COMMIT_ACTION_NAME, reason);
      options.setNotice({ kind: "error", text: errorText });
      options.setCommitDialogError(errorText);
      options.setError(errorText);
      if (commitCreated) {
        options.setNotice({ kind: "error", text: `提交已创建，但${errorText}` });
        options.setCommitDialogOpen(false);
        options.setCommitMessage("");
        await options.refresh();
      }
    } finally {
      options.setPendingAction(null);
    }
  }, [
    options.commitMessage,
    options.commitInstructions,
    options.agentEnvironment,
    options.hostBridge.git,
    options.pushForceWithLease,
    options.refresh,
    options.status,
    options.selectedRootPath,
    options.setCommitDialogError,
    options.setCommitDialogOpen,
    options.setCommitMessage,
    options.setError,
    options.setNotice,
    options.setPendingAction,
  ]);
  const openCommitDialog = useCallback(() => {
    options.setCommitDialogError(null);
    options.setCommitDialogOpen(true);
  }, [options.setCommitDialogError, options.setCommitDialogOpen]);
  const closeCommitDialog = useCallback(() => {
    options.setCommitDialogError(null);
    options.setCommitDialogOpen(false);
  }, [options.setCommitDialogError, options.setCommitDialogOpen]);
  const checkoutBranch = useCallback(async (branchName: string) => {
    const normalizedBranchName = branchName.trim();
    if (normalizedBranchName.length === 0) {
      return false;
    }
    options.invalidateBranchRefs();
    return runAction("切换分支", (repoPath) => options.hostBridge.git.checkout({ repoPath, branchName: normalizedBranchName, create: false }), `已切换到分支 ${normalizedBranchName}。`);
  }, [options.hostBridge.git, options.invalidateBranchRefs, runAction]);
  const checkoutSelectedBranch = useCallback(() => checkoutBranch(options.selectedBranch), [checkoutBranch, options.selectedBranch]);
  const deleteBranch = useCallback(async (branchName: string, force = false) => {
    const normalizedBranchName = branchName.trim();
    if (normalizedBranchName.length === 0) {
      return false;
    }
    options.invalidateBranchRefs();
    return runAction(
      force ? "强制删除分支" : "删除分支",
      (repoPath) => options.hostBridge.git.deleteBranch({ repoPath, branchName: normalizedBranchName, force }),
      force ? `已强制删除分支 ${normalizedBranchName}。` : `已删除分支 ${normalizedBranchName}。`
    );
  }, [options.hostBridge.git, options.invalidateBranchRefs, runAction]);
  const createBranchFromName = useCallback(async (branchName: string) => {
    const normalizedBranchName = branchName.trim();
    if (normalizedBranchName.length === 0) {
      return false;
    }
    const targetBranchName = applyBranchPrefix(options.branchPrefix, normalizedBranchName);
    options.invalidateBranchRefs();
    const succeeded = await runAction(
      "新建分支",
      (repoPath) => options.hostBridge.git.checkout({ repoPath, branchName: targetBranchName, create: true }),
      `已创建并切换到分支 ${targetBranchName}。`
    );
    if (succeeded) {
      options.setNewBranchName("");
    }
    return succeeded;
  }, [options.branchPrefix, options.hostBridge.git, options.invalidateBranchRefs, options.setNewBranchName, runAction]);
  const createBranch = useCallback(() => createBranchFromName(options.newBranchName), [createBranchFromName, options.newBranchName]);
  const initRepository = useCallback(async () => {
    options.invalidateBranchRefs();
    options.invalidateRemoteUrl();
    await runAction("初始化 Git 仓库", (repoPath) => options.hostBridge.git.initRepository({ repoPath }), "Git 仓库已初始化。");
  }, [options.hostBridge.git, options.invalidateBranchRefs, options.invalidateRemoteUrl, runAction]);
  const fetch = useCallback(async () => {
    options.invalidateRemoteUrl();
    await runAction("抓取远端更新", (repoPath) => options.hostBridge.git.fetch({ repoPath }), "远端更新已抓取。");
  }, [options.hostBridge.git, options.invalidateRemoteUrl, runAction]);
  const pull = useCallback(async () => {
    options.invalidateRemoteUrl();
    await runAction("拉取远端更新", (repoPath) => options.hostBridge.git.pull({ repoPath }), "远端更新已拉取。");
  }, [options.hostBridge.git, options.invalidateRemoteUrl, runAction]);
  const push = useCallback(async () => {
    options.invalidateRemoteUrl();
    await runAction(
      "推送分支",
      (repoPath) => options.hostBridge.git.push({ repoPath, forceWithLease: options.pushForceWithLease }),
      "本地提交已推送。"
    );
  }, [options.hostBridge.git, options.invalidateRemoteUrl, options.pushForceWithLease, runAction]);
  return {
    initRepository,
    fetch,
    pull,
    push,
    stagePaths,
    unstagePaths,
    discardPaths,
    commit,
    openCommitDialog,
    closeCommitDialog,
    checkoutBranch,
    deleteBranch,
    createBranchFromName,
    checkoutSelectedBranch,
    createBranch
  };
}
