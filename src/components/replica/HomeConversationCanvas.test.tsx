import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../domain/conversation";
import { syncCompletedTurn } from "../../app/conversationState";
import { mapConversationToTimelineEntries } from "../../app/conversationTimeline";
import type { ThreadSummary } from "../../domain/types";
import type { TimelineEntry } from "../../domain/timeline";
import type { ThreadTokenUsage } from "../../protocol/generated/v2/ThreadTokenUsage";
import type { Turn } from "../../protocol/generated/v2/Turn";
import { HomeConversationCanvas } from "./HomeConversationCanvas";

const TOKEN_USAGE: ThreadTokenUsage = {
  total: { totalTokens: 14996, inputTokens: 14791, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  last: { totalTokens: 205, inputTokens: 0, cachedInputTokens: 0, outputTokens: 205, reasoningOutputTokens: 0 },
  modelContextWindow: 200000,
};

function createThread(status: ThreadSummary["status"]): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    cwd: "E:/code/codex-app-plus",
    archived: false,
    updatedAt: "2026-03-07T04:00:00.000Z",
    source: "rpc",
    status,
    activeFlags: [],
    queuedCount: 0,
  };
}

function renderCanvas(
  activities: ReadonlyArray<TimelineEntry>,
  options?: { readonly status?: ThreadSummary["status"]; readonly activeTurnId?: string | null },
) {
  return render(
    <HomeConversationCanvas
      activities={activities}
      selectedThread={createThread(options?.status ?? "idle")}
      activeTurnId={options?.activeTurnId ?? null}
      placeholder={null}
      onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

function createConversationTurn(overrides?: Partial<ConversationTurnState>): ConversationTurnState {
  return {
    localId: "local-turn-1",
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: { input: [{ type: "text", text: "请继续", text_elements: [] }], cwd: null, model: null, effort: null, collaborationMode: null },
    items: [{ item: { type: "agentMessage", id: "assistant-1", text: "已经完成。", phase: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
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
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-07T04:00:00.000Z",
    source: "rpc",
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

const STREAMING_ASSISTANT_MESSAGE: TimelineEntry = {
  ...ASSISTANT_MESSAGE,
  id: "assistant-streaming-1",
  itemId: "item-assistant-streaming",
  text: "正在输出正文",
  status: "streaming",
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

describe("HomeConversationCanvas", () => {
  it("renders a single bottom thinking indicator immediately after user input", () => {
    const { container } = renderCanvas([USER_MESSAGE], { activeTurnId: "turn-1" });

    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
    expect(container.querySelector(".home-turn-thinking-indicator")).not.toBeNull();
    expect(container.querySelector(".home-assistant-transcript-thinking")).toBeNull();
    expect(container.querySelector(".home-thinking-block")).toBeNull();
  });

  it("renders transcript summaries and keeps request cards in the conversation flow", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY, REQUEST_ENTRY], { activeTurnId: "turn-1" });

    expect(screen.getByText("正在执行命令：pnpm test")).toBeInTheDocument();
    expect(screen.getByText("Additional input required")).toBeInTheDocument();
    expect(screen.getByText("请选择处理范围")).toBeInTheDocument();
    expect(container.querySelector(".home-assistant-transcript-details details[open]")).toBeNull();
    expect(container.querySelector(".home-request-card")).not.toBeNull();
    expect(screen.queryByText(/正在思考/)).toBeNull();
  });

  it("keeps reasoning, trace, and assistant reply in visual order", () => {
    const { container } = renderCanvas([USER_MESSAGE, REASONING_ENTRY, COMMAND_ENTRY, ASSISTANT_MESSAGE]);
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-assistant-transcript-line");
    expect(classNames[2]).toContain("home-assistant-transcript-details");
    expect(classNames[3]).toContain("home-assistant-transcript-message");
    expect(screen.queryByText(/正在思考/)).toBeNull();
  });

  it("keeps the thinking indicator below streaming assistant content", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY, STREAMING_ASSISTANT_MESSAGE], { activeTurnId: "turn-1" });
    const group = container.querySelector(".home-turn-group");
    const assistantMessage = container.querySelector(".home-assistant-transcript-message");
    const assistantChildren = Array.from(assistantMessage?.children ?? []).map((element) => (element as HTMLElement).className);
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(screen.getByText("正在输出正文")).toBeInTheDocument();
    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
    expect(assistantChildren[0]).toContain("home-chat-markdown-inline");
    expect(assistantChildren).toHaveLength(1);
    expect(classNames[classNames.length - 1]).toContain("home-turn-thinking-indicator");
  });

  it("keeps the thinking indicator below tool output when no assistant text exists yet", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY], { activeTurnId: "turn-1" });
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-assistant-transcript-details");
    expect(classNames[2]).toContain("home-turn-thinking-indicator");
  });

  it("does not render an inline fake thinking line for empty reasoning summaries", () => {
    const { container } = renderCanvas([USER_MESSAGE, EMPTY_REASONING_ENTRY, COMMAND_ENTRY], { activeTurnId: "turn-1" });
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-assistant-transcript-details");
    expect(classNames[2]).toContain("home-turn-thinking-indicator");
    expect(screen.queryByText("正在思考...")).toBeNull();
    expect(screen.queryByText("正在思考…")).toBeNull();
  });

  it("renders user image previews without dumping base64 into the bubble", () => {
    const { container } = renderCanvas([USER_IMAGE_MESSAGE]);

    expect(container.querySelector(".home-chat-attachments img")).not.toBeNull();
    expect(screen.queryByText(/data:image\/png;base64/i)).toBeNull();
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
      items: [{ item: { type: "agentMessage", id: "assistant-1", text: "assistant reply", phase: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
    }));
    const nextConversation = syncCompletedTurn(conversation, createNotificationTurn({ status: "completed" }));

    renderCanvas(mapConversationToTimelineEntries(nextConversation, []));

    expect(screen.getByText("assistant reply", { exact: false })).toBeInTheDocument();
  });
});
