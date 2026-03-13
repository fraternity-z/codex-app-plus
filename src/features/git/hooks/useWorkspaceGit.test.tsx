import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      fetch: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      ...overrides
    }
  } as unknown as HostBridge;
}

describe("useWorkspaceGit", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
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

    const { result } = renderHook(() => useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: false }));

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

  it("coalesces focus and visibility refreshes when auto refresh is enabled", async () => {
    const snapshot = createSnapshot({ unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }] });
    const getStatusSnapshot = vi.fn().mockResolvedValue(snapshot);
    const getDiff = vi.fn().mockResolvedValue(createDiff("src/App.tsx"));
    const hostBridge = createHostBridge(getStatusSnapshot, getDiff);

    const { rerender } = renderHook(
      (props: { readonly autoRefreshEnabled: boolean }) =>
        useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: props.autoRefreshEnabled }),
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

    const { result } = renderHook(() => useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: false }));

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

    const { result } = renderHook(() => useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: false }));

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

  it("applies the configured branch prefix when creating a branch", async () => {
    window.localStorage.setItem("codex-app-plus.app-preferences", JSON.stringify({
      gitBranchPrefix: "feature/"
    }));
    const checkout = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { checkout }
    );

    const { result } = renderHook(() => useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: false }));

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
    window.localStorage.setItem("codex-app-plus.app-preferences", JSON.stringify({
      gitPushForceWithLease: true
    }));
    const push = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      vi.fn().mockResolvedValue(createSnapshot()),
      vi.fn().mockResolvedValue(createDiff("src/App.tsx")),
      undefined,
      undefined,
      { push }
    );

    const { result } = renderHook(() => useWorkspaceGit({ hostBridge, selectedRootPath: "E:/code/project", autoRefreshEnabled: false }));

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await act(async () => {
      await result.current.push();
    });

    expect(push).toHaveBeenCalledWith({
      repoPath: "E:/code/project",
      forceWithLease: true
    });
  });
});
