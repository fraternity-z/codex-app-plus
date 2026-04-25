import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GitStatusOutput } from "../../../bridge/types";
import type { WorkspaceGitController } from "../model/types";
import { GitCommitDialog } from "./GitCommitDialog";

function createStatus(overrides?: Partial<GitStatusOutput>): GitStatusOutput {
  return {
    isRepository: true,
    repoRoot: "E:/code/project",
    branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
    remoteName: "origin",
    remoteUrl: "https://example.com/repo.git",
    branches: [{ name: "main", upstream: "origin/main", isCurrent: true }],
    staged: [{ path: "src/App.tsx", originalPath: null, indexStatus: "M", worktreeStatus: " " }],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isClean: false,
    ...overrides,
  };
}

function renderDialog(overrides?: Partial<WorkspaceGitController>) {
  const commit = vi.fn().mockResolvedValue(undefined);
  const closeCommitDialog = vi.fn();

  function Harness(): JSX.Element {
    const [commitMessage, setCommitMessage] = useState("");
    const controller: WorkspaceGitController = {
      loading: false,
      pendingAction: null,
      status: createStatus(),
      statusLoaded: true,
      hasRepository: true,
      error: null,
      notice: null,
      commitDialogOpen: true,
      commitDialogError: null,
      branchRefsLoading: false,
      branchRefsLoaded: true,
      remoteUrlLoading: false,
      remoteUrlLoaded: true,
      commitMessage,
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
      commit,
      openCommitDialog: vi.fn(),
      closeCommitDialog,
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
      setCommitMessage,
      setSelectedBranch: vi.fn(),
      setNewBranchName: vi.fn(),
      ...overrides,
    };

    return <GitCommitDialog controller={controller} />;
  }

  render(<Harness />);
  return { commit, closeCommitDialog };
}

describe("GitCommitDialog", () => {
  it("opens with focus on the commit message and keeps submit disabled until filled", async () => {
    renderDialog();

    const textarea = screen.getByLabelText("提交消息");
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
    expect(screen.getByText("请填写提交消息后再继续。")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("留空以自动生成提交消息（未接入）")).toBeInTheDocument();
  });

  it("submits with Ctrl+Enter after the user enters a message", async () => {
    const { commit } = renderDialog();
    const textarea = screen.getByLabelText("提交消息");

    fireEvent.change(textarea, { target: { value: "feat: improve commit flow" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  });

  it("shows auto-stage guidance when only unstaged changes exist", async () => {
    renderDialog({
      status: createStatus({
        staged: [],
        unstaged: [
          {
            path: "src/App.tsx",
            originalPath: null,
            indexStatus: " ",
            worktreeStatus: "M",
          },
        ],
      }),
    });

    expect(
      screen.getByText("填写提交消息后，将自动暂存当前更改并提交。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeDisabled();
  });

  it("renders unwired follow-up copy and keeps those actions disabled", () => {
    renderDialog();

    expect(screen.getByRole("switch", { name: "包含取消暂存的更改（未接入）" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("switch", { name: "草稿（未接入）" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("radio", { name: "提交" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "提交并推送（未接入）" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "提交并创建 PR（未接入）" })).toBeDisabled();
    expect(screen.getByText("自定义指令（未接入）")).toBeInTheDocument();
  });

  it("closes when the user clicks the close button", () => {
    const { closeCommitDialog } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "关闭提交卡片" }));

    expect(closeCommitDialog).toHaveBeenCalledTimes(1);
  });
});
