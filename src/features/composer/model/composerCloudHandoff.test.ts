import { describe, expect, it, vi } from "vitest";
import type { WorkspaceGitController } from "../../git/model/types";
import {
  buildCodexCloudExecCommand,
  buildCodexCloudPrompt,
  CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY,
  formatCodexCloudExecOutput,
  readStoredCodexCloudEnvironmentId,
  resolveCodexCloudBranch,
  writeStoredCodexCloudEnvironmentId,
} from "./composerCloudHandoff";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
    removeItem: vi.fn(() => {
      value = null;
    }),
  };
}

function createController(overrides?: Partial<WorkspaceGitController>): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: {
      isRepository: true,
      repoRoot: "E:/code/codex-app-plus",
      branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
      remoteName: "origin",
      remoteUrl: "https://example.com/repo.git",
      branches: [
        { name: "main", upstream: "origin/main", isCurrent: true },
        { name: "feature/cloud", upstream: null, isCurrent: false },
      ],
      staged: [],
      unstaged: [],
      untracked: [],
      conflicted: [],
      isClean: true,
    },
    statusLoaded: true,
    hasRepository: true,
    error: null,
    notice: null,
    commitDialogOpen: false,
    commitDialogError: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "",
    commitInstructions: "",
    selectedBranch: "",
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
    ensureBranchRefs: vi.fn().mockResolvedValue(undefined),
    ensureRemoteUrl: vi.fn().mockResolvedValue(undefined),
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn(),
    ...overrides,
  };
}

describe("composerCloudHandoff", () => {
  it("stores normalized Codex Cloud environment ids", () => {
    const storage = createStorage();

    expect(writeStoredCodexCloudEnvironmentId("  env_123  ", storage)).toBe("env_123");
    expect(storage.setItem).toHaveBeenCalledWith(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY, "env_123");
    expect(readStoredCodexCloudEnvironmentId(storage)).toBe("env_123");

    expect(writeStoredCodexCloudEnvironmentId("   ", storage)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY);
  });

  it("builds the official codex cloud exec argv", () => {
    expect(buildCodexCloudExecCommand({
      environmentId: "env_123",
      branch: "feature/cloud",
      prompt: "Implement the task",
    })).toEqual([
      "codex",
      "cloud",
      "exec",
      "--env",
      "env_123",
      "--branch",
      "feature/cloud",
      "Implement the task",
    ]);
  });

  it("includes composer file references in the cloud prompt", () => {
    expect(buildCodexCloudPrompt({
      bodyText: "Review this change",
      fileReferencePaths: ["src/App.tsx", " src/main.tsx "],
    })).toBe("Review this change\n\nWorkspace file references:\n- src/App.tsx\n- src/main.tsx");
  });

  it("prefers the selected thread branch and avoids detached heads", () => {
    expect(resolveCodexCloudBranch(createController(), "feature/cloud")).toBe("feature/cloud");
    expect(resolveCodexCloudBranch(createController(), null)).toBe("main");
    expect(resolveCodexCloudBranch(createController({
      status: {
        ...createController().status!,
        branch: { head: "7f3cabc", upstream: null, ahead: 0, behind: 0, detached: true },
      },
    }), null)).toBeNull();
  });

  it("formats buffered command output for banners", () => {
    expect(formatCodexCloudExecOutput({ exitCode: 0, stdout: "task created\n", stderr: "" })).toBe("task created");
    expect(formatCodexCloudExecOutput({ exitCode: 0, stdout: "", stderr: "" })).toBeNull();
  });
});
