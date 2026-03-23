import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueuedFollowUp } from "../../../domain/timeline";
import { AppStoreProvider } from "../../../state/store";
import type { ComposerModelOption } from "../model/composerPreferences";
import type { ComposerCommandBridge } from "../service/composerCommandBridge";
import { HomeComposer } from "./HomeComposer";

const MODELS: ReadonlyArray<ComposerModelOption> = [{
  id: "model-1",
  value: "gpt-5.2",
  label: "GPT-5.2",
  defaultEffort: "medium",
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
    text: "继续处理失败测试",
    attachments: [],
    model: "gpt-5.2",
    effort: "medium",
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
        defaultModel="gpt-5.2"
        defaultEffort="medium"
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
    const { onSendTurn, onInterruptTurn } = renderComposer({ inputText: "继续分析这个错误", isResponding: true });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(expect.objectContaining({ text: "继续分析这个错误" })));
    expect(onInterruptTurn).not.toHaveBeenCalled();
  });

  it("sends from Enter while responding when a draft exists", async () => {
    const { onSendTurn, onInterruptTurn } = renderComposer({ inputText: "继续分析这个错误", isResponding: true });

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
        createQueuedFollowUp({ id: "follow-2", text: "马上转向继续", mode: "steer" }),
      ],
    });

    expect(screen.getByText("继续处理失败测试")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "插队" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /排队发送.*共 2 条待发送/ }));
    expect(screen.queryByText("继续处理失败测试")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /排队发送.*共 2 条待发送/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "插队" })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "清空" }));

    await waitFor(() => expect(onPromoteQueuedFollowUp).toHaveBeenCalledWith("follow-2"));
    expect(onRemoveQueuedFollowUp).toHaveBeenCalledWith("follow-1");
    expect(onClearQueuedFollowUps).toHaveBeenCalledTimes(1);
  });

  it("disables the first insert button after interrupt is already pending", () => {
    renderComposer({
      interruptPending: true,
      queuedFollowUps: [
        createQueuedFollowUp(),
        createQueuedFollowUp({ id: "follow-2", text: "下一个" }),
      ],
    });

    const insertButtons = screen.getAllByRole("button", { name: "插队" });
    expect(insertButtons[0]).toBeDisabled();
    expect(insertButtons[1]).toBeEnabled();
  });
});
