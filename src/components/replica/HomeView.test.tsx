import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../app/composerPreferences";
import type { HostBridge } from "../../bridge/types";
import type { ThreadSummary, TimelineEntry } from "../../domain/types";
import { AppStoreProvider } from "../../state/store";
import type { WorkspaceGitController } from "./git/types";
import { HomeView } from "./HomeView";
const { mockedUseWorkspaceGit } = vi.hoisted(() => ({ mockedUseWorkspaceGit: vi.fn() }));
vi.mock("../terminal/TerminalPanel", () => ({ TerminalPanel: () => null }));
vi.mock("./git/useWorkspaceGit", () => ({ useWorkspaceGit: mockedUseWorkspaceGit }));
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
    checkoutSelectedBranch: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
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
    cwd: "E:/code/FPGA",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    source: "rpc",
    status: "idle",
    activeFlags: [],
    queuedCount: 0,
    ...overrides
  };
}
function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  mockedUseWorkspaceGit.mockReturnValue(createController());
  const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };
  const thread = createThread();
  return render(
    <AppStoreProvider><HomeView
      hostBridge={{} as HostBridge}
      busy={false}
      inputText="检查工作区"
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
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="xhigh"
      workspaceOpener="vscode"
      embeddedTerminalShell="powerShell"
      followUpQueueMode="queue"
      composerEnterBehavior="enter"
      composerPermissionLevel="default"
      connectionStatus="connected"
      fatalError={null}
      authStatus="authenticated"
      authMode="chatgpt"
      retryScheduledAt={null}
      settingsMenuOpen={false}
      onToggleSettingsMenu={vi.fn()}
      onDismissSettingsMenu={vi.fn()}
      onOpenSettings={vi.fn()}
      onSelectWorkspaceOpener={vi.fn()}
      onSelectComposerPermissionLevel={vi.fn()}
      onSelectRoot={vi.fn()}
      onSelectThread={vi.fn()}
      onInputChange={vi.fn()}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onInterruptTurn={vi.fn().mockResolvedValue(undefined)}
      onAddRoot={vi.fn()}
      onRemoveRoot={vi.fn()}
      onRetryConnection={vi.fn().mockResolvedValue(undefined)}
      onLogin={vi.fn().mockResolvedValue(undefined)}
      onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      onRemoveQueuedFollowUp={vi.fn()}
      onClearQueuedFollowUps={vi.fn()}
      {...overrides}
    /></AppStoreProvider>
  );
}
describe("HomeView", () => {
  it("submits with plan mode after toggling the attachment switch", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);
    renderHomeView({ onSendTurn });
    fireEvent.click(screen.getByRole("button", { name: "Open attachment menu" }));
    fireEvent.click(screen.getByRole("switch", { name: "Toggle plan mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        planModeEnabled: true,
        selection: expect.objectContaining({ model: "gpt-5.2", effort: "xhigh" })
      })
    );
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
        text: "先给结论。\n\n<proposed_plan>\n## 计划书\n\n- 第一步\n- 第二步\n</proposed_plan>",
        status: "done"
      }
    ];
    const { container } = renderHomeView({ activities });
    expect(container.querySelector(".home-chat-proposed-plan")).toBeNull();
    expect(screen.getByRole("heading", { name: "计划书" })).toBeInTheDocument();
  });

  it("renders command cards and inline request cards", () => {
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
          method: "item/tool/requestUserInput",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-question",
          questions: [
            {
              id: "answer",
              header: "模式",
              question: "请选择处理方式",
              isOther: false,
              isSecret: false,
              options: [{ label: "Queue", description: "加入队列" }]
            }
          ],
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-question",
            questions: [
              {
                id: "answer",
                header: "模式",
                question: "请选择处理方式",
                isOther: false,
                isSecret: false,
                options: [{ label: "Queue", description: "加入队列" }]
              }
            ]
          }
        }
      }
    ];

    renderHomeView({ activities });

    expect(screen.getByText("正在执行命令：pnpm test")).toBeInTheDocument();
    expect(screen.getByText("Additional input required")).toBeInTheDocument();
    expect(screen.getByText("请选择处理方式")).toBeInTheDocument();
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

  it("truncates long toolbar titles while preserving the full title in tooltip", () => {
    const longTitle = "现在能不能改造渲染ui，包括用户发送消息之后的ai正在思考以及正常工具调用链路块等渲染方式和官方插件一致？ E:/code/openai.chatgpt-26.304.20706-win32-x64";

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
          text: "继续修测试",
          model: "gpt-5.2",
          effort: "medium",
          permissionLevel: "default",
          planModeEnabled: false,
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
});
