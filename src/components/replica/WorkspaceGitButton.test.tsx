import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitStatusOutput } from "../../bridge/types";
import type { WorkspaceGitController } from "./git/types";
import { WorkspaceGitButton } from "./WorkspaceGitButton";

const status: GitStatusOutput = {
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

vi.mock("./git/WorkspaceGitView", () => ({
  WorkspaceGitView: () => <div>git-workspace-view</div>
}));

function renderButton(overrides?: Partial<ComponentProps<typeof WorkspaceGitButton>>) {
  return render(
    <WorkspaceGitButton
      controller={createController()}
      selectedRootName="codex-app-plus"
      selectedRootPath="E:/code/project"
      {...overrides}
    />
  );
}

describe("WorkspaceGitButton", () => {
  it("disables actions when no workspace is selected", () => {
    renderButton({ selectedRootPath: null });

    expect(screen.getByRole("button", { name: "鎺ㄩ€佸綋鍓嶅伐浣滃尯" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "閫夋嫨 Git 鎿嶄綔" })).toBeDisabled();
  });

  it("shows git quick actions from dropdown", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "閫夋嫨 Git 鎿嶄綔" }));

    const menuItems = screen.getAllByRole("menuitem");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(menuItems.slice(0, 4).every((item) => item instanceof HTMLButtonElement && item.disabled === false)).toBe(true);
    expect(menuItems).toHaveLength(5);
    expect(menuItems[3]).toHaveTextContent("Git");
  });

  it("opens git workspace dialog from dropdown", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "閫夋嫨 Git 鎿嶄綔" }));
    fireEvent.click(screen.getAllByRole("menuitem")[3]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("git-workspace-view")).toBeInTheDocument();
  });
});
