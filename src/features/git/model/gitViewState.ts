import type { GitStatusOutput } from "../../../bridge/types";
import { createGitDiffKey } from "./gitDiffKey";
import type { WorkspaceGitController } from "./types";

export interface GitViewState {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export interface GitDiffTarget {
  readonly path: string;
  readonly staged: boolean;
}

const UNNAMED_BRANCH_LABEL = "未命名分支";

export function isGitBusy(controller: WorkspaceGitController): boolean {
  return controller.loading || controller.pendingAction !== null;
}

export function getCurrentBranchTitle(controller: WorkspaceGitController): string {
  if (controller.status?.branch?.detached) {
    return "Detached HEAD";
  }
  return controller.status?.branch?.head ?? UNNAMED_BRANCH_LABEL;
}

export function getSelectedDiffKey(controller: WorkspaceGitController): string | null {
  if (controller.diffTarget === null) {
    return null;
  }
  return createGitDiffKey(controller.diffTarget.path, controller.diffTarget.staged);
}

export function getFirstDiffTarget(status: GitStatusOutput): GitDiffTarget | null {
  const sections = [
    { entries: status.conflicted, staged: false },
    { entries: status.unstaged, staged: false },
    { entries: status.staged, staged: true },
    { entries: status.untracked, staged: false }
  ];

  for (const section of sections) {
    const entry = section.entries[0];
    if (entry !== undefined) {
      return { path: entry.path, staged: section.staged };
    }
  }

  return null;
}

export function getGitViewState(selectedRootName: string, controller: WorkspaceGitController): GitViewState | null {
  if (controller.loading && controller.status === null) {
    return {
      title: "正在读取 Git 状态",
      body: "稍等一下，我正在分析当前工作区的分支、变更和远端信息。"
    };
  }

  if (controller.error !== null && controller.status === null) {
    return {
      title: "读取 Git 状态失败",
      body: controller.error,
      actionLabel: "重新加载",
      onAction: () => void controller.refresh()
    };
  }

  if (controller.status === null) {
    return {
      title: "Git 状态暂不可用",
      body: "请重新选择工作区，或稍后再次刷新。",
      actionLabel: "重新加载",
      onAction: () => void controller.refresh()
    };
  }

  if (!controller.status.isRepository) {
    return {
      title: "当前工作区还不是 Git 仓库",
      body: `已选择工作区：${selectedRootName}。初始化后即可在这里查看变更和预览差异。`,
      actionLabel: "初始化 Git 仓库",
      onAction: () => void controller.initRepository()
    };
  }

  return null;
}
