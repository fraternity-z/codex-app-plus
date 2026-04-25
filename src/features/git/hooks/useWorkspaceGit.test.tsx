import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GitBranchRef,
  GitDiffOutput,
  GitStatusSnapshotOutput,
  HostBridge,
} from "../../../bridge/types";
import { useWorkspaceGit } from "./useWorkspaceGit";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createSnapshot(
  overrides?: Partial<GitStatusSnapshotOutput>,
): GitStatusSnapshotOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/project",
    branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
    remoteName: "origin",
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isClean: false,
    ...overrides,
  };
}

function createDiff(path: string, staged = false): GitDiffOutput {
  return {
    path,
    staged,
    diff: `@@ -1 +1 @@\n-console.log('${path}-old')\n+console.log('${path}-new')`
  };
}

function createHostBridge(
  getStatusSnapshot: ReturnType<typeof vi.fn>,
  getDiff: ReturnType<typeof vi.fn>,
  getBranchRefs?: ReturnType<typeof vi.fn>,
  getRemoteUrl?: ReturnType<typeof vi.fn>,
  overrides?: Partial<HostBridge["git"]>,
): HostBridge {
  return {
    git: {
      getStatusSnapshot,
      getBranchRefs: getBranchRefs ?? vi.fn().mockResolvedValue([{ name: "main", upstream: "origin/main", isCurrent: true }] satisfies ReadonlyArray<GitBranchRef>),
      getRemoteUrl: getRemoteUrl ?? vi.fn().mockResolvedValue("https://example.com/repo.git"),
      getDiff,
      getWorkspaceDiffs: vi.fn().mockResolvedValue([]),
      initRepository: vi.fn().mockResolvedValue(undefined),
      stagePaths: vi.fn().mockResolvedValue(undefined),
      unstagePaths: vi.fn().mockResolvedValue(undefined),
      discardPaths: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      generateCommitMessage: vi.fn().mockResolvedValue({ message: "feat: generated commit" }),
      fetch: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      ...overrides
    }
  } as unknown as HostBridge;
}

function createGitOptions(
  hostBridge: HostBridge,
  overrides?: Partial<Parameters<typeof useWorkspaceGit>[0]>,
): Parameters<typeof useWorkspaceGit>[0] {
  return {
    hostBridge,
    selectedRootPath: "E:/code/project",
    autoRefreshEnabled: false,
    gitBranchPrefix: "codex/",
    gitPushForceWithLease: false,
    gitCommitInstructions: "",
    ...overrides,
  };
}

describe("useWorkspaceGit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function waitForAutoRefresh(): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }

  it("preserves status and diff cache while refresh is pending", async () => {
    const snapshot = createSnapshot({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] });
    const deferred = createDeferred<GitStatusSnapshotOutput>();
    const getStatusSnapshot = vi.fn().mockResolvedValueOnce(snapshot).mockImplementationOnce(() => deferred.promise);
    const getDiff = vi.fn().mockResolvedValue(createDiff("src/App.tsx"));
    const hostBridge = createHostBridge(getStatusSnapshot, getDiff);

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.status?.unstaged).toHaveLength(1));
    await act(async () => {
      await result.current.selectDiff("src/App.tsx", false);
    });

    const previousStatus = result.current.status;
    const previousDiffCache = result.current.diffCache;

    act(() => {
      void result.current.refresh();
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBe(previousStatus);
    expect(result.current.diffCache).toBe(previousDiffCache);

    deferred.resolve(snapshot);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("does not preload per-file diffs while diff state is disabled", async () => {
    const snapshot = createSnapshot({
      unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
    });
    const getStatusSnapshot = vi.fn().mockResolvedValue(snapshot);
    const getDiff = vi.fn().mockResolvedValue(createDiff("src/App.tsx"));
    const hostBridge = createHostBridge(getStatusSnapshot, getDiff);

    const { result } = renderHook(() => useWorkspaceGit(
      createGitOptions(hostBridge, { diffStateEnabled: false }),
    ));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    expect(getDiff).not.toHaveBeenCalled();
  });

  it("coalesces focus and visibility refreshes when auto refresh is enabled", async () => {
    const snapshot = createSnapshot({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] });
    const getStatusSnapshot = vi.fn().mockResolvedValue(snapshot);
    const getDiff = vi.fn().mockResolvedValue(createDiff("src/App.tsx"));
    const hostBridge = createHostBridge(getStatusSnapshot, getDiff);

    const { rerender } = renderHook(
      (props: { readonly autoRefreshEnabled: boolean }) =>
        useWorkspaceGit(createGitOptions(hostBridge, { autoRefreshEnabled: props.autoRefreshEnabled })),
      { initialProps: { autoRefreshEnabled: false } }
    );

    await waitFor(() => expect(getStatusSnapshot).toHaveBeenCalledTimes(1));
    getStatusSnapshot.mockClear();

    rerender({ autoRefreshEnabled: true });
    await waitForAutoRefresh();
    await waitFor(() => expect(getStatusSnapshot).toHaveBeenCalledTimes(1));
    getStatusSnapshot.mockClear();

    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await waitForAutoRefresh();
    await waitFor(() => expect(getStatusSnapshot).toHaveBeenCalledTimes(1));

    if (originalVisibility !== undefined) {
      Object.defineProperty(document, "visibilityState", originalVisibility);
    }
  });

  it("prunes obsolete diff cache entries after refresh", async () => {
    const firstStatus = createSnapshot({
      unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
      untracked: [{ path: "src/Old.ts", originalPath: null, indexStatus: "?", worktreeStatus: "?" }]
    });
    const secondStatus = createSnapshot({ unstaged: [{ path: "src/Next.ts", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] });
    const getStatusSnapshot = vi.fn().mockResolvedValueOnce(firstStatus).mockResolvedValueOnce(secondStatus);
    const getDiff = vi.fn().mockImplementation(async ({ path }: { readonly path: string }) => createDiff(path));
    const hostBridge = createHostBridge(getStatusSnapshot, getDiff);

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.status?.unstaged).toHaveLength(1));
    await act(async () => {
      await result.current.selectDiff("src/App.tsx", false);
      await result.current.ensureDiff("src/Old.ts", false);
    });
    expect(Object.keys(result.current.diffCache).sort()).toEqual(["unstaged:src/App.tsx", "unstaged:src/Old.ts"]);

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.diffTarget).toEqual({ path: "src/Next.ts", staged: false }));
    expect(Object.keys(result.current.diffCache)).toEqual(["unstaged:src/Next.ts"]);
  });

  it("loads branch refs lazily and only once", async () => {
    const getStatusSnapshot = vi.fn().mockResolvedValue(createSnapshot());
    const getBranchRefs = vi.fn().mockResolvedValue([
      { name: "main", upstream: "origin/main", isCurrent: true },
      { name: "feature/ui", upstream: null, isCurrent: false },
    ] satisfies ReadonlyArray<GitBranchRef>);
    const hostBridge = createHostBridge(getStatusSnapshot, vi.fn().mockResolvedValue(createDiff("src/App.tsx")), getBranchRefs);

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    expect(result.current.branchRefsLoaded).toBe(false);
    expect(result.current.status?.branches).toEqual([]);

    await act(async () => {
      await result.current.ensureBranchRefs!();
      await result.current.ensureBranchRefs!();
    });

    expect(getBranchRefs).toHaveBeenCalledTimes(1);
    expect(result.current.branchRefsLoaded).toBe(true);
    expect(result.current.status?.branches).toHaveLength(2);
  });

  it("deletes a branch through the host bridge", async () => {
    const deleteBranch = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { deleteBranch }
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await act(async () => {
      await result.current.deleteBranch("feature/ui");
    });

    expect(deleteBranch).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      branchName: "feature/ui",
      force: false,
    });
  });

  it("passes force delete to host bridge when requested", async () => {
    const deleteBranch = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { deleteBranch }
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await act(async () => {
      await result.current.deleteBranch("feature/ui", true);
    });

    expect(deleteBranch).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      branchName: "feature/ui",
      force: true,
    });
  });

  it("applies the configured branch prefix when creating a branch", async () => {
    const checkout = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { checkout }
    );

    const { result } = renderHook(() => useWorkspaceGit(
      createGitOptions(hostBridge, { gitBranchPrefix: "feature/" }),
    ));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    act(() => {
      result.current.setNewBranchName("login-flow");
    });
    await act(async () => {
      await result.current.createBranch();
    });

    expect(checkout).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      branchName: "feature/login-flow",
      create: true
    });
  });

  it("passes force-with-lease to push when enabled in preferences", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { push }
    );

    const { result } = renderHook(() => useWorkspaceGit(
      createGitOptions(hostBridge, { gitPushForceWithLease: true }),
    ));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await act(async () => {
      await result.current.push();
    });

    expect(push).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      forceWithLease: true
    });
  });

  it("opens the commit dialog and closes it after a successful commit", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { commit },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.status?.staged).toHaveLength(1));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: improve commit flow");
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: improve commit flow",
    });
    expect(result.current.commitDialogOpen).toBe(false);
    expect(result.current.commitMessage).toBe("");
    expect(result.current.commitDialogError).toBeNull();
  });

  it("keeps the commit dialog open and preserves input after a failed commit", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("hook failed"));
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { commit },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.status?.staged).toHaveLength(1));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: improve commit flow");
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(result.current.commitDialogOpen).toBe(true);
    expect(result.current.commitMessage).toBe("feat: improve commit flow");
    expect(result.current.commitDialogError).toContain("提交更改失败");
  });

  it("auto stages unstaged and untracked changes before committing", async () => {
    const stagePaths = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [],
        unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
        untracked: [{ path: "src/New.ts", originalPath: null, indexStatus: "?", worktreeStatus: "?" }],
        isClean: false,
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { stagePaths, commit },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: commit all visible changes");
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(stagePaths).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      paths: ["src/App.tsx", "src/New.ts"],
    });
    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: commit all visible changes",
    });
    expect(stagePaths.mock.invocationCallOrder[0]).toBeLessThan(
      commit.mock.invocationCallOrder[0],
    );
  });

  it("generates a commit message when the input is empty", async () => {
    const generateCommitMessage = vi.fn().mockResolvedValue({ message: "feat: generated commit" });
    const commit = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { generateCommitMessage, commit },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge, {
      gitCommitInstructions: "Use conventional commits.",
      agentEnvironment: "windowsNative",
    })));

    await waitFor(() => expect(result.current.status?.staged).toHaveLength(1));
    act(() => {
      result.current.openCommitDialog();
    });

    await act(async () => {
      await result.current.commit();
    });

    expect(generateCommitMessage).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      instructions: "Use conventional commits.",
      agentEnvironment: "windowsNative",
    });
    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: generated commit",
    });
  });

  it("does not auto-stage unstaged changes when includeUnstaged is false", async () => {
    const stagePaths = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
        unstaged: [{ path: "src/Other.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { stagePaths, commit },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: commit staged");
    });

    await act(async () => {
      await result.current.commit({ includeUnstaged: false, followUp: "commit" });
    });

    expect(stagePaths).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: commit staged",
    });
  });

  it("pushes after commit when requested", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const push = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { commit, push },
    );

    const { result } = renderHook(() => useWorkspaceGit(
      createGitOptions(hostBridge, { gitPushForceWithLease: true }),
    ));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: commit and push");
    });

    await act(async () => {
      await result.current.commit({ includeUnstaged: true, followUp: "push" });
    });

    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: commit and push",
    });
    expect(push).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      forceWithLease: true,
    });
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      push.mock.invocationCallOrder[0],
    );
  });

  it("reports push failure without treating the created commit as failed", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const push = vi.fn().mockRejectedValue(new Error("remote rejected"));
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot({
        staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
      })),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { commit, push },
    );

    const { result } = renderHook(() => useWorkspaceGit(createGitOptions(hostBridge)));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: commit before push failure");
    });

    await act(async () => {
      await result.current.commit({ includeUnstaged: true, followUp: "push" });
    });

    expect(commit).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      message: "feat: commit before push failure",
    });
    expect(push).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      forceWithLease: false,
    });
    expect(result.current.commitDialogOpen).toBe(false);
    expect(result.current.commitMessage).toBe("");
    expect(result.current.commitDialogError).toContain("推送分支失败");
    expect(result.current.notice?.text).toContain("提交已创建，但推送分支失败");
  });
});
