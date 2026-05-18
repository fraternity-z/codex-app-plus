import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  GitStatusOutput,
  GitWorkspaceDiffOutput,
  HostBridge,
} from "../../../bridge/types";
import { I18nProvider } from "../../../i18n/provider";
import type { WorkspaceGitController } from "../model/types";
import { WorkspaceDiffSidebar } from "./WorkspaceDiffSidebar";

const { coreMocks, mockedUseVirtualizer } = vi.hoisted(() => ({
  coreMocks: {
    convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  },
  mockedUseVirtualizer: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mockedUseVirtualizer,
}));

vi.mock("@tauri-apps/api/core", () => coreMocks);

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

function rectFor(height: number): DOMRect {
  return {
    x: 40,
    y: 120,
    top: 120,
    left: 40,
    right: 840,
    bottom: 120 + height,
    width: 800,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

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

function encodeUtf8Base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
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

function createHostBridge(
  getWorkspaceDiffs: ReturnType<typeof vi.fn>,
  getDiff: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(async ({ path, staged }: { readonly path: string; readonly staged: boolean }) => ({
    path,
    staged,
    diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
  })),
): HostBridge {
  return { git: { getWorkspaceDiffs, getDiff } } as unknown as HostBridge;
}

function renderSidebar(
  controller: WorkspaceGitController,
  hostBridge: HostBridge,
  overrides?: Partial<ComponentProps<typeof WorkspaceDiffSidebar>>,
) {
  return render(
    <I18nProvider language="zh-CN" setLanguage={vi.fn()}>
      <WorkspaceDiffSidebar
        hostBridge={hostBridge}
        open
        selectedRootName="codex-app-plus"
        selectedRootPath="E:/code/project"
        controller={controller}
        onClose={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
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

    const trigger = screen.getByRole("button", { name: "选择差异分组" });
    expect(trigger).toHaveTextContent("未暂存");
    expect(trigger).toHaveTextContent("1");

    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "差异分组" });
    expect(within(menu).queryByText("全部变更")).toBeNull();
    expect(within(menu).getByRole("menuitemradio", { name: /未暂存/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "已暂存" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "分支" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "上轮对话" })).toBeInTheDocument();
  });

  it("renders the review toolbar action group and menu", () => {
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    expect(screen.getByRole("button", { name: "更多差异操作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换差异布局" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Git 操作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开文件列表" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更多差异操作" }));

    const menu = screen.getByRole("menu", { name: "差异操作" });
    expect(within(menu).getByRole("menuitem", { name: "刷新" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemcheckbox", { name: "启用自动换行" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitem", { name: "折叠全部差异" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitemcheckbox", { name: "不加载完整文件" })).toBeNull();
    expect(within(menu).getByRole("menuitemcheckbox", { name: /禁用富文本预览/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "启用文字差异" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitemcheckbox", { name: "隐藏空白字符" })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitem", { name: "复制 git apply 命令" })).toBeDisabled();
  });

  it("opens git actions from the review toolbar", () => {
    const openCommitDialog = vi.fn();
    const createBranch = vi.fn().mockResolvedValue(true);
    renderSidebar(
      createController({
        openCommitDialog,
        createBranch,
        newBranchName: "feature/sidebar-git-actions",
        status: createStatus({
          unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
          isClean: false,
        }),
      }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    fireEvent.click(screen.getByRole("button", { name: "Git 操作" }));

    const menu = screen.getByRole("menu", { name: "Git 操作" });
    expect(within(menu).getByRole("menuitem", { name: "提交" })).not.toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "推送" })).not.toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /创建拉取请求.*TODO/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /创建分支.*TODO/ })).toBeDisabled();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "提交" }));
    expect(openCommitDialog).toHaveBeenCalledTimes(1);
  });

  it("does not request workspace git diffs for non-workspace groups", async () => {
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
    getWorkspaceDiffs.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "选择差异分组" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "分支" }));

    expect(screen.getByRole("button", { name: "选择差异分组" })).toHaveTextContent("分支");
    expect(getWorkspaceDiffs).not.toHaveBeenCalled();
  });

  it("renders split diff in the collapsed sidebar and wires the split toggle", async () => {
    const onToggleDiffStyle = vi.fn();
    const { container } = renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
      { diffStyle: "split", onToggleDiffStyle },
    );

    fireEvent.click(screen.getByRole("button", { name: "切换为统一差异" }));
    expect(onToggleDiffStyle).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: "折叠 src/App.tsx" });
    expect(container.querySelector(".workspace-diff-code-frame-split")).not.toBeNull();
  });

  it("uses the split toggle label in expanded preview mode", () => {
    renderSidebar(
      createController({ status: createStatus() }),
      createHostBridge(vi.fn().mockResolvedValue([])),
      { expanded: true, diffStyle: "split", onToggleDiffStyle: vi.fn() },
    );

    expect(screen.getByRole("button", { name: "切换为统一差异" })).toBeInTheDocument();
  });

  it("copies a git apply command for the current diff group", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff({
        diff: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "--- a/src/App.tsx",
          "+++ b/src/App.tsx",
          "@@ -1 +1 @@",
          "-console.log('old')",
          "+console.log('new')",
        ].join("\n"),
      })])),
    );

    await waitFor(() => expect(screen.getByLabelText("当前分组新增 1 行，删除 1 行")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "更多差异操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "复制 git apply 命令" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain("git apply --whitespace=nowarn");
    expect(writeText.mock.calls[0]?.[0]).toContain("diff --git a/src/App.tsx b/src/App.tsx");
  });

  it("loads batch diffs and renders the continuous viewer", async () => {
    const getWorkspaceDiffs = vi.fn().mockResolvedValue([createViewerDiff({
      diff: "",
      diffLoaded: false,
      additions: 0,
      deletions: 0,
    })]);
    const getDiff = vi.fn().mockResolvedValue({
      path: "src/App.tsx",
      staged: false,
      diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
    });
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(getWorkspaceDiffs, getDiff),
    );

    await waitFor(() => expect(getWorkspaceDiffs).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      scope: "unstaged",
      ignoreWhitespaceChanges: false,
    }));
    await waitFor(() => expect(getDiff).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      path: "src/App.tsx",
      staged: false,
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

  it("toggles a diff card from the file header without hijacking action buttons", async () => {
    const stagePaths = vi.fn().mockResolvedValue(undefined);
    renderSidebar(
      createController({
        stagePaths,
        status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }),
      }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    await screen.findByRole("button", { name: "折叠 src/App.tsx" });

    fireEvent.click(screen.getByText("src/App.tsx"));

    expect(screen.getByRole("button", { name: "展开 src/App.tsx" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("src/App.tsx"));
    expect(screen.getByRole("button", { name: "折叠 src/App.tsx" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "暂存 src/App.tsx" }));

    expect(stagePaths).toHaveBeenCalledWith(["src/App.tsx"]);
    expect(screen.getByRole("button", { name: "折叠 src/App.tsx" })).toBeInTheDocument();
  });

  it("renders aggregated change counts in header", async () => {
    renderSidebar(
      createController({ status: createStatus({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] }) }),
      createHostBridge(vi.fn().mockResolvedValue([createViewerDiff()])),
    );

    await waitFor(() => expect(screen.getByLabelText("当前分组新增 1 行，删除 1 行")).toBeInTheDocument());
  });

  it("does not render the removed overview tab", () => {
    renderSidebar(
      createController({
        status: createStatus({
          staged: Array.from({ length: 29 }, (_, index) => ({
            path: `src/file-${index}.ts`,
            originalPath: null,
            indexStatus: "M",
            worktreeStatus: " ",
          })),
          isClean: false,
        }),
      }),
      createHostBridge(vi.fn().mockResolvedValue([])),
    );

    expect(screen.queryByRole("tab", { name: "概览" })).toBeNull();
    expect(screen.getByRole("tab", { name: "审查" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("GitHub CLI")).toBeNull();
  });

  it("opens a project file search dialog and renders the selected file in the side panel", async () => {
    const getWorkspaceDiffs = vi.fn().mockResolvedValue([]);
    const request = vi.fn().mockImplementation(async (input: { readonly method: string }) => {
      if (input.method === "fs/readFile") {
        return {
          requestId: "read-1",
          result: { dataBase64: encodeUtf8Base64("export const answer = 1\n") },
        };
      }
      return {
        requestId: "search-1",
        result: {
          files: [{
            root: "E:/code/project",
            path: "src/App.tsx",
            match_type: "file",
            file_name: "App.tsx",
            score: 100,
            indices: null,
          }],
        },
      };
    });
    const hostBridge = {
      git: { getWorkspaceDiffs },
      rpc: { request },
    } as unknown as HostBridge;

    renderSidebar(createController(), hostBridge);

    fireEvent.click(screen.getByRole("button", { name: "打开侧边面板标签页" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /打开文件/ }));

    expect(screen.getByRole("dialog", { name: "搜索文件" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "输入内容搜索文件" }), {
      target: { value: "app" },
    });

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "fuzzyFileSearch",
      params: {
        query: "app",
        roots: ["E:/code/project"],
        cancellationToken: null,
      },
    }));
    const resultButton = (await screen.findByText("App.tsx")).closest("button");
    expect(resultButton).not.toBeNull();
    fireEvent.click(resultButton!);

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "fs/readFile",
      params: {
        path: "E:/code/project/src/App.tsx",
      },
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "搜索文件" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "App.tsx" })).toHaveAttribute("aria-selected", "true");
    const fileViewer = screen.getByRole("region", { name: "文件 App.tsx" });
    const breadcrumb = within(fileViewer).getByRole("navigation", { name: "文件路径" });
    expect(within(breadcrumb).getByText("project")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("src")).toBeInTheDocument();
    expect(within(breadcrumb).getByText("App.tsx")).toBeInTheDocument();
    expect(within(fileViewer).queryByText("只读")).toBeNull();
    expect(within(fileViewer).getByRole("button", { name: "更多文件操作" })).toBeInTheDocument();
    expect(within(fileViewer).getByRole("button", { name: "在外部打开文件" })).toBeInTheDocument();
    expect(within(fileViewer).getByRole("button", { name: "显示文件所在文件夹" })).toBeInTheDocument();
    expect(await screen.findByText((_, node) => node?.textContent === "export const answer = 1")).toBeInTheDocument();
  });

  it("opens image search results in the preview tab", async () => {
    const getWorkspaceDiffs = vi.fn().mockResolvedValue([]);
    const imageDataBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const request = vi.fn().mockImplementation(async (input: { readonly method: string }) => {
      if (input.method === "fs/readFile") {
        return {
          requestId: "read-1",
          result: { dataBase64: imageDataBase64 },
        };
      }
      return {
        requestId: "search-1",
        result: {
          files: [{
            root: "E:/code/project",
            path: "assets/logo.png",
            match_type: "file",
            file_name: "logo.png",
            score: 100,
            indices: null,
          }],
        },
      };
    });
    const hostBridge = {
      app: {
        openExternal: vi.fn().mockResolvedValue(undefined),
        revealPathInFolder: vi.fn().mockResolvedValue(undefined),
      },
      git: { getWorkspaceDiffs },
      rpc: { request },
    } as unknown as HostBridge;

    renderSidebar(createController(), hostBridge);

    fireEvent.click(screen.getByRole("button", { name: "打开侧边面板标签页" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /打开文件/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "输入内容搜索文件" }), {
      target: { value: "logo" },
    });
    const resultButton = (await screen.findByText("logo.png")).closest("button");
    expect(resultButton).not.toBeNull();
    fireEvent.click(resultButton!);

    await waitFor(() => expect(request).toHaveBeenCalledWith({
      method: "fs/readFile",
      params: {
        path: "E:/code/project/assets/logo.png",
      },
    }));
    expect(screen.getByRole("tab", { name: "logo.png" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("预览 logo.png")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "logo.png" })).toHaveAttribute("src", `data:image/png;base64,${imageDataBase64}`);
    expect(screen.queryByRole("region", { name: "文件 logo.png" })).toBeNull();
  });

  it("creates a local comment from an opened file line", async () => {
    const getWorkspaceDiffs = vi.fn().mockResolvedValue([]);
    const request = vi.fn().mockImplementation(async (input: { readonly method: string }) => {
      if (input.method === "fs/readFile") {
        return {
          requestId: "read-1",
          result: { dataBase64: encodeUtf8Base64("export const answer = 1\n") },
        };
      }
      return {
        requestId: "search-1",
        result: {
          files: [{
            root: "E:/code/project",
            path: "src/App.tsx",
            match_type: "file",
            file_name: "App.tsx",
            score: 100,
            indices: null,
          }],
        },
      };
    });
    const onCreateLocalCodeComment = vi.fn();
    const hostBridge = {
      git: { getWorkspaceDiffs },
      rpc: { request },
    } as unknown as HostBridge;

    renderSidebar(createController(), hostBridge, { onCreateLocalCodeComment });

    fireEvent.click(screen.getByRole("button", { name: "打开侧边面板标签页" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /打开文件/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "输入内容搜索文件" }), {
      target: { value: "app" },
    });
    const resultButton = (await screen.findByText("App.tsx")).closest("button");
    fireEvent.click(resultButton!);

    await screen.findByText((_, node) => node?.textContent === "export const answer = 1");
    fireEvent.click(screen.getByRole("button", { name: "评论第 1 行" }));
    fireEvent.change(screen.getByPlaceholderText("请求更改"), {
      target: { value: "请把变量名改得更明确" },
    });
    fireEvent.click(screen.getByRole("button", { name: "注释" }));

    expect(onCreateLocalCodeComment).toHaveBeenCalledWith({
      rootPath: "E:/code/project",
      filePath: "E:/code/project/src/App.tsx",
      line: 1,
      lineText: "export const answer = 1",
      text: "请把变量名改得更明确",
    });
  });

  it("renders empty diff state when the batch result is empty", async () => {
    renderSidebar(
      createController({ status: createStatus() }),
      createHostBridge(vi.fn().mockResolvedValue([])),
    );

    await waitFor(() => expect(screen.getByText("当前分组没有可展示的差异")).toBeInTheDocument());
  });

  it("lets the browser tab be closed without closing the whole side panel", () => {
    const hideBrowserSidebar = vi.fn().mockResolvedValue(undefined);
    const hostBridge = {
      app: {
        openBrowserSidebar: vi.fn().mockResolvedValue(undefined),
        updateBrowserSidebarBounds: vi.fn().mockResolvedValue(undefined),
        hideBrowserSidebar,
        openFileInEditor: vi.fn().mockResolvedValue(undefined),
      },
      git: {
        getWorkspaceDiffs: vi.fn().mockResolvedValue([]),
      },
    } as unknown as HostBridge;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains("workspace-side-browser-surface")) {
        return rectFor(520);
      }
      return rectFor(0);
    });

    renderSidebar(createController(), hostBridge);

    fireEvent.click(screen.getByRole("button", { name: "打开侧边面板标签页" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /浏览器/ }));

    expect(screen.getByRole("tab", { name: "浏览器" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "关闭浏览器标签页" }));

    expect(screen.queryByRole("tab", { name: "浏览器" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "审查" })).toHaveAttribute("aria-selected", "true");
    expect(hideBrowserSidebar).toHaveBeenCalled();
  });

  it("opens the browser tab when the app requests the in-app browser sidebar", async () => {
    const openBrowserSidebar = vi.fn().mockResolvedValue(undefined);
    const hostBridge = {
      app: {
        openBrowserSidebar,
        updateBrowserSidebarBounds: vi.fn().mockResolvedValue(undefined),
        hideBrowserSidebar: vi.fn().mockResolvedValue(undefined),
        openFileInEditor: vi.fn().mockResolvedValue(undefined),
      },
      git: {
        getWorkspaceDiffs: vi.fn().mockResolvedValue([]),
      },
    } as unknown as HostBridge;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains("workspace-side-browser-surface")) {
        return rectFor(520);
      }
      return rectFor(0);
    });

    renderSidebar(
      createController(),
      hostBridge,
      { browserOpenRequest: { id: 1, url: "about:blank" } },
    );

    await waitFor(() => expect(screen.getByRole("tab", { name: "浏览器" })).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(openBrowserSidebar).toHaveBeenCalledWith(expect.objectContaining({
      url: "about:blank",
    })));
  });

  it("opens quick file preview requests in the side panel", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const revealPathInFolder = vi.fn().mockResolvedValue(undefined);
    const hostBridge = {
      app: {
        openExternal,
        revealPathInFolder,
        openBrowserSidebar: vi.fn().mockResolvedValue(undefined),
        updateBrowserSidebarBounds: vi.fn().mockResolvedValue(undefined),
        hideBrowserSidebar: vi.fn().mockResolvedValue(undefined),
        openFileInEditor: vi.fn().mockResolvedValue(undefined),
      },
      git: {
        getWorkspaceDiffs: vi.fn().mockResolvedValue([]),
      },
      rpc: {
        request: vi.fn(),
      },
    } as unknown as HostBridge;

    renderSidebar(
      createController(),
      hostBridge,
      {
        previewOpenRequest: {
          id: 1,
          target: {
            kind: "file",
            fileKind: "document",
            path: "E:/code/project/网站设计报告.pptx",
            name: "网站设计报告.pptx",
            extension: "PPTX",
          },
        },
      },
    );

    await waitFor(() => expect(screen.getByRole("tab", { name: "网站设计报告.pptx" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByLabelText("预览 网站设计报告.pptx")).toBeInTheDocument();
    expect(screen.getByText("当前格式可能无法直接内嵌渲染，可以用系统默认应用打开查看。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "在外部打开文件" }));

    await waitFor(() => expect(openExternal).toHaveBeenCalledWith("E:/code/project/网站设计报告.pptx"));
  });
});
