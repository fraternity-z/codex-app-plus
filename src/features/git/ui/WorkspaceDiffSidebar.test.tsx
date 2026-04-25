import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  GitStatusOutput,
  GitWorkspaceDiffOutput,
  HostBridge,
} from "../../../bridge/types";
import type { WorkspaceGitController } from "../model/types";
import { WorkspaceDiffSidebar } from "./WorkspaceDiffSidebar";

const { mockedUseVirtualizer } = vi.hoisted(() => ({
  mockedUseVirtualizer: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mockedUseVirtualizer,
}));

beforeAll(() => {
  class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  mockedUseVirtualizer.mockImplementation(({ count }: { readonly count: number }) => ({
    getTotalSize: () => count * 280,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 280 })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }));
});

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
    ...overrides,
  };
}

function createViewerDiff(overrides?: Partial<GitWorkspaceDiffOutput>): GitWorkspaceDiffOutput {
  return {
    path: "src/App.tsx",
    displayPath: "src/App.tsx",
    originalPath: null,
    status: "M",
    staged: false,
    section: "unstaged",
    diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
    additions: 1,
    deletions: 1,
    ...overrides,
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
    commitDialogOpen: false,
    commitDialogError: null,
    commitMessage: "",
    commitInstructions: "",
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
    openCommitDialog: vi.fn(),
    closeCommitDialog: vi.fn(),
    checkoutBranch: vi.fn().mockResolvedValue(true),
    deleteBranch: vi.fn().mockResolvedValue(true),
    createBranchFromName: vi.fn().mockResolvedValue(true),
    checkoutSelectedBranch: vi.fn().mockResolvedValue(true),
    createBranch: vi.fn().mockResolvedValue(true),
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
    ...overrides,
  };
}

function createHostBridge(getWorkspaceDiffs: ReturnType<typeof vi.fn>): HostBridge {
  return { git: { getWorkspaceDiffs } } as unknown as HostBridge;
}

function renderSidebar(
  controller: WorkspaceGitController,
  hostBridge: HostBridge,
  overrides?: Partial<ComponentProps<typeof WorkspaceDiffSidebar>>,
) {
  return render(
    <WorkspaceDiffSidebar
      hostBridge={hostBridge}
      open
      selectedRootName="codex-app-plus"
      selectedRootPath="E:/code/project"
      controller={controller}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

describe("WorkspaceDiffSidebar", () => {
  it("shows loading state while reading git status", () => {
    renderSidebar(
      createController({ loading: true, status: null, statusLoaded: false }),
      createHostBridge(vi.fn().mockResolvedValue([])),
    );

    expect(screen.getByText("正在读取 Git 状态")).toBeInTheDocument();
  });

  it("shows non-repository state", () => {
    renderSidebar(
      createController({ status: createStatus({ isRepository: false, repoRoot: null }), hasRepository: false }),
      createHostBridge(vi.fn().mockResolvedValue([])),
    );

    expect(screen.getByText("当前工作区还不是 Git 仓库")).toBeInTheDocument();
  });

  it("renders compact scope selector", () => {
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("未暂存");
    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("1");
  });

  it("forces unified diff in the collapsed sidebar and hides the split toggle", async () => {
    const { container } = renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
      { diffStyle: "split", onToggleDiffStyle: vi.fn() },
    );

    expect(screen.queryByRole("button", { name: "切换为统一差异" })).toBeNull();
    await screen.findByRole("button", { name: "折叠 src/App.tsx" });
    expect(container.querySelector(".workspace-diff-code-scroll-split")).toBeNull();
  });

  it("shows the split toggle only in expanded preview mode", () => {
    renderSidebar(
      createController({ status: createStatus() }),
      createHostBridge(vi.fn().mockResolvedValue([])),
      { expanded: true, diffStyle: "split", onToggleDiffStyle: vi.fn() },
    );

    expect(screen.getByRole("button", { name: "切换为统一差异" })).toBeInTheDocument();
  });

  it("loads batch diffs and renders the continuous viewer", async () => {
    const getWorkspaceDiffs = vi.fn().mockResolvedValue([createViewerDiff()]);
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(getWorkspaceDiffs),
    );

    await waitFor(() => expect(getWorkspaceDiffs).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      scope: "unstaged",
      ignoreWhitespaceChanges: false,
    }));
    const collapseButton = await screen.findByRole("button", { name: "折叠 src/App.tsx" });
    expect(collapseButton.closest(".workspace-diff-viewer-row")).toHaveAttribute("data-index", "0");
    expect(screen.getByText((_, node) => node?.textContent === "console.log('new')")).toBeInTheDocument();
  });

  it("collapses a diff card inline", async () => {
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    const collapseButton = await screen.findByRole("button", { name: "折叠 src/App.tsx" });
    fireEvent.click(collapseButton);

    expect(screen.getByRole("button", { name: "展开 src/App.tsx" })).toBeInTheDocument();
    expect(screen.queryByText((_, node) => node?.textContent === "console.log('new')")).not.toBeInTheDocument();
  });

  it("renders aggregated change counts in header", async () => {
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    await waitFor(() => expect(screen.getByLabelText("当前分组新增 1 行，删除 1 行")).toBeInTheDocument());
  });

  it("renders empty diff state when the batch result is empty", async () => {
    renderSidebar(
      createController({ status: createStatus() }),
      createHostBridge(vi.fn().mockResolvedValue([])),
    );

    await waitFor(() => expect(screen.getByText("当前分组没有可展示的差异")).toBeInTheDocument());
  });
});
