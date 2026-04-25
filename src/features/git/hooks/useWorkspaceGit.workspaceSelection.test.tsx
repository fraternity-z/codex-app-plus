import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitDiffOutput, GitStatusSnapshotOutput, HostBridge } from "../../../bridge/types";
import { useWorkspaceGit } from "./useWorkspaceGit";

interface WorkspaceSelectionProps {
  readonly selectedRootPath: string | null;
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

function createDiff(): GitDiffOutput {
  return {
    path: "src/App.tsx",
    staged: false,
    diff: "@@ -1 +1 @@\n-console.log('old')\n+console.log('new')",
  };
}

function createHostBridge(getStatusSnapshot: ReturnType<typeof vi.fn>): HostBridge {
  return {
    git: {
      getStatusSnapshot,
      getBranchRefs: vi.fn().mockResolvedValue([]),
      getRemoteUrl: vi.fn().mockResolvedValue("https://example.com/repo.git"),
      getDiff: vi.fn().mockResolvedValue(createDiff()),
      getWorkspaceDiffs: vi.fn().mockResolvedValue([]),
      initRepository: vi.fn().mockResolvedValue(undefined),
      stagePaths: vi.fn().mockResolvedValue(undefined),
      unstagePaths: vi.fn().mockResolvedValue(undefined),
      discardPaths: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      generateCommitMessage: vi.fn().mockResolvedValue({ message: "feat: generated" }),
      fetch: vi.fn().mockResolvedValue(undefined),
      pull: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn(),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as HostBridge;
}

function createOptions(
  hostBridge: HostBridge,
  selectedRootPath: string | null,
): Parameters<typeof useWorkspaceGit>[0] {
  return {
    hostBridge,
    selectedRootPath,
    autoRefreshEnabled: false,
    gitBranchPrefix: "codex/",
    gitPushForceWithLease: false,
    gitCommitInstructions: "",
  };
}

describe("useWorkspaceGit workspace selection", () => {
  it("does not fetch or loop when no workspace is selected on mount", () => {
    const getStatusSnapshot = vi.fn().mockResolvedValue(createSnapshot());
    const hostBridge = createHostBridge(getStatusSnapshot);

    const { result } = renderHook(() => useWorkspaceGit(createOptions(hostBridge, null)));

    expect(result.current.loading).toBe(false);
    expect(result.current.statusLoaded).toBe(false);
    expect(result.current.status).toBeNull();
    expect(getStatusSnapshot).not.toHaveBeenCalled();
  });

  it("clears transient state when the selected workspace is removed", async () => {
    const getStatusSnapshot = vi.fn().mockResolvedValue(createSnapshot());
    const hostBridge = createHostBridge(getStatusSnapshot);
    const initialProps: WorkspaceSelectionProps = { selectedRootPath: "E:/code/project" };
    const { result, rerender } = renderHook(
      ({ selectedRootPath }: WorkspaceSelectionProps) =>
        useWorkspaceGit(createOptions(hostBridge, selectedRootPath)),
      { initialProps },
    );

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    act(() => {
      result.current.openCommitDialog();
      result.current.setCommitMessage("feat: workspace reset");
      result.current.setSelectedBranch("feature/workspace-reset");
      result.current.setNewBranchName("workspace-reset");
    });

    rerender({ selectedRootPath: null });

    await waitFor(() => {
      expect(result.current.statusLoaded).toBe(false);
      expect(result.current.status).toBeNull();
      expect(result.current.commitDialogOpen).toBe(false);
      expect(result.current.commitMessage).toBe("");
      expect(result.current.selectedBranch).toBe("");
      expect(result.current.newBranchName).toBe("");
    });

    expect(getStatusSnapshot).toHaveBeenCalledTimes(1);
  });
});
