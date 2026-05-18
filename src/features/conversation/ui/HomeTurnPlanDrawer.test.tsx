import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TurnPlanSnapshotEntry } from "../../../domain/timeline";
import type { WorkspaceGitController } from "../../git/model/types";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { createTurnPlanModel } from "../model/homeTurnPlanModel";
import { HomeTurnPlanDrawer } from "./HomeTurnPlanDrawer";

function createPlanEntry(overrides?: Partial<TurnPlanSnapshotEntry>): TurnPlanSnapshotEntry {
  return {
    id: "plan-test",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    explanation: "Track the key steps",
    plan: [
      { step: "Prepare UI", status: "inProgress" },
      { step: "Wire data", status: "completed" },
    ],
    ...overrides,
  } satisfies TurnPlanSnapshotEntry;
}

function createGitController(overrides?: Partial<WorkspaceGitController>): WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: {
      isRepository: true,
      repoRoot: "E:/code/codex-app-plus",
      branch: { head: "main", upstream: "origin/main", ahead: 0, behind: 0, detached: false },
      remoteName: "origin",
      remoteUrl: "https://example.com/repo.git",
      branches: [{ name: "main", upstream: "origin/main", isCurrent: true }],
      staged: [],
      unstaged: [{ path: "src/App.tsx", originalPath: null, indexStatus: " ", worktreeStatus: "M" }],
      untracked: [],
      conflicted: [],
      isClean: false,
    },
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

describe("HomeTurnPlanDrawer", () => {
  it("renders the progress card with overview sections when expanded", () => {
    const plan = createTurnPlanModel(createPlanEntry());
    const { container } = render(
      <HomeTurnPlanDrawer
        plan={plan}
        overview={{ additions: 12, changedFiles: 2, deletions: 4, generatedImages: 1 }}
        pinned={false}
        visible
        onTogglePinned={() => undefined}
      />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    expect(screen.getByRole("region", { name: "Progress card" })).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelector(".home-turn-progress-card")).toHaveAttribute("data-plan-state", "active");
    expect(screen.getByText("Prepare UI")).toBeInTheDocument();
    expect(screen.getByLabelText("Prepare UI: In progress")).toBeInTheDocument();
    expect(screen.getByText("Wire data")).toBeInTheDocument();
    expect(screen.getByLabelText("Wire data: Completed")).toBeInTheDocument();
    expect(screen.getByText("Branch details")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-4")).toBeInTheDocument();
    expect(screen.getByText("Git operations")).toBeInTheDocument();
    expect(screen.getByText("GitHub CLI not authenticated")).toBeInTheDocument();
    expect(screen.getByText("Generated results")).toBeInTheDocument();
    expect(screen.getByText("1 generated image(s)")).toBeInTheDocument();
  });

  it("shows empty state when plan is cleared", () => {
    const plan = createTurnPlanModel(createPlanEntry({ plan: [], explanation: null, id: "plan-empty" }));
    render(<HomeTurnPlanDrawer plan={plan} pinned={false} visible onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByText("Task list cleared, waiting for a new plan")).toBeInTheDocument();
  });

  it("marks the card complete when all plan steps are done", () => {
    const plan = createTurnPlanModel(createPlanEntry({
      id: "plan-complete",
      plan: [
        { step: "Prepare UI", status: "completed" },
        { step: "Wire data", status: "completed" },
      ],
    }));
    const { container } = render(<HomeTurnPlanDrawer plan={plan} pinned={false} visible onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(container.querySelector(".home-turn-progress-card")).toHaveAttribute("data-plan-state", "complete");
    expect(screen.getByText("Completed 2 / 2")).toBeInTheDocument();
  });

  it("invokes toggle handler when pressing the pin button", () => {
    const onToggle = vi.fn();
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-pinned" }));
    render(<HomeTurnPlanDrawer plan={plan} pinned={false} visible onTogglePinned={onToggle} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin progress card" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("marks the card as pinned when fixed open", () => {
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-fixed" }));
    const { container } = render(
      <HomeTurnPlanDrawer plan={plan} pinned visible onTogglePinned={() => undefined} />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    expect(container.querySelector(".home-turn-progress-card-pinned")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Unpin progress card" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the card without a current plan when a conversation is visible", () => {
    render(<HomeTurnPlanDrawer plan={null} pinned={false} visible onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.getByRole("region", { name: "Progress card" })).toBeInTheDocument();
    expect(screen.getByText("Longer replies will show progress")).toBeInTheDocument();
    expect(screen.getByText("Branch details")).toBeInTheDocument();
  });

  it("renders only overview sections when progress is hidden", () => {
    const plan = createTurnPlanModel(createPlanEntry({ id: "plan-overview-only" }));
    render(
      <HomeTurnPlanDrawer
        plan={plan}
        overview={{ additions: 7, changedFiles: 2, deletions: 3, generatedImages: 0 }}
        pinned={false}
        showProgress={false}
        visible
        onTogglePinned={() => undefined}
      />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    expect(screen.getByRole("region", { name: "Progress card" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin progress card" })).toBeInTheDocument();
    expect(screen.queryByText("Progress")).toBeNull();
    expect(screen.queryByText("Prepare UI")).toBeNull();
    expect(screen.getByText("Branch details")).toBeInTheDocument();
    expect(screen.getByText("+7")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("opens the diff sidebar from the changes row", () => {
    const onOpenDiff = vi.fn();
    render(
      <HomeTurnPlanDrawer
        plan={null}
        pinned={false}
        showProgress={false}
        visible
        onOpenDiff={onOpenDiff}
        onTogglePinned={() => undefined}
      />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Changes" }));

    expect(onOpenDiff).toHaveBeenCalledTimes(1);
  });

  it("opens git operations from the Git row", () => {
    const openCommitDialog = vi.fn();
    const gitController = createGitController({ openCommitDialog });
    render(
      <HomeTurnPlanDrawer
        gitController={gitController}
        plan={null}
        pinned={false}
        showProgress={false}
        visible
        onTogglePinned={() => undefined}
      />,
      {
        wrapper: createI18nWrapper("en-US"),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Git operations" }));

    const menu = screen.getByRole("menu", { name: "Git operations" });
    expect(within(menu).getByRole("menuitem", { name: "提交" })).not.toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "推送" })).not.toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "创建分支" })).not.toBeDisabled();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "提交" }));

    expect(openCommitDialog).toHaveBeenCalledTimes(1);
  });

  it("stays hidden in the new conversation empty state", () => {
    render(<HomeTurnPlanDrawer plan={null} pinned={false} visible={false} onTogglePinned={() => undefined} />, {
      wrapper: createI18nWrapper("en-US"),
    });

    expect(screen.queryByRole("region", { name: "Progress card" })).toBeNull();
  });
});
