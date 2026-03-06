import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerModelOption } from "../../app/composerPreferences";
import type { HostBridge } from "../../bridge/types";
import type { ConversationMessage, ThreadSummary } from "../../domain/types";
import type { WorkspaceGitController } from "./git/types";
import { HomeView } from "./HomeView";

const { mockedUseWorkspaceGit } = vi.hoisted(() => ({
  mockedUseWorkspaceGit: vi.fn()
}));

vi.mock("../terminal/TerminalPanel", () => ({
  TerminalPanel: () => null
}));

vi.mock("./git/useWorkspaceGit", () => ({
  useWorkspaceGit: mockedUseWorkspaceGit
}));

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

function createController(overrides?: Partial<WorkspaceGitController>): WorkspaceGitController {
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
    setNewBranchName: vi.fn(),
    ...overrides
  };
}

function createThread(overrides?: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: "thread-1",
    title: "First thread",
    cwd: "E:/code/FPGA",
    archived: false,
    updatedAt: "2026-03-06T09:00:00.000Z",
    ...overrides
  };
}

function createMessage(overrides?: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    role: "assistant",
    text: "我先检查当前工作区。",
    status: "done",
    ...overrides
  };
}

function renderHomeView(overrides?: Partial<ComponentProps<typeof HomeView>>) {
  mockedUseWorkspaceGit.mockReturnValue(createController());
  const root = { id: "root-1", name: "FPGA", path: "E:/code/FPGA" };
  const thread = createThread();

  return render(
    <HomeView
      hostBridge={{} as HostBridge}
      busy={false}
      inputText=""
      roots={[root]}
      selectedRootId={root.id}
      selectedRootName={root.name}
      selectedRootPath={root.path}
      threads={[thread]}
      codexSessions={[thread]}
      codexSessionsLoading={false}
      codexSessionsError={null}
      selectedThreadId={thread.id}
      messages={[]}
      models={MODELS}
      defaultModel="gpt-5.2"
      defaultEffort="xhigh"
      workspaceOpener="vscode"
      embeddedTerminalShell="powerShell"
      pendingServerRequests={[]}
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
      onSelectRoot={vi.fn()}
      onSelectThread={vi.fn()}
      onInputChange={vi.fn()}
      onCreateThread={vi.fn().mockResolvedValue(undefined)}
      onSendTurn={vi.fn().mockResolvedValue(undefined)}
      onAddRoot={vi.fn()}
      onRemoveRoot={vi.fn()}
      onRetryConnection={vi.fn().mockResolvedValue(undefined)}
      onLogin={vi.fn().mockResolvedValue(undefined)}
      onApproveRequest={vi.fn().mockResolvedValue(undefined)}
      onRejectRequest={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  );
}

describe("HomeView", () => {
  it("toggles terminal button label through icon button", () => {
    renderHomeView();

    fireEvent.click(screen.getByRole("button", { name: "隐藏终端" }));

    expect(screen.getByRole("button", { name: "显示终端" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables diff button when no workspace is selected", () => {
    renderHomeView({ roots: [], selectedRootId: null, selectedRootName: "选择工作区", selectedRootPath: null, threads: [], codexSessions: [], selectedThreadId: null });

    expect(screen.getByRole("button", { name: "显示差异侧栏" })).toBeDisabled();
  });

  it("calls send handler when send button is clicked", () => {
    const onSendTurn = vi.fn().mockResolvedValue(undefined);

    renderHomeView({ inputText: "请分析当前工作区", onSendTurn });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(onSendTurn).toHaveBeenCalledWith({ model: "gpt-5.2", effort: "xhigh" });
  });

  it("uses codex sessions instead of the thread list in the sidebar", () => {
    const remoteThread = createThread({ id: "thread-remote", title: "Remote thread", source: "rpc" });
    const localSession = createThread({ id: "thread-local", title: "Local session", source: "codexData" });

    renderHomeView({ threads: [remoteThread], codexSessions: [localSession], selectedThreadId: null, messages: [] });
    fireEvent.click(screen.getAllByText("FPGA")[0]!);

    expect(screen.getByText("Local session")).toBeInTheDocument();
    expect(screen.queryByText("Remote thread")).not.toBeInTheDocument();
  });

  it("renders conversation canvas instead of empty state when a thread is active", () => {
    const { container } = renderHomeView({
      messages: [
        createMessage({ id: "message-user", role: "user", text: "帮我检查当前工作区" }),
        createMessage({ id: "message-assistant", role: "assistant", text: "我先检查当前工作区。" })
      ]
    });

    expect(container.querySelector(".empty-state")).toBeNull();
    expect(container.querySelector(".home-conversation")).not.toBeNull();
    expect(screen.getByText("帮我检查当前工作区")).toBeInTheDocument();
    expect(screen.getByText("我先检查当前工作区。")).toBeInTheDocument();
  });

  it("hides system prompt messages and renders assistant content in markdown style", () => {
    const { container } = renderHomeView({
      messages: [
        createMessage({ id: "message-system", role: "system", text: "\u4f60\u662f\u7cfb\u7edf\u63d0\u793a\u8bcd\uff0c\u4e0d\u5e94\u8be5\u663e\u793a\u3002" }),
        createMessage({ id: "message-user", role: "user", text: "\u8bf7\u4f18\u5316\u804a\u5929\u8bb0\u5f55\u5c55\u793a" }),
        createMessage({
          id: "message-assistant",
          role: "assistant",
          text: "# \u663e\u793a\u4f18\u5316\n\n- \u5e03\u5c40\u66f4\u7d27\u51d1\n- \u533a\u5206 `user` \u548c `assistant`"
        })
      ]
    });

    expect(screen.queryByText("\u4f60\u662f\u7cfb\u7edf\u63d0\u793a\u8bcd\uff0c\u4e0d\u5e94\u8be5\u663e\u793a\u3002")).toBeNull();
    expect(container.querySelector(".home-chat-message-user")).not.toBeNull();
    expect(container.querySelector(".home-chat-message-assistant .home-chat-bubble")).toBeNull();
    expect(container.querySelector(".home-chat-markdown h1")?.textContent).toBe("\u663e\u793a\u4f18\u5316");
    expect(Array.from(container.querySelectorAll(".home-chat-markdown code")).map((node) => node.textContent)).toEqual([
      "user",
      "assistant"
    ]);
  });

  it("strips injected AGENTS and environment context from visible user messages", () => {
    renderHomeView({
      messages: [
        createMessage({
          id: "message-user",
          role: "user",
          text: "# AGENTS.md instructions for E:\\code\\boai\n\n<INSTRUCTIONS>\nSystem\n</INSTRUCTIONS>\n<environment_context>\n  <cwd>E:\\code\\boai</cwd>\n</environment_context>\n请只优化 timeline 页性能"
        })
      ]
    });

    expect(screen.queryByText(/AGENTS\.md instructions/)).toBeNull();
    expect(screen.queryByText(/<environment_context>/)).toBeNull();
    expect(screen.getByText("请只优化 timeline 页性能")).toBeInTheDocument();
  });

  it("renders proposed_plan content inside a rounded plan box", () => {
    const { container } = renderHomeView({
      messages: [
        createMessage({
          id: "message-assistant-plan",
          role: "assistant",
          text: "先给结论。\n\n<proposed_plan>\n## 计划书\n\n- 第一步\n- 第二步\n</proposed_plan>\n\n最后补充。"
        })
      ]
    });

    expect(container.querySelector(".home-chat-proposed-plan")).not.toBeNull();
    expect(container.querySelector(".home-chat-proposed-plan h2")?.textContent).toBe("计划书");
    expect(screen.getByText("第一步")).toBeInTheDocument();
    expect(screen.getByText("第二步")).toBeInTheDocument();
  });
});
