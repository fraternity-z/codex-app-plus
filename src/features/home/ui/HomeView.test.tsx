import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../composer/model/composerPreferences";
import type { HostBridge } from "../../../bridge/types";
import type { CollaborationPreset, TurnPlanSnapshotEntry } from "../../../domain/timeline";
import type { ThreadSummary, TimelineEntry } from "../../../domain/types";
import type { AppServerClient } from "../../../protocol/appServerClient";
import { AppStoreProvider } from "../../../state/store";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import type { WorkspaceGitController } from "../../git/model/types";
import { HomeView } from "./HomeView";
const {
  mockedUseWorkspaceGit,
  mockedUseTerminalController,
  mockedUseWorkspaceSwitchTracker,
  mockedUseVirtualizer,
} = vi.hoisted(() => ({
  mockedUseWorkspaceGit: vi.fn(),
  mockedUseTerminalController: vi.fn(),
  mockedUseWorkspaceSwitchTracker: vi.fn(),
  mockedUseVirtualizer: vi.fn(),
}));
vi.mock("../../terminal/ui/TerminalDock", () => ({ TerminalDock: () => null }));
vi.mock("../../terminal/ui/TerminalPanel", () => ({ TerminalPanel: () => null }));
vi.mock("../../terminal/hooks/useTerminalController", () => ({
  useTerminalController: mockedUseTerminalController,
}));
vi.mock("../../git/hooks/useWorkspaceGit", () => ({ useWorkspaceGit: mockedUseWorkspaceGit }));
vi.mock("../hooks/useWorkspaceSwitchTracker", () => ({
  useWorkspaceSwitchTracker: mockedUseWorkspaceSwitchTracker,
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mockedUseVirtualizer,
}));

mockedUseVirtualizer.mockImplementation(({ count }: { readonly count: number }) => ({
  getTotalSize: () => count * 280,
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
    index,
    start: index * 280,
  })),
  measureElement: () => undefined,
  scrollToIndex: () => undefined,
}));

const DEFAULT_GIT_BRANCH_PREFIX = "codex/";
const DEFAULT_GIT_PUSH_FORCE_WITH_LEASE = false;
const I18nWrapper = createI18nWrapper("zh-CN");

const MODELS: ReadonlyArray<ComposerModelOption> = [
  {
    id: "model-1",
    value: "gpt-5.2",
    label: "GPT-5.2",
    defaultEffort: "xhigh",
    supportedEfforts: ["minimal", "low", "medium", "high", "xhigh"],
    isDefault: true
  }
];
function createController(): WorkspaceGitController {
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
    ensureDiff: vi.fn().mockResolvedValue(undefined),
    selectDiff: vi.fn().mockResolvedValue(undefined),
    clearDiff: vi.fn(),
    setCommitMessage: vi.fn(),
    setSelectedBranch: vi.fn(),
    setNewBranchName: vi.fn()
  };
}
function createThread(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "First thread",
    branch: null,
    cwd: "E:/code/FPGA",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    queuedCount: 0,
    ...overrides
  };
}

function createHostBridge(): HostBridge {
  return {
    terminal: {
      createSession: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    subscribe: vi.fn().mockResolvedValue(() => undefined),
  } as unknown as HostBridge;
}

function createAppServerClient(): AppServerClient {
  return { request: vi.fn() } as AppServerClient;
}

function createTurnPlanActivity(overrides?: Partial<TurnPlanSnapshotEntry>): TurnPlanSnapshotEntry {
  return {
    id: "plan-1",
    kind: "turnPlanSnapshot",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-plan-1",
    explanation: "Keep the checklist compact.",
    plan: [
      { step: "Inspect UI", status: "inProgress" },
      { step: "Adjust spacing", status: "pending" },
    ],
    ...overrides
  };
}

function createStorageMock(): Storage {
  const storage = new Map<string, string>();
  return {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  };
}

function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  mockedUseWorkspaceGit.mockReturnValue(createController());
  mockedUseWorkspaceSwitchTracker.mockReturnValue({
    switchId: 0,
    rootId: null,
    rootPath: null,
    phase: "idle",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
  });
  const terminalController = {
    activeRootKey: "root-1",
    activeTerminalId: null,
    ensureTerminalWithTitle: vi.fn(),
    hasWorkspace: true,
    hidePanel: vi.fn(),
    onCloseTerminal: vi.fn(),
    onNewTerminal: vi.fn(),
    onSelectTerminal: vi.fn(),
    requestTerminalFocus: vi.fn(),
    restartTerminalSession: vi.fn().mockResolvedValue(undefined),
    showPanel: vi.fn(),
    showPanelOnly: vi.fn(),
    terminalState: {
      closeTerminalSession: vi.fn().mockResolvedValue(undefined),
      containerRef: { current: null },
      focusTerminal: vi.fn(),
      message: "Open a terminal to start a session.",
      readyKey: null,
      restartSession: vi.fn().mockResolvedValue(undefined),
      restartTerminalSession: vi.fn().mockResolvedValue(undefined),
      status: "idle",
      writeTerminalData: vi.fn().mockResolvedValue(undefined),
    },
    terminals: [],
    writeTerminalData: vi.fn().mockResolvedValue(undefined),
  };
  mockedUseTerminalController.mockImplementation((options) => {
    terminalController.hidePanel.mockImplementation(() => options.onHidePanel?.());
    terminalController.showPanel.mockImplementation(() => options.onShowPanel?.());
    return terminalController;
  });
  const {
    appServerClient = createAppServerClient(),
    collaborationPreset: initialCollaborationPreset = "default",
    onSelectCollaborationPreset,
    roots = [{ id: "root-1", name: "FPGA", path: "E:/code/FPGA" }],
    selectedRootId = roots[0]?.id ?? null,
    selectedRootName,
    selectedRootPath,
    selectedThread,
    threads,
    selectedThreadId,
    ...restOverrides
  } = overrides ?? {};
  const activeRoot = roots.find((root) => root.id === selectedRootId) ?? null;
  const resolvedSelectedRootName = selectedRootName ?? activeRoot?.name ?? "选择工作区";
  const resolvedSelectedRootPath = selectedRootPath ?? activeRoot?.path ?? null;
  const defaultThread = createThread({ cwd: resolvedSelectedRootPath ?? "E:/code/FPGA" });
  const resolvedSelectedThread = selectedThread === undefined ? defaultThread : selectedThread;
  const resolvedThreads = threads ?? [defaultThread];
  const resolvedSelectedThreadId = selectedThreadId === undefined
    ? resolvedSelectedThread?.id ?? null
    : selectedThreadId;

  function HomeViewHarness(
    props: Omit<Partial<ComponentProps<typeof HomeView>>, "collaborationPreset" | "onSelectCollaborationPreset">,
  ): JSX.Element {
    const [collaborationPreset, setCollaborationPreset] = useState<CollaborationPreset>(
      initialCollaborationPreset,
    );
    const handleSelectCollaborationPreset = (preset: CollaborationPreset) => {
      setCollaborationPreset(preset);
      onSelectCollaborationPreset?.(preset);
    };

    return (
      <HomeView
        appServerClient={appServerClient}
        hostBridge={createHostBridge()}
        busy={false}
        inputText="请分析当前工作区"
        roots={roots}
        selectedRootId={selectedRootId}
        selectedRootName={resolvedSelectedRootName}
        selectedRootPath={resolvedSelectedRootPath}
        onUpdateWorkspaceLaunchScripts={vi.fn()}
        threads={resolvedThreads}
        selectedThread={resolvedSelectedThread}
        selectedThreadId={resolvedSelectedThreadId}
        activeTurnId={null}
        isResponding={false}
        interruptPending={false}
        activities={[]}
        banners={[]}
        account={null}
        rateLimits={null}
        rateLimitSummary={null}
        queuedFollowUps={[]}
        draftActive={false}
        selectedConversationLoading={false}
        collaborationPreset={collaborationPreset}
        models={MODELS}
        defaultModel="gpt-5.2"
        defaultEffort="xhigh"
        workspaceOpener="vscode"
        embeddedTerminalShell="powerShell"
        gitBranchPrefix={DEFAULT_GIT_BRANCH_PREFIX}
        gitPushForceWithLease={DEFAULT_GIT_PUSH_FORCE_WITH_LEASE}
        threadDetailLevel="commands"
        followUpQueueMode="queue"
        composerEnterBehavior="enter"
        composerPermissionLevel="default"
        connectionStatus="connected"
        fatalError={null}
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        retryScheduledAt={null}
        workspaceSwitch={{
          switchId: 0,
          rootId: null,
          rootPath: null,
          phase: "idle",
          startedAt: null,
          completedAt: null,
          durationMs: null,
          error: null,
        }}
        settingsMenuOpen={false}
        onToggleSettingsMenu={vi.fn()}
        onDismissSettingsMenu={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSkills={vi.fn()}
        onSelectWorkspaceOpener={vi.fn()}
        onSelectComposerPermissionLevel={vi.fn()}
        onSelectRoot={vi.fn()}
        onSelectThread={vi.fn()}
        onSelectCollaborationPreset={handleSelectCollaborationPreset}
        onInputChange={vi.fn()}
        onCreateThread={vi.fn().mockResolvedValue(undefined)}
        onSendTurn={vi.fn().mockResolvedValue(undefined)}
        onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
        onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
        onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
        onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
        onAddRoot={vi.fn()}
        onRemoveRoot={vi.fn()}
        onRetryConnection={vi.fn().mockResolvedValue(undefined)}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
        onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
        onRemoveQueuedFollowUp={vi.fn()}
        onClearQueuedFollowUps={vi.fn()}
        onDismissBanner={vi.fn()}
        {...props}
      />
    );
  }

  const renderResult = render(
    <I18nWrapper>
      <AppStoreProvider><HomeViewHarness {...restOverrides} /></AppStoreProvider>
    </I18nWrapper>
  );

  return {
    ...renderResult,
    terminalController,
  };
}
describe("HomeView", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });
  });

  it("forwards git preferences to useWorkspaceGit", () => {
    renderHomeView({
      gitBranchPrefix: "feature/",
      gitPushForceWithLease: true,
      selectedRootPath: "E:/code/FPGA",
    });

    expect(mockedUseWorkspaceGit).toHaveBeenCalledWith(expect.objectContaining({
      selectedRootPath: "E:/code/FPGA",
      autoRefreshEnabled: false,
      diffStateEnabled: false,
      gitBranchPrefix: "feature/",
      gitPushForceWithLease: true,
    }));
  });

  it("keeps the terminal hidden until the toolbar button is clicked", () => {
    const { terminalController } = renderHomeView();

    expect(mockedUseTerminalController).toHaveBeenCalledWith(expect.objectContaining({
      isOpen: false,
    }));
    fireEvent.click(screen.getByRole("button", { name: "显示终端" }));

    expect(terminalController.showPanel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "隐藏终端" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "隐藏终端" }));

    expect(terminalController.hidePanel).toHaveBeenCalledTimes(1);
  });

  it("submits with plan mode after selecting the collaboration preset", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHomeView({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "打开附件菜单" }));
    const modeToggle = await screen.findByRole("switch", { name: "计划模式" });
    fireEvent.click(modeToggle);

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationPreset: "plan",
        selection: expect.objectContaining({ model: "gpt-5.2", effort: "xhigh", serviceTier: null })
      })
    ));
    expect(modeToggle).toHaveAttribute("aria-checked", "true");
  });

  it("keeps plan mode off by default and submits with the default collaboration preset", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHomeView({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "打开附件菜单" }));

    const modeToggle = await screen.findByRole("switch", { name: "计划模式" });
    expect(modeToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborationPreset: "default",
        selection: expect.objectContaining({ model: "gpt-5.2", effort: "xhigh", serviceTier: null })
      })
    ));
  });

  it("submits with the selected fast service tier", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHomeView({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "打开附件菜单" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "速度" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /快速/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({ model: "gpt-5.2", effort: "xhigh", serviceTier: "fast" })
      })
    ));
  });

  it("disables send while the app server is not ready", () => {
    renderHomeView({ appServerReady: false });

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("does not render MCP shortcuts in the attachment menu", () => {
    renderHomeView();

    fireEvent.click(screen.getByRole("button", { name: "打开附件菜单" }));

    expect(screen.queryByText("MCP shortcuts")).toBeNull();
    expect(screen.queryByText("No MCP tools are currently available.")).toBeNull();
  });

  it("renders proposed_plan content inside the conversation timeline", () => {
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "agent-1",
        kind: "agentMessage",
        role: "assistant",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        text: "<proposed_plan>\n\n## 计划书\n- 第一步\n- 第二步\n</proposed_plan>",
        status: "done"
      }
    ];
    const { container } = renderHomeView({ activities });
    expect(container.querySelector(".home-plan-draft-card")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "计划书" })).toBeInTheDocument();
  });

  it("shows the plan confirmation composer when a plan draft is completed", () => {
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "plan-draft-1",
        kind: "plan",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-plan-draft",
        text: "## 计划书\n- 第一步\n- 第二步",
        status: "done",
      },
    ];

    renderHomeView({ activities });

    expect(screen.getByText("确认实施，或补充你希望 Codex 调整的方案细节。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
    expect(screen.queryByText("Additional input required")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });

  it("submits implementation from the plan confirmation composer", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const onSelectCollaborationPreset = vi.fn();
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "plan-draft-1",
        kind: "plan",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-plan-draft",
        text: "## 计划书\n- 第一步\n- 第二步",
        status: "done",
      },
    ];

    renderHomeView({
      activities,
      collaborationPreset: "plan",
      onSelectCollaborationPreset,
      onSendTurn,
    });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSelectCollaborationPreset).toHaveBeenCalledWith("default");
    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Implement the plan.",
        collaborationPreset: "default",
        collaborationModeOverridePreset: "default",
      }),
    ));
  });

  it("keeps plan mode selected when refining from the plan confirmation composer", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    const onSelectCollaborationPreset = vi.fn();
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "plan-draft-1",
        kind: "plan",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-plan-draft",
        text: "## 计划书\n- 第一步\n- 第二步",
        status: "done",
      },
    ];

    renderHomeView({
      activities,
      collaborationPreset: "plan",
      onSelectCollaborationPreset,
      onSendTurn,
    });
    fireEvent.click(screen.getByRole("button", { name: /否，请告知 Codex 如何调整/ }));
    fireEvent.change(screen.getByPlaceholderText("请告诉 Codex 该如何调整方案"), { target: { value: "把测试拆成两步" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    expect(onSelectCollaborationPreset).not.toHaveBeenCalledWith("default");
    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "把测试拆成两步",
        collaborationPreset: "plan",
      }),
    ));
  });

  it("keeps the task list collapsed by default", () => {
    renderHomeView({ activities: [createTurnPlanActivity()] });

    const toggle = screen.getByRole("button", { name: /任务清单/ });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText("Inspect UI")).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByText("Inspect UI")).toBeInTheDocument();
    expect(screen.getByText("Adjust spacing")).toBeInTheDocument();
  });

  it("renders command cards and shows user input prompts above the composer", () => {
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "cmd-1",
        kind: "commandExecution",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-cmd",
        command: "pnpm test",
        cwd: "E:/code/FPGA",
        processId: "proc-1",
        status: "inProgress",
        commandActions: [],
        output: "running...",
        exitCode: null,
        durationMs: null,
        terminalInteractions: [],
        approvalRequestId: null
      },
      {
        id: "request-1",
        kind: "pendingUserInput",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-question",
        requestId: "request-1",
        request: {
          kind: "userInput",
          id: "request-1",
          rpcId: "request-1",
          method: "item/tool/requestUserInput",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-question",
          questions: [
            {
              id: "answer",
              header: "处理方式",
              question: "请选择下一步",
              isOther: false,
              isSecret: false,
              options: [{ label: "Queue", description: "加入待处理队列" }]
            }
          ],
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-question",
            questions: [
              {
                id: "answer",
                header: "处理方式",
                question: "请选择下一步",
                isOther: false,
                isSecret: false,
                options: [{ label: "Queue", description: "加入待处理队列" }]
              }
            ]
          }
        }
      }
    ];

    const { container } = renderHomeView({ activities });

    expect(screen.getByText("正在执行 pnpm test")).toBeInTheDocument();
    expect(screen.getByText("需要补充信息")).toBeInTheDocument();
    expect(screen.getByText("请选择下一步")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.queryByText("加入待处理队列")).toBeNull();
    expect(screen.queryByText("先回答这个问题，Codex 才能继续执行。")).toBeNull();
    expect(screen.queryByText("Additional input required")).toBeNull();
    expect(container.querySelector(".home-user-input-prompt")).not.toBeNull();
  });

  it("applies thread detail level to the timeline immediately", () => {
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "cmd-compact-1",
        kind: "commandExecution",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-cmd-compact",
        command: "pnpm test",
        cwd: "E:/code/FPGA",
        processId: "proc-1",
        status: "inProgress",
        commandActions: [],
        output: "running...",
        exitCode: null,
        durationMs: null,
        terminalInteractions: [],
        approvalRequestId: null,
      },
    ];

    const { rerender } = renderHomeView({ activities, threadDetailLevel: "compact" });
    expect(screen.queryByText("正在执行 pnpm test")).toBeNull();

    rerender(
      <I18nWrapper>
        <AppStoreProvider><HomeView
          appServerClient={createAppServerClient()}
          hostBridge={createHostBridge()}
          busy={false}
          inputText="请分析当前工作区"
          roots={[{ id: "root-1", name: "FPGA", path: "E:/code/FPGA" }]}
          selectedRootId="root-1"
          selectedRootName="FPGA"
          selectedRootPath="E:/code/FPGA"
          onUpdateWorkspaceLaunchScripts={vi.fn()}
          threads={[createThread()]}
          selectedThread={createThread()}
          selectedThreadId="thread-1"
          activeTurnId={null}
          isResponding={false}
          interruptPending={false}
          activities={activities}
          banners={[]}
          account={null}
          rateLimits={null}
          rateLimitSummary={null}
          queuedFollowUps={[]}
          draftActive={false}
          selectedConversationLoading={false}
          collaborationPreset="default"
          models={MODELS}
          defaultModel="gpt-5.2"
          defaultEffort="xhigh"
          workspaceOpener="vscode"
          embeddedTerminalShell="powerShell"
          gitBranchPrefix={DEFAULT_GIT_BRANCH_PREFIX}
          gitPushForceWithLease={DEFAULT_GIT_PUSH_FORCE_WITH_LEASE}
          threadDetailLevel="commands"
          followUpQueueMode="queue"
          composerEnterBehavior="enter"
          composerPermissionLevel="default"
          connectionStatus="connected"
          fatalError={null}
          authStatus="authenticated"
          authMode="chatgpt"
          authBusy={false}
          authLoginPending={false}
          retryScheduledAt={null}
          workspaceSwitch={{
            switchId: 0,
            rootId: null,
            rootPath: null,
            phase: "idle",
            startedAt: null,
            completedAt: null,
            durationMs: null,
            error: null,
          }}
          settingsMenuOpen={false}
          onToggleSettingsMenu={vi.fn()}
          onDismissSettingsMenu={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenSkills={vi.fn()}
          onSelectWorkspaceOpener={vi.fn()}
          onSelectComposerPermissionLevel={vi.fn()}
          onSelectRoot={vi.fn()}
          onSelectThread={vi.fn()}
          onSelectCollaborationPreset={vi.fn()}
          onInputChange={vi.fn()}
          onCreateThread={vi.fn().mockResolvedValue(undefined)}
          onSendTurn={vi.fn().mockResolvedValue(undefined)}
          onPersistComposerSelection={vi.fn().mockResolvedValue(undefined)}
          onUpdateThreadBranch={vi.fn().mockResolvedValue(undefined)}
          onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
          onPromoteQueuedFollowUp={vi.fn().mockResolvedValue(undefined)}
          onAddRoot={vi.fn()}
          onRemoveRoot={vi.fn()}
          onRetryConnection={vi.fn().mockResolvedValue(undefined)}
          onLogin={vi.fn().mockResolvedValue(undefined)}
          onLogout={vi.fn().mockResolvedValue(undefined)}
          onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
          onRemoveQueuedFollowUp={vi.fn()}
          onClearQueuedFollowUps={vi.fn()}
          onDismissBanner={vi.fn()}
        /></AppStoreProvider>
      </I18nWrapper>
    );

    expect(screen.getByText("正在执行 pnpm test")).toBeInTheDocument();
  });

  it("hides Auth/Plan pills and info banners above the conversation", () => {
    renderHomeView({
      account: { authMode: "apikey", planType: "unknown", email: null },
      rateLimitSummary: "Rate limit: default",
      banners: [{ id: "banner-1", level: "info", title: "Skills changed", detail: null, source: "test" }],
    });

    expect(screen.queryByText(/Auth:/)).toBeNull();
    expect(screen.queryByText(/Rate limit:/)).toBeNull();
    expect(screen.queryByText("Skills changed")).toBeNull();
  });

  it("shows dismissible warning and error banners above the conversation", () => {
    const onDismissBanner = vi.fn();
    renderHomeView({
      onDismissBanner,
      banners: [
        { id: "banner-warning", level: "warning", title: "配置待确认", detail: "需要重新加载 MCP。", source: "test" },
        { id: "banner-error", level: "error", title: "发送失败", detail: "network down", source: "test" },
      ],
    });

    expect(screen.getByText("配置待确认")).toBeInTheDocument();
    expect(screen.getByText("发送失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭通知：发送失败" }));

    expect(onDismissBanner).toHaveBeenCalledWith("banner-error");
  });

  it("omits the generic workspace conversation title when no thread is active", () => {
    renderHomeView({
      selectedThread: null,
      selectedThreadId: null,
    });

    expect(screen.queryByRole("heading", { level: 1, name: "工作区会话" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("shows the current workspace empty state after creating a draft thread", () => {
    renderHomeView({
      selectedThread: null,
      selectedThreadId: null,
      draftActive: true,
    });

    expect(screen.getByRole("heading", { level: 2, name: "Current workspace" })).toBeInTheDocument();
    expect(screen.queryByText("Ready to start a new thread")).toBeNull();
  });

  it("opens the workspace selector menu and switches workspace from the empty state", async () => {
    const onSelectRoot = vi.fn();
    const roots = [
      { id: "root-1", name: "FPGA", path: "E:/code/FPGA" },
      { id: "root-2", name: "codex-app-plus", path: "E:/code/codex-app-plus" },
    ];

    renderHomeView({
      roots,
      selectedRootId: "root-1",
      selectedThread: null,
      selectedThreadId: null,
      onSelectRoot,
    });

    fireEvent.click(screen.getByRole("button", { name: "选择工作区：FPGA" }));

    expect(screen.getByRole("menu", { name: "选择工作区" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "FPGA" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("menuitemradio", { name: "codex-app-plus" }));

    await waitFor(() => expect(onSelectRoot).toHaveBeenCalledWith("root-2"));
  });

  it("truncates long toolbar titles while preserving the full title in tooltip", () => {
    const longTitle = "这是一个用于验证工具栏标题截断效果的超长测试标题，末尾保留工作区路径以确保 tooltip 能完整展示 E:/code/openai.chatgpt-26.304.20706-win32-x64";

    renderHomeView({
      selectedThread: createThread({ title: longTitle }),
      selectedThreadId: "thread-1",
      activities: [
        {
          id: "agent-1",
          kind: "agentMessage",
          role: "assistant",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          text: "ok",
          status: "done"
        }
      ]
    });

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(`${longTitle.slice(0, 24)}...`);
    expect(heading.textContent ?? "").not.toContain("E:/code");
    expect(heading).toHaveAttribute("title", longTitle);
  });

  it("shows queued follow-ups and forwards insert/remove/clear actions", async () => {
    const onPromoteQueuedFollowUp = vi.fn().mockResolvedValue(undefined);
    const onRemoveQueuedFollowUp = vi.fn();
    const onClearQueuedFollowUps = vi.fn();

    renderHomeView({
      queuedFollowUps: [
        {
          id: "follow-1",
          attachments: [],
          text: "continue fix",
          model: "gpt-5.2",
          effort: "medium",
          serviceTier: null,
          permissionLevel: "default",
          collaborationPreset: "default",
          mode: "queue",
          createdAt: "2026-03-06T09:00:00.000Z"
        }
      ],
      onPromoteQueuedFollowUp,
      onRemoveQueuedFollowUp,
      onClearQueuedFollowUps
    });

    expect(screen.getByRole("button", { name: /排队发送.*共 1 条待发送/ })).toBeInTheDocument();
    expect(screen.getByText("continue fix")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "插队" }));
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    fireEvent.click(screen.getByRole("button", { name: "清空" }));

    await waitFor(() => expect(onPromoteQueuedFollowUp).toHaveBeenCalledWith("follow-1"));
    expect(onRemoveQueuedFollowUp).toHaveBeenCalledWith("follow-1");
    expect(onClearQueuedFollowUps).toHaveBeenCalledTimes(1);
  });

  it("hides reconnecting timeline entries and clears the reconnect toast after output resumes", async () => {
    const onRetryConnection = vi.fn().mockResolvedValue(undefined);
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "retry-1",
        kind: "agentMessage",
        role: "assistant",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "retry-1",
        text: "Reconnecting... 2/5",
        status: "done",
      },
      {
        id: "agent-2",
        kind: "agentMessage",
        role: "assistant",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "agent-2",
        text: "继续任务",
        status: "done",
      },
    ];

    renderHomeView({
      connectionStatus: "error",
      retryScheduledAt: Date.now() + 5_000,
      activities,
      onRetryConnection,
    });

    expect(screen.queryByText(/Reconnecting/i)).toBeNull();
    expect(screen.queryByText("正在重连… 2/5")).toBeNull();
    expect(screen.getByText("连接异常，正在等待自动重试")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "立即重试" }));
    expect(onRetryConnection).toHaveBeenCalled();
  });

  it("shows the reconnect toast while reconnecting is still the latest visible status", async () => {
    const onRetryConnection = vi.fn().mockResolvedValue(undefined);
    const activities: ReadonlyArray<TimelineEntry> = [
      {
        id: "retry-1",
        kind: "agentMessage",
        role: "assistant",
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "retry-1",
        text: "Reconnecting... 2/5",
        status: "done",
      },
    ];

    renderHomeView({
      connectionStatus: "error",
      retryScheduledAt: Date.now() + 5_000,
      activities,
      onRetryConnection,
    });

    expect(screen.queryByText(/Reconnecting/i)).toBeNull();
    expect(screen.getByText("正在重连… 2/5")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "立即重试" }));
    expect(onRetryConnection).toHaveBeenCalled();
  });
});
