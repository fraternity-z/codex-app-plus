import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../composer/model/composerPreferences";
import type { HostBridge } from "../../../bridge/types";
import type { CollaborationPreset, TurnPlanSnapshotEntry } from "../../../domain/timeline";
import type { ThreadSummary, TimelineEntry } from "../../../domain/types";
import { AppStoreProvider } from "../../../state/store";
import type { WorkspaceGitController } from "../../git/model/types";
import { HomeView } from "./HomeView";
const { mockedUseWorkspaceGit } = vi.hoisted(() => ({ mockedUseWorkspaceGit: vi.fn() }));
vi.mock("../../terminal/ui/TerminalPanel", () => ({ TerminalPanel: () => null }));
vi.mock("../../git/hooks/useWorkspaceGit", () => ({ useWorkspaceGit: mockedUseWorkspaceGit }));
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
    checkoutBranch: vi.fn().mockResolvedValue(true),
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

function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  mockedUseWorkspaceGit.mockReturnValue(createController());
  const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };
  const thread = createThread();
  const {
    collaborationPreset: initialCollaborationPreset = "default",
    onSelectCollaborationPreset,
    ...restOverrides
  } = overrides ?? {};

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
        hostBridge={{} as HostBridge}
        busy={false}
        inputText="请分析当前工作区"
        roots={[root]}
        selectedRootId={root.id}
        selectedRootName={root.name}
        selectedRootPath={root.path}
        threads={[thread]}
        selectedThread={thread}
        selectedThreadId={thread.id}
        activeTurnId={null}
        isResponding={false}
        interruptPending={false}
        activities={[]}
        banners={[]}
        account={null}
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
        settingsMenuOpen={false}
        onToggleSettingsMenu={vi.fn()}
        onDismissSettingsMenu={vi.fn()}
        onOpenSettings={vi.fn()}
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

  return render(
    <AppStoreProvider><HomeViewHarness {...restOverrides} /></AppStoreProvider>
  );
}
describe("HomeView", () => {
  it("submits with plan mode after selecting the collaboration preset", async () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHomeView({ onSendTurn });

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fast" }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({ model: "gpt-5.2", effort: "xhigh", serviceTier: "fast" })
      })
    ));
  });

  it("does not render MCP shortcuts in the attachment menu", () => {
    renderHomeView();

    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));

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

    renderHomeView({ activities, onSendTurn });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));

    await waitFor(() => expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Implement the plan.",
        collaborationPreset: "default",
        collaborationModeOverridePreset: "default",
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

    expect(screen.getByText("正在执行命令：pnpm test")).toBeInTheDocument();
    expect(screen.getByText("需要补充信息")).toBeInTheDocument();
    expect(screen.getByText("请选择下一步")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
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
    expect(screen.queryByText("正在执行命令：pnpm test")).toBeNull();

    rerender(
      <AppStoreProvider><HomeView
        hostBridge={{} as HostBridge}
        busy={false}
        inputText="请分析当前工作区"
        roots={[{ id: "root-1", name: "FPGA", path: "E:/code/FPGA" }]}
        selectedRootId="root-1"
        selectedRootName="FPGA"
        selectedRootPath="E:/code/FPGA"
        threads={[createThread()]}
        selectedThread={createThread()}
        selectedThreadId="thread-1"
        activeTurnId={null}
        isResponding={false}
        interruptPending={false}
        activities={activities}
        banners={[]}
        account={null}
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
        settingsMenuOpen={false}
        onToggleSettingsMenu={vi.fn()}
        onDismissSettingsMenu={vi.fn()}
        onOpenSettings={vi.fn()}
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
    );

    expect(screen.getByText("正在执行命令：pnpm test")).toBeInTheDocument();
  });

  it("hides Auth/Plan pills and info banners above the conversation", () => {
    renderHomeView({
      account: { authMode: "apikey", planType: "unknown" },
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

  it("uses the generic toolbar title for a new thread instead of the workspace name", () => {
    renderHomeView({
      selectedThread: null,
      selectedThreadId: null,
    });

    expect(screen.getByRole("heading", { level: 1, name: "工作区会话" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "FPGA" })).toBeNull();
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
    expect(heading.textContent).toContain("…");
    expect(heading).toHaveAttribute("title", longTitle);
  });

  it("shows queued follow-ups and forwards remove/clear actions", () => {
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
      onRemoveQueuedFollowUp,
      onClearQueuedFollowUps
    });

    expect(screen.getByText("Queued follow-ups")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    fireEvent.click(screen.getByRole("button", { name: "清空" }));

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
