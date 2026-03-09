import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../domain/timeline";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

function createUserMessage(): TimelineEntry {
  return {
    id: "user-1",
    kind: "userMessage",
    role: "user",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-user",
    text: "检查当前会话流",
    status: "done",
  };
}

function createAssistantMessage(id = "assistant-1", text = "先给出结论", status: "done" | "streaming" = "done"): TimelineEntry {
  return {
    id,
    kind: "agentMessage",
    role: "assistant",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: id,
    text,
    status,
  };
}

function createReasoning(): TimelineEntry {
  return {
    id: "reasoning-1",
    kind: "reasoning",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-reasoning",
    summary: ["先确认 turn 内可见顺序"],
    content: ["详细推理"],
  };
}

function createEmptyReasoning(): TimelineEntry {
  return {
    id: "reasoning-empty-1",
    kind: "reasoning",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-reasoning-empty",
    summary: ["  ", ""],
    content: ["详细推理"],
  };
}

function createCommand(): TimelineEntry {
  return {
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
}

function createFileChange(): TimelineEntry {
  return {
    id: "file-1",
    kind: "fileChange",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-file",
    changes: [{ path: "src/App.tsx", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@" }],
    status: "completed",
    output: "patched",
    approvalRequestId: null,
  };
}

function createUserInputRequest(): TimelineEntry {
  return {
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
        questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主界面", description: "只改主界面" }] }],
      },
      questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主界面", description: "只改主界面" }] }],
    },
  };
}

describe("localConversationGroups", () => {
  it("marks an active turn with only user input as thinking without adding a placeholder", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble"]);
    expect(group.assistantFlow).toEqual([]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("keeps assistant text, trace, and final reply in flow order", () => {
    const entries = [
      createUserMessage(),
      createAssistantMessage("assistant-1", "先同步计划"),
      createCommand(),
      createFileChange(),
      createAssistantMessage("assistant-2", "已完成修改"),
    ];
    const [group] = splitActivitiesIntoRenderGroups(entries, null);

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual([
      "userBubble",
      "assistantMessage",
      "traceItem",
      "traceItem",
      "assistantMessage",
    ]);
  });

  it("keeps reasoning and trace in the same active turn while exposing group thinking", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createReasoning(), createCommand()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "reasoningBlock", "traceItem"]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("keeps group thinking visible while assistant text is streaming", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createCommand(), createAssistantMessage("assistant-streaming", "正在输出正文", "streaming")], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "traceItem", "assistantMessage"]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("drops empty reasoning summaries instead of rendering a fake thinking line", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createEmptyReasoning(), createCommand()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "traceItem"]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("hides the thinking indicator when a request block is waiting", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createUserInputRequest()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "requestBlock"]);
    expect(group.showThinkingIndicator).toBe(false);
  });
});
