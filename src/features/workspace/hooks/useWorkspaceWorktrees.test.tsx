import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitWorktreeEntry, HostBridge } from "../../../bridge/types";
import type { ManagedWorktreeRecord, WorkspaceRoot, WorkspaceRootController } from "./useWorkspaceRoots";
import { useWorkspaceWorktrees } from "./useWorkspaceWorktrees";

function createWorktree(path: string, branch: string | null): GitWorktreeEntry {
  return {
    path,
    branch,
    head: "abc123",
    isCurrent: false,
    isLocked: false,
    prunable: false,
  };
}

function createWorkspaceController(
  roots: ReadonlyArray<WorkspaceRoot>,
  managedWorktrees: ReadonlyArray<ManagedWorktreeRecord>,
): WorkspaceRootController {
  return {
    roots,
    managedWorktrees,
    selectedRoot: roots[0] ?? null,
    selectedRootId: roots[0]?.id ?? null,
    selectRoot: vi.fn(),
    addRoot: vi.fn(),
    removeRoot: vi.fn(),
    reorderRoots: vi.fn(),
    addManagedWorktree: vi.fn(),
    removeManagedWorktree: vi.fn(),
    updateWorkspaceLaunchScripts: vi.fn(),
  };
}

function createHostBridge(
  entries: ReadonlyArray<GitWorktreeEntry>,
  addWorktree: ReturnType<typeof vi.fn>,
  removeWorktree: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
): HostBridge {
  return {
    git: {
      getWorktrees: vi.fn().mockResolvedValue(entries),
      addWorktree,
      removeWorktree,
    },
  } as unknown as HostBridge;
}

describe("useWorkspaceWorktrees", () => {
  it("removes the oldest managed worktree after creating beyond the retention limit", async () => {
    const root = { id: "repo", name: "Repo", path: "E:/repo" };
    const oldRoot = { id: "old", name: "Old", path: "E:/repo/.worktrees/old" };
    const keptRoot = { id: "kept", name: "Kept", path: "E:/repo/.worktrees/kept" };
    const managedWorktrees: ReadonlyArray<ManagedWorktreeRecord> = [
      {
        path: oldRoot.path,
        repoPath: root.path,
        branch: "old",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        path: keptRoot.path,
        repoPath: root.path,
        branch: "kept",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const created = createWorktree("E:/repo/.worktrees/new", "new");
    const addWorktree = vi.fn().mockResolvedValue(created);
    const removeWorktree = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge(
      [
        createWorktree(oldRoot.path, "old"),
        createWorktree(keptRoot.path, "kept"),
        created,
      ],
      addWorktree,
      removeWorktree,
    );
    const workspace = createWorkspaceController([root, oldRoot, keptRoot], managedWorktrees);

    const { result } = renderHook(() => useWorkspaceWorktrees({
      autoCleanupEnabled: true,
      autoCleanupRetention: 2,
      hostBridge,
      selectedRootPath: root.path,
      workspace,
    }));

    await waitFor(() => expect(hostBridge.git.getWorktrees).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.createStableWorktree(root, "new");
    });

    expect(addWorktree).toHaveBeenCalledWith({
      repoPath: root.path,
      name: "new",
    });
    expect(removeWorktree).toHaveBeenCalledWith({
      repoPath: root.path,
      worktreePath: oldRoot.path,
    });
    expect(workspace.removeRoot).toHaveBeenCalledWith(oldRoot.id);
    expect(workspace.removeManagedWorktree).toHaveBeenCalledWith(oldRoot.path);
  });

  it("keeps old managed worktrees when automatic cleanup is disabled", async () => {
    const root = { id: "repo", name: "Repo", path: "E:/repo" };
    const oldRoot = { id: "old", name: "Old", path: "E:/repo/.worktrees/old" };
    const created = createWorktree("E:/repo/.worktrees/new", "new");
    const addWorktree = vi.fn().mockResolvedValue(created);
    const removeWorktree = vi.fn().mockResolvedValue(undefined);
    const hostBridge = createHostBridge([createWorktree(oldRoot.path, "old"), created], addWorktree, removeWorktree);
    const workspace = createWorkspaceController([root, oldRoot], [
      {
        path: oldRoot.path,
        repoPath: root.path,
        branch: "old",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const { result } = renderHook(() => useWorkspaceWorktrees({
      autoCleanupEnabled: false,
      autoCleanupRetention: 1,
      hostBridge,
      selectedRootPath: root.path,
      workspace,
    }));

    await waitFor(() => expect(hostBridge.git.getWorktrees).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.createStableWorktree(root, "new");
    });

    expect(removeWorktree).not.toHaveBeenCalled();
    expect(workspace.removeManagedWorktree).not.toHaveBeenCalled();
  });
});
