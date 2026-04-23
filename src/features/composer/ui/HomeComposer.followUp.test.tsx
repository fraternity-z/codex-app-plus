import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueuedFollowUp } from "../../../domain/timeline";
import { AppStoreProvider } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.5",
  label: "gpt-5.5",
  defaultEffort: "high",
  supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
  isDefault: true,
}];

function createGitController(): import("../../git/model/types").WorkspaceGitController {
  return {
    loading: false,
    pendingAction: null,
    status: null,
    statusLoaded: false,
    hasRepository: false,
    error: null,
    notice: null,
    commitDialogOpen: false,
    commitDialogError: null,
    branchRefsLoading: false,
    branchRefsLoaded: true,
    remoteUrlLoading: false,
    remoteUrlLoaded: true,
    commitMessage: "",
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
  };
}

function createCommandBridge(): ComposerCommandBridge {
  return {
    startFuzzySession: vi.fn().mockResolvedValue(undefined),
    updateFuzzySession: vi.fn().mockResolvedValue(undefined),
    stopFuzzySession: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockResolvedValue({}),
  };
}

function createQueuedFollowUp(overrides?: Partial<QueuedFollowUp>): QueuedFollowUp {
  return {
    id: "follow-1",
    text: "Continue fixing the failing test",
    attachments: [],
    model: "gpt-5.5",
    effort: "high",
    serviceTier: null,
    permissionLevel: "default",
    collaborationPreset: "default",
    mode: "queue",
    createdAt: "2026-03-06T09:00:00.000Z",
    ...overrides,
  };
}

function renderComposer(overrides?: Partial<ComponentProps<typeof HomeComposer>>) {
  const onSendTurn = vi.fn().mockResolvedValue(undefined);
  const onInterruptTurn = vi.fn().mockResolvedValue(undefined);
  const onPromoteQueuedFollowUp = vi.fn().mockResolvedValue(undefined);
  const onRemoveQueuedFollowUp = vi.fn();
  const onClearQueuedFollowUps = vi.fn();

  render(
    <AppStoreProvider>
      <HomeComposer
        busy={false}
        inputText=""
        collaborationPreset="default"
        models={MODELS}
        defaultModel="gpt-5.5"
        defaultEffort="high"
        selectedRootPath="E:/code/codex-app-plus"
        queuedFollowUps={[]}
        followUpQueueMode="queue"
        composerEnterBehavior="enter"
        permissionLevel="default"
        gitController={createGitController()}
        selectedThreadId="thread-1"
        selectedThreadBranch={null}
        isResponding={false}
        interruptPending={false}
        composerCommandBridge={createCommandBridge()}
        onSelectCollaborationPreset={vi.fn()}
        onInputChange={vi.fn()}
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={onSendTurn}
        onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
        onSelectPermissionLevel={vi.fn()}
        onToggleDiff={vi.fn()}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={onInterruptTurn}
        onPromoteQueuedFollowUp={onPromoteQueuedFollowUp}
        onRemoveQueuedFollowUp={onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={onClearQueuedFollowUps}
        {...overrides}
      />
    </AppStoreProvider>,
    { wrapper: createI18nWrapper("en-US") },
  );

  return { onSendTurn, onInterruptTurn, onPromoteQueuedFollowUp, onRemoveQueuedFollowUp, onClearQueuedFollowUps };
}

describe("HomeComposer follow-up", () => {
  it("shows the stop action while responding without a draft", () => {
    const { onSendTurn, onInterruptTurn } = renderComposer({ isResponding: true });

    fireEvent.click(screen.getByRole("button", { name: "Stop response" }));

    expect(onInterruptTurn).toHaveBeenCalledTimes(1);
    expect(onSendTurn).not.toHaveBeenCalled();
  });

  it("sends the draft while responding when text is present", async () => {
    const { onSendTurn, onInterruptTurn } = renderComposer({ inputText: "Continue analyzing this error", isResponding: true });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ text: "Continue analyzing this error" })));
    expect(onInterruptTurn).not.toHaveBeenCalled();
  });

  it("sends from Enter while responding when a draft exists", async () => {
    const { onSendTurn, onInterruptTurn } = renderComposer({ inputText: "Continue analyzing this error", isResponding: true });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledTimes(1));
    expect(onInterruptTurn).not.toHaveBeenCalled();
  });

  it("interrupts from Enter while responding without a draft", () => {
    const { onSendTurn, onInterruptTurn } = renderComposer({ inputText: "", isResponding: true });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onInterruptTurn).toHaveBeenCalledTimes(1);
    expect(onSendTurn).not.toHaveBeenCalled();
  });

  it("renders the queued follow-up drawer expanded by default and supports collapsing", async () => {
    const { onPromoteQueuedFollowUp, onRemoveQueuedFollowUp, onClearQueuedFollowUps } = renderComposer({
      queuedFollowUps: [
        createQueuedFollowUp(),
        createQueuedFollowUp({ id: "follow-2", text: "Immediately switch over and continue", mode: "steer" }),
      ],
    });

    expect(screen.getByText("Continue fixing the failing test")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Promote" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Queued sends.*2 queued/ }));
    expect(screen.queryByText("Continue fixing the failing test")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Queued sends.*2 queued/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Promote" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(onPromoteQueuedFollowUp).toHaveBeenCalledWith("follow-2"));
    expect(onRemoveQueuedFollowUp).toHaveBeenCalledWith("follow-1");
    expect(onClearQueuedFollowUps).toHaveBeenCalledTimes(1);
  });

  it("disables the first insert button after interrupt is already pending", () => {
    renderComposer({
      interruptPending: true,
      queuedFollowUps: [
        createQueuedFollowUp(),
        createQueuedFollowUp({ id: "follow-2", text: "Next item" }),
      ],
    });

    const insertButtons = screen.getAllByRole("button", { name: "Promote" });
    expect(insertButtons[0]).toBeDisabled();
    expect(insertButtons[1]).toBeEnabled();
  });

  it("shows the english attachment summary for attachment-only queued follow-ups", () => {
    renderComposer({
      queuedFollowUps: [
        createQueuedFollowUp({
          text: "",
          attachments: [
            {
              id: "attachment-1",
              kind: "image",
              source: "localImage",
              value: "C:/tmp/image.png",
              name: "image.png",
            },
          ],
        }),
      ],
    });

    expect(screen.getByText("Includes 1 attachment")).toBeInTheDocument();
    expect(screen.getByText("image.png")).toBeInTheDocument();
  });
});
