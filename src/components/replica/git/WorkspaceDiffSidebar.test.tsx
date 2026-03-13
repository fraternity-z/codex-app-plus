import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitDiffOutput, GitStatusOutput } from "../../../bridge/types";
import type { WorkspaceGitController } from "./types";
import { WorkspaceDiffSidebar } from "./WorkspaceDiffSidebar";

function createStatus(overrides?: Partial<GitStatusOutput>): GitStatusOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/project",
    branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
    remoteName: "origin",
    remoteUrl: "https://example.com/repo.git",
    branches: [{ name: "main", upstream: "origin/main", isCurrent: true }],
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isClean: true,
    ...overrides
  };
}

function createDiff(overrides?: Partial<GitDiffOutput>): GitDiffOutput {
  return {
    path: "src/App.tsx",
    staged: false,
    diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
    ...overrides
  };
}

function createController(overrides?: Partial<WorkspaceGitController>): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: createStatus(),
    statusLoaded: true,
    hasRepository: true,
    error: null,
    notice: null,
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
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
    ...overrides
  };
}

function renderSidebar(controller: WorkspaceGitController) {
  return render(
    <WorkspaceDiffSidebar
      open
      selectedRootName="codex-app-plus"
      selectedRootPath="E:/code/project"
      controller={controller}
      onClose={vi.fn()}
    />
  );
}

describe("WorkspaceDiffSidebar", () => {
  it("shows loading state while reading git status", () => {
    renderSidebar(createController({ loading: true, status: null, statusLoaded: false }));

    expect(screen.getByText("正在读取 Git 状态")).toBeInTheDocument();
  });

  it("shows non-repository state", () => {
    renderSidebar(createController({ status: createStatus({ isRepository: false, repoRoot: null }), hasRepository: false }));

    expect(screen.getByText("当前工作区还不是 Git 仓库")).toBeInTheDocument();
  });

  it("renders compact scope selector", () => {
    renderSidebar(createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }));

    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("未暂存");
    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("1");
  });

  it("renders empty diff state when repository has no changes", () => {
    const controller = createController({ status: createStatus() });
    renderSidebar(controller);

    expect(screen.getByText("当前没有未暂存变更")).toBeInTheDocument();
    expect(controller.ensureDiff).not.toHaveBeenCalled();
  });

  it("auto-selects the first visible file", async () => {
    const controller = createController({
      status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] })
    });
    renderSidebar(controller);

    await waitFor(() => expect(controller.selectDiff).toHaveBeenCalledWith("src/App.tsx", false));
  });

  it("loads diff previews progressively instead of requesting every file at once", async () => {
    const controller = createController({
      status: createStatus({
        unstaged: [
          { path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" },
          { path: "src/Next.ts", originalPath: null, indexStatus: " ", worktreeStatus: "M" }
        ]
      })
    });

    renderSidebar(controller);

    await waitFor(() => expect(controller.ensureDiff).toHaveBeenCalledWith("src/App.tsx", false));
    expect(controller.ensureDiff).toHaveBeenCalledTimes(1);
  });

  it("renders a single preview panel for the active file", () => {
    const controller = createController({
      status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }),
      diff: createDiff(),
      diffCache: { "unstaged:src/App.tsx": createDiff() },
      diffTarget: { path: "src/App.tsx", staged: false }
    });
    const { container } = renderSidebar(controller);

    expect(container.textContent).toContain("console.log('new')");
    expect(container.querySelectorAll(".workspace-diff-preview-card")).toHaveLength(1);
  });

  it("renders aggregated change counts in header", () => {
    renderSidebar(
      createController({
        status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }),
        diffCache: { "unstaged:src/App.tsx": createDiff() },
        diffTarget: { path: "src/App.tsx", staged: false }
      })
    );

    expect(screen.getByLabelText("当前分组新增 1 行，删除 1 行")).toBeInTheDocument();
  });

  it("shows loading placeholder instead of fake zero for unresolved diff", () => {
    renderSidebar(
      createController({
        status: createStatus({ untracked: [{ path: "src/new-file.ts", originalPath: null, indexStatus: "?", worktreeStatus: "?" }] }),
        loadingDiffKeys: ["unstaged:src/new-file.ts"]
      })
    );

    expect(screen.getAllByText("加载中…").length).toBeGreaterThan(0);
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
  });

  it("switches scope from dropdown menu", () => {
    renderSidebar(
      createController({
        status: createStatus({ staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }] })
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "选择差异分组" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /已暂存/ }));

    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("已暂存");
  });

  it("calls selectDiff when user clicks file row", () => {
    const controller = createController({
      status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }),
      diffTarget: { path: "src/App.tsx", staged: false }
    });

    renderSidebar(controller);
    fireEvent.click(screen.getByRole("button", { name: "src/App.tsx" }));

    expect(controller.selectDiff).toHaveBeenCalledWith("src/App.tsx", false);
  });
});
