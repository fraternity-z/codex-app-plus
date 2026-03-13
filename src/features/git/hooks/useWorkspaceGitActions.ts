import { useCallback } from "react";
import type { HostBridge } from "../../../bridge/types";
import type { GitNotice } from "../model/types";
import { formatActionError, normalizePaths } from "../model/workspaceGitHelpers";

interface UseWorkspaceGitActionsOptions {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
  readonly commitMessage: string;
  readonly selectedBranch: string;
  readonly newBranchName: string;
  readonly branchPrefix: string;
  readonly pushForceWithLease: boolean;
  readonly setCommitMessage: (value: string) => void;
  readonly setSelectedBranch: (value: string) => void;
  readonly setNewBranchName: (value: string) => void;
  readonly setPendingAction: (value: string | null) => void;
  readonly setError: (value: string | null) => void;
  readonly setNotice: (value: GitNotice | null) => void;
  readonly refresh: () => Promise<void>;
  readonly invalidateBranchRefs: () => void;
  readonly invalidateRemoteUrl: () => void;
}

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
  const commit = useCallback(async () => {
    const message = options.commitMessage.trim();
    if (message.length === 0) {
      return;
    }
    const succeeded = await runAction("提交更改", (repoPath) => options.hostBridge.git.commit({ repoPath, message }), "提交已创建。");
    if (succeeded) {
      options.setCommitMessage("");
    }
  }, [options.commitMessage, options.hostBridge.git, options.setCommitMessage, runAction]);
  const checkoutBranch = useCallback(async (branchName: string) => {
    const normalizedBranchName = branchName.trim();
    if (normalizedBranchName.length === 0) {
      return false;
    }
    options.invalidateBranchRefs();
    return runAction("切换分支", (repoPath) => options.hostBridge.git.checkout({ repoPath, branchName: normalizedBranchName, create: false }), `已切换到分支 ${normalizedBranchName}。`);
  }, [options.hostBridge.git, options.invalidateBranchRefs, runAction]);
  const checkoutSelectedBranch = useCallback(() => checkoutBranch(options.selectedBranch), [checkoutBranch, options.selectedBranch]);
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
    checkoutBranch,
    createBranchFromName,
    checkoutSelectedBranch,
    createBranch
  };
}
