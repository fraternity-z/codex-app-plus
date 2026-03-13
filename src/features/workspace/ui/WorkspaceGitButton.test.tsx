import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusOutput } from "../../../bridge/types";
import { APP_PREFERENCES_STORAGE_KEY } from "../../settings/hooks/useAppPreferences";
import type { WorkspaceGitController } from "../../git/model/types";
import { WorkspaceGitButton } from "./WorkspaceGitButton";

const status: GitStatusOutput = {
  isRepository: true,
  repoRoot: "E:/code/project",
  branch: { head: "main", upstream: "origin/main", ahead: 1, behind: 0, detached: false },
  remoteName: "origin",
  remoteUrl: "https://example.com/repo.git",
  branches: [{ name: "main", upstream: "origin/main", isCurrent: true }],
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
  isClean: true
};

function createController(overrides?: Partial<WorkspaceGitController>): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status,
    statusLoaded: true,
    hasRepository: true,
    error: null,
    notice: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "",
    selectedBranch: "main",
    newBranchName: "",
    diff: null,
    diffCache: {},
    diffTarget: null,
    loadingDiffKeys: [],
    staleDiffKeys: [],
    refresh: vi.fn().mockResolvedValue(undefined),
    initRepository: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    unstagePaths: vi.fn().mockResolvedValue(undefined),
    discardPaths: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    checkoutBranch: vi.fn().mockResolvedValue(true),
    createBranchFromName: vi.fn().mockResolvedValue(true),
    checkoutSelectedBranch: vi.fn().mockResolvedValue(true),
    createBranch: vi.fn().mockResolvedValue(true),
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
    ...overrides
  };
}

function renderButton(overrides?: Partial<ComponentProps<typeof WorkspaceGitButton>>) {
  return render(
    <WorkspaceGitButton
      controller={createController()}
      selectedRootPath="E:/code/project"
      {...overrides}
    />
  );
}

describe("WorkspaceGitButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("未选择工作区时禁用快捷入口", () => {
    renderButton({ selectedRootPath: null });

    expect(screen.getByRole("button", { name: "推送当前工作区" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "选择 Git 操作" })).toBeDisabled();
  });

  it("下拉菜单只保留提交、推送和拉取", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "选择 Git 操作" }));

    const menuItems = screen.getAllByRole("menuitem");

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(menuItems).toHaveLength(3);
    expect(menuItems[0]).toHaveTextContent("提交");
    expect(menuItems[1]).toHaveTextContent("推送");
    expect(menuItems[2]).toHaveTextContent("拉取");
    expect(screen.queryByRole("menuitem", { name: "打开 Git 工作台" })).not.toBeInTheDocument();
  });

  it("提交和推送在不可执行时置灰", () => {
    renderButton({
      controller: createController({
        commitMessage: "",
        status: { ...status, staged: [], branch: { ...status.branch!, ahead: 0 } }
      })
    });

    expect(screen.getByRole("button", { name: "推送当前工作区" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "选择 Git 操作" }));

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[0]).toBeDisabled();
    expect(menuItems[1]).toBeDisabled();
    expect(menuItems[2]).not.toBeDisabled();
  });

  it("点击推送会先弹出确认框", () => {
    renderButton({
      controller: createController({
        commitMessage: "feat: update",
        status: { ...status, staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }] }
      })
    });

    fireEvent.click(screen.getByRole("button", { name: "推送当前工作区" }));

    expect(screen.getByRole("dialog", { name: "推送更改" })).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "推送" })).toBeInTheDocument();
  });

  it("启用 force-with-lease 时会在确认框中显示参数", () => {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify({
      gitPushForceWithLease: true
    }));
    renderButton({
      controller: createController({
        commitMessage: "feat: update",
        status: { ...status, staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }] }
      })
    });

    fireEvent.click(screen.getByRole("button", { name: "推送当前工作区" }));

    expect(screen.getByText("--force-with-lease")).toBeInTheDocument();
    expect(screen.getByText("将使用 --force-with-lease 推送你最新的提交内容。")).toBeInTheDocument();
  });
});
