import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { syncCompletedTurn } from "../model/conversationState";
import { mapConversationToTimelineEntries } from "../model/conversationTimeline";
import type { ThreadSummary } from "../../../domain/types";
import type { TimelineEntry } from "../../../domain/timeline";
import type { ThreadTokenUsage } from "../../../protocol/generated/v2/ThreadTokenUsage";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { HomeConversationCanvas } from "./HomeConversationCanvas";

const { mockedUseVirtualizer } = vi.hoisted(() => ({
  mockedUseVirtualizer: vi.fn(),
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

const TOKEN_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 14996, inputTokens: 14791, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  last: { totalTokens: 205, inputTokens: 0, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  modelContextWindow: 200000,
};

function createThread(status: ThreadSummary["status"]): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-03-07T04:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status,
    activeFlags: [],
    queuedCount: 0,
  };
}

function renderCanvas(
  activities: ReadonlyArray<TimelineEntry>,
  options?: {
    readonly status?: ThreadSummary["status"];
    readonly activeTurnId?: string | null;
    readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
    readonly threadDetailLevel?: ThreadDetailLevel;
    readonly canEditMessages?: boolean;
    readonly onEditUserMessage?: ComponentProps<typeof HomeConversationCanvas>["onEditUserMessage"];
  },
) {
  return render(
    <HomeConversationCanvas
      activities={activities}
      selectedThread={createThread(options?.status ?? "idle")}
      activeTurnId={options?.activeTurnId ?? null}
      turnStatuses={options?.turnStatuses ?? {}}
      threadDetailLevel={options?.threadDetailLevel ?? "commands"}
      placeholder={null}
      onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      connectionStatus="connected"
      connectionRetryInfo={null}
      fatalError={null}
      retryScheduledAt={null}
      busy={false}
      onRetryConnection={vi.fn().mockResolvedValue(undefined)}
      canEditMessages={options?.canEditMessages}
      onEditUserMessage={options?.onEditUserMessage}
    />,
    { wrapper: createI18nWrapper("zh-CN") },
  );
}

function createConversationTurn(overrides?: Partial<ConversationTurnState>): ConversationTurnState {
  return {
    localId: "local-turn-1",
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: { input: [{ type: "text", text: "请继续", text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
    items: [{ item: { type: "agentMessage", id: "assistant-1", text: "已经完成。", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
    turnStartedAtMs: null,
    planExplanation: null,
    planSteps: [],
    diff: null,
    rawResponses: [],
    notices: [],
    reviewStates: [],
    contextCompactions: [],
    tokenUsage: null,
    ...overrides,
  };
}

function createConversationActivities(turn: ConversationTurnState): ReadonlyArray<TimelineEntry> {
  return mapConversationToTimelineEntries(createConversationState(turn), []);
}

function createConversationState(turn: ConversationTurnState): ConversationState {
  const conversation: ConversationState = {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-07T04:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [turn],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };

  return conversation;
}

function createNotificationTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    id: "turn-1",
    items: [],
    status: "completed",
    error: null,
    startedAt: 1,
    completedAt: 2,
    durationMs: 1000,
    ...overrides,
  };
}

const USER_MESSAGE: TimelineEntry = {
  id: "user-1",
  kind: "userMessage",
  role: "user",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-user",
  text: "请继续",
  status: "done",
};

const USER_IMAGE_MESSAGE: TimelineEntry = {
  id: "user-image-1",
  kind: "userMessage",
  role: "user",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-user-image",
  text: "",
  status: "done",
  attachments: [{ kind: "image", source: "dataUrl", value: "data:image/png;base64,aGVsbG8=" }],
};

const COMMAND_ENTRY: TimelineEntry = {
  id: "command-1",
  kind: "commandExecution",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-command",
  command: "pnpm test",
  cwd: "E:/code/codex-app-plus",
  processId: "proc-1",
  status: "inProgress",
  commandActions: [],
  output: "running...",
  exitCode: null,
  durationMs: null,
  terminalInteractions: [],
  approvalRequestId: null,
};

const REASONING_ENTRY: TimelineEntry = {
  id: "reasoning-1",
  kind: "reasoning",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-reasoning",
  summary: ["先确认主链路结构。"],
  content: ["详细推理"],
};

const EMPTY_REASONING_ENTRY: TimelineEntry = {
  ...REASONING_ENTRY,
  id: "reasoning-empty-1",
  itemId: "item-reasoning-empty",
  summary: [" ", ""],
};

const ASSISTANT_MESSAGE: TimelineEntry = {
  id: "assistant-1",
  kind: "agentMessage",
  role: "assistant",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-assistant",
  text: "已经完成。",
  status: "done",
};

const SECOND_ASSISTANT_MESSAGE: TimelineEntry = {
  ...ASSISTANT_MESSAGE,
  id: "assistant-2",
  itemId: "item-assistant-2",
  text: "补充说明。",
};

const STREAMING_ASSISTANT_MESSAGE: TimelineEntry = {
  ...ASSISTANT_MESSAGE,
  id: "assistant-streaming-1",
  itemId: "item-assistant-streaming",
  text: "正在输出正文",
  status: "streaming",
};

const DIFF_ENTRY: TimelineEntry = {
  id: "turn-diff-1",
  kind: "turnDiffSnapshot",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: null,
  diff: [
    "diff --git a/src/App.tsx b/src/App.tsx",
    "--- a/src/App.tsx",
    "+++ b/src/App.tsx",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n"),
};

const REQUEST_ENTRY: TimelineEntry = {
  id: "request-1",
  kind: "pendingUserInput",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-request",
  requestId: "request-1",
  request: {
    kind: "userInput",
    id: "request-1",
    rpcId: "request-1",
    method: "item/tool/requestUserInput",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-request",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-request",
      questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主画布", description: "只改主画布" }] }],
    },
    questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主画布", description: "只改主画布" }] }],
  },
};

const RAW_RESPONSE_ENTRY: TimelineEntry = {
  id: "raw-1",
  kind: "rawResponse",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-raw",
  responseType: "message",
  title: "Raw response",
  detail: "{\"ok\":true}",
  phase: null,
  payload: { ok: true },
};

const DEBUG_ENTRY: TimelineEntry = {
  id: "debug-1",
  kind: "debug",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-debug",
  title: "turn:error",
  payload: { ok: false },
};

describe("HomeConversationCanvas", () => {
  it("renders a single bottom thinking indicator immediately after user input", () => {
    const { container } = renderCanvas([USER_MESSAGE], { activeTurnId: "turn-1" });

    expect(screen.getByText(/正在思考|Thinking/)).toBeInTheDocument();
    expect(container.querySelector(".home-turn-thinking-indicator")).not.toBeNull();
    expect(container.querySelector(".home-assistant-transcript-thinking")).toBeNull();
    expect(container.querySelector(".home-thinking-block")).toBeNull();
  });

  it("keeps user input requests out of the timeline while suppressing the thinking indicator", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY, REQUEST_ENTRY], { activeTurnId: "turn-1" });

    expect(screen.getByText("正在执行 pnpm test")).toBeInTheDocument();
    expect(screen.queryByText("请选择处理范围")).toBeNull();
    expect(container.querySelector('.home-assistant-transcript-summary[data-truncate-summary="true"]')).not.toBeNull();
    expect(container.querySelector(".home-assistant-transcript-details details[open]")).toBeNull();
    expect(container.querySelector(".home-request-card")).toBeNull();
    expect(screen.queryByText(/正在思考|Thinking/)).toBeNull();
  });

  it("keeps reasoning, trace, and assistant reply in visual order", () => {
    const { container } = renderCanvas([USER_MESSAGE, REASONING_ENTRY, COMMAND_ENTRY, ASSISTANT_MESSAGE]);
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);
    const assistantFlow = container.querySelector(".home-turn-assistant-flow");
    const assistantClassNames = Array.from(assistantFlow?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-turn-assistant-flow");
    expect(assistantClassNames[0]).toContain("home-assistant-transcript-reasoning");
    expect(assistantClassNames[1]).toContain("home-assistant-transcript-details");
    expect(assistantClassNames[2]).toContain("home-assistant-transcript-message");
    expect(assistantClassNames[3]).toContain("home-chat-message-actions");
    expect(screen.queryByText(/正在思考|Thinking/)).toBeNull();
  });

  it("keeps the context compaction divider between assistant messages", () => {
    const activities = createConversationActivities(createConversationTurn({
      items: [
        { item: { type: "agentMessage", id: "assistant-1", text: "压缩前", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
        { item: { type: "contextCompaction", id: "context-compaction-1" }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
        { item: { type: "agentMessage", id: "assistant-2", text: "压缩后继续", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] },
      ],
    }));
    const { container } = renderCanvas(activities);
    const assistantFlow = container.querySelector(".home-turn-assistant-flow");
    const assistantClassNames = Array.from(assistantFlow?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(screen.getByText("背景信息已自动压缩")).toBeInTheDocument();
    expect(assistantClassNames[0]).toContain("home-assistant-transcript-message");
    expect(assistantClassNames[1]).toContain("home-assistant-transcript-divider");
    expect(assistantClassNames[2]).toContain("home-assistant-transcript-message");
  });

  it("keeps the thinking indicator below streaming assistant content", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY, STREAMING_ASSISTANT_MESSAGE], { activeTurnId: "turn-1" });
    const assistantMessage = container.querySelector(".home-assistant-transcript-message");
    const assistantChildren = Array.from(assistantMessage?.children ?? []).map((element) => (element as HTMLElement).className);
    const assistantFlow = container.querySelector(".home-turn-assistant-flow");
    const classNames = Array.from(assistantFlow?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(screen.getByText("正在输出正文")).toBeInTheDocument();
    expect(screen.getByText(/正在思考|Thinking/)).toBeInTheDocument();
    expect(assistantChildren[0]).toContain("home-chat-markdown-inline");
    expect(assistantChildren).toHaveLength(1);
    expect(classNames[classNames.length - 2]).toContain("home-chat-message-actions");
    expect(classNames[classNames.length - 1]).toContain("home-turn-thinking-indicator");
  });

  it("keeps the thinking indicator below tool output when no assistant text exists yet", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY], { activeTurnId: "turn-1" });
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);
    const assistantFlow = container.querySelector(".home-turn-assistant-flow");
    const assistantClassNames = Array.from(assistantFlow?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-turn-assistant-flow");
    expect(assistantClassNames[0]).toContain("home-assistant-transcript-details");
    expect(assistantClassNames[1]).toContain("home-turn-thinking-indicator");
    expect(container.querySelector(".home-turn-assistant-flow > .home-chat-message-actions")).toBeNull();
  });

  it("keeps turn diff snapshots hidden while the turn is still running", () => {
    renderCanvas([USER_MESSAGE, DIFF_ENTRY], { activeTurnId: "turn-1", turnStatuses: { "turn-1": "inProgress" } });

    expect(screen.queryByText("代码 diff 已更新")).toBeNull();
    expect(screen.queryByText("src/App.tsx")).toBeNull();
  });

  it("shows the diff summary card automatically after the turn is interrupted", () => {
    const { container } = renderCanvas([USER_MESSAGE, DIFF_ENTRY], { turnStatuses: { "turn-1": "interrupted" } });

    expect(container.querySelector("summary")).toBeNull();
    expect(container.querySelector('[data-variant="diffSummary"]')).not.toBeNull();
    expect(screen.getByText("1 个文件已更改")).toBeInTheDocument();
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
  });

  it("hides command summaries in compact mode", () => {
    renderCanvas([USER_MESSAGE, COMMAND_ENTRY], { activeTurnId: "turn-1", threadDetailLevel: "compact" });

    expect(screen.queryByText("正在执行 pnpm test")).toBeNull();
    expect(screen.getByText(/正在思考|Thinking/)).toBeInTheDocument();
  });

  it("shows raw responses and debug entries in full mode", () => {
    renderCanvas([USER_MESSAGE, RAW_RESPONSE_ENTRY, DEBUG_ENTRY], { threadDetailLevel: "full" });

    expect(screen.getByText("Raw response")).toBeInTheDocument();
    expect(screen.getByText("调试：turn:error")).toBeInTheDocument();
  });

  it("does not render an inline fake thinking line for empty reasoning summaries", () => {
    const { container } = renderCanvas([USER_MESSAGE, EMPTY_REASONING_ENTRY, COMMAND_ENTRY], { activeTurnId: "turn-1" });
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);
    const assistantFlow = container.querySelector(".home-turn-assistant-flow");
    const assistantClassNames = Array.from(assistantFlow?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-turn-assistant-flow");
    expect(assistantClassNames[0]).toContain("home-assistant-transcript-reasoning");
    expect(assistantClassNames[1]).toContain("home-assistant-transcript-details");
    expect(assistantClassNames[2]).toContain("home-turn-thinking-indicator");
    expect(screen.queryByText("Thinking...")).toBeNull();
    expect(screen.queryByText("Thinking…")).toBeNull();
  });

  it("renders user image previews without dumping base64 into the bubble", () => {
    const { container } = renderCanvas([USER_IMAGE_MESSAGE]);

    expect(container.querySelector(".home-chat-attachments img")).not.toBeNull();
    expect(screen.queryByText(/data:image\/png;base64/i)).toBeNull();
  });

  it("copies assistant reply text from its hover action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderCanvas([USER_MESSAGE, ASSISTANT_MESSAGE]);
    const copyButtons = screen.getAllByRole("button", { name: "复制消息" });
    fireEvent.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("已经完成。"));
    expect(screen.getByRole("button", { name: "消息已复制" })).toBeInTheDocument();
  });

  it("copies only assistant text once for a full turn with tool output between messages", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderCanvas([USER_MESSAGE, ASSISTANT_MESSAGE, COMMAND_ENTRY, SECOND_ASSISTANT_MESSAGE]);
    const copyButtons = screen.getAllByRole("button", { name: "复制消息" });

    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[1]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("已经完成。\n\n补充说明。"));
    expect(writeText.mock.calls[0]?.[0]).not.toContain("pnpm test");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("running");
  });

  it("passes edited user messages through the canvas", async () => {
    const onEditUserMessage = vi.fn().mockResolvedValue(undefined);

    renderCanvas([USER_MESSAGE], { canEditMessages: true, onEditUserMessage });
    fireEvent.click(screen.getByRole("button", { name: "编辑消息" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "改写后的请求" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(onEditUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", turnId: "turn-1" }),
      "改写后的请求",
    ));
  });

  it("does not expose edit actions while message editing is disabled", () => {
    renderCanvas([USER_MESSAGE], { canEditMessages: false });

    expect(screen.queryByRole("button", { name: "编辑消息" })).toBeNull();
  });

  it("keeps the assistant reply visible when token usage exists on the turn", () => {
    const activities = createConversationActivities(createConversationTurn({ tokenUsage: TOKEN_USAGE }));

    renderCanvas(activities);

    expect(screen.getByText("已经完成。", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/Token 使用已更新/)).toBeNull();
    expect(screen.queryByText(/Token usage updated/)).toBeNull();
  });

  it("keeps streamed assistant text visible after a sparse turnCompleted notification", () => {
    const conversation = createConversationState(createConversationTurn({
      status: "inProgress",
      items: [{ item: { type: "agentMessage", id: "assistant-1", text: "assistant reply", phase: null, memoryCitation: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
    }));
    const nextConversation = syncCompletedTurn(conversation, createNotificationTurn({ status: "completed" }));

    renderCanvas(mapConversationToTimelineEntries(nextConversation, []));

    expect(screen.getByText("assistant reply", { exact: false })).toBeInTheDocument();
  });
});
