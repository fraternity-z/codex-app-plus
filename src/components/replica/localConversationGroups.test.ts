import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../../domain/types";
import type { TimelineEntry } from "../../domain/timeline";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

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

function createUserMessage(): TimelineEntry {
  return {
    id: "user-1",
    kind: "userMessage",
    role: "user",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-user",
    text: "请检查当前仓库",
    status: "done",
  };
}

function createReasoning(): TimelineEntry {
  return {
    id: "reasoning-1",
    kind: "reasoning",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-reasoning",
    summary: ["先确认入口文件，再检查工具链路。"],
    content: ["详细推理内容"],
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

function createToolCall(): TimelineEntry {
  return {
    id: "tool-1",
    kind: "mcpToolCall",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-tool",
    server: "context7",
    tool: "query-docs",
    status: "completed",
    arguments: { query: "chat ui" },
    result: { content: [{ type: "text", text: "done" }], structuredContent: null },
    error: null,
    durationMs: 34,
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

function createAssistantMessage(): TimelineEntry {
  return {
    id: "assistant-1",
    kind: "agentMessage",
    role: "assistant",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-assistant",
    text: "已完成主画布调整。",
    status: "done",
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
        questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主画布", description: "只改会话主区域" }] }],
      },
      questions: [{ id: "scope", header: "范围", question: "请选择处理范围", isOther: false, isSecret: false, options: [{ label: "主画布", description: "只改会话主区域" }] }],
    },
  };
}

describe("localConversationGroups", () => {
  it("adds a synthetic thinking block for an active turn with only user input", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage()], createThread("active"));

    expect(group.thinkingBlock?.kind).toBe("placeholder");
    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "thinkingBlock"]);
  });

  it("replaces placeholder thinking with processing when tool work starts", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createCommand()], createThread("active"));

    expect(group.thinkingBlock?.kind).toBe("processing");
    expect(group.thinkingBlock?.summary).toContain("pnpm test");
  });

  it("keeps reasoning, trace items, and final assistant reply in mainline order", () => {
    const entries = [createUserMessage(), createReasoning(), createCommand(), createToolCall(), createFileChange(), createAssistantMessage()];
    const [group] = splitActivitiesIntoRenderGroups(entries, createThread("idle"));

    expect(group.thinkingBlock?.kind).toBe("reasoning");
    expect(group.traceItems.map((item) => item.kind)).toEqual(["commandExecution", "mcpToolCall", "fileChange"]);
    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual([
      "userBubble",
      "thinkingBlock",
      "traceItem",
      "traceItem",
      "traceItem",
      "assistantMessage",
    ]);
  });

  it("shows request blocks without a generic thinking placeholder", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createUserInputRequest()], createThread("active"));

    expect(group.thinkingBlock).toBeNull();
    expect(group.requestBlock?.kind).toBe("pendingUserInput");
    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "requestBlock"]);
  });
});
