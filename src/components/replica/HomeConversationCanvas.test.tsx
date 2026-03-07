import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../domain/types";
import type { TimelineEntry } from "../../domain/timeline";
import { HomeConversationCanvas } from "./HomeConversationCanvas";

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

function renderCanvas(activities: ReadonlyArray<TimelineEntry>, status: ThreadSummary["status"] = "idle") {
  return render(
    <HomeConversationCanvas
      activities={activities}
      selectedThread={createThread(status)}
      placeholder={null}
      onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

const USER_MESSAGE: TimelineEntry = {
  id: "user-1",
  kind: "userMessage",
  role: "user",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-user",
  text: "请继续。",
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
  summary: ["先同步主链路结构。"],
  content: ["详细推理"],
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
  it("renders a thinking block immediately after user input on an active thread", () => {
    const { container } = renderCanvas([USER_MESSAGE], "active");

    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(container.querySelector(".home-thinking-block")).not.toBeNull();
  });

  it("renders trace cards and inline request blocks in the conversation flow", () => {
    const { container } = renderCanvas([USER_MESSAGE, COMMAND_ENTRY, REQUEST_ENTRY], "active");

    expect(screen.getByText("Command execution")).toBeInTheDocument();
    expect(screen.getByText("Additional input required")).toBeInTheDocument();
    expect(screen.getByText("请选择处理范围")).toBeInTheDocument();
    expect(container.querySelector(".home-request-card")).not.toBeNull();
  });

  it("keeps thinking, trace, and assistant reply in visual order", () => {
    const { container } = renderCanvas([USER_MESSAGE, REASONING_ENTRY, COMMAND_ENTRY, ASSISTANT_MESSAGE]);
    const group = container.querySelector(".home-turn-group");
    const classNames = Array.from(group?.children ?? []).map((element) => (element as HTMLElement).className);

    expect(classNames[0]).toContain("home-chat-message-user");
    expect(classNames[1]).toContain("home-thinking-block");
    expect(classNames[2]).toContain("home-trace-card");
    expect(classNames[3]).toContain("home-chat-message-assistant");
  });

  it("renders user image previews without dumping base64 into the bubble", () => {
    const { container } = renderCanvas([USER_IMAGE_MESSAGE]);

    expect(container.querySelector(".home-chat-attachments img")).not.toBeNull();
    expect(screen.queryByText(/data:image\/png;base64/i)).toBeNull();
  });
});
