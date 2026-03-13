import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "../../../domain/timeline";
import { flattenConversationRenderGroup, splitActivitiesIntoRenderGroups } from "./localConversationGroups";

function createUserMessage(): TimelineEntry {
  return {
    id: "user-1",
    kind: "userMessage",
    role: "user",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-user",
    text: "Inspect the current conversation flow",
    status: "done",
  };
}

function createAssistantMessage(
  id = "assistant-1",
  text = "Share the current result",
  status: "done" | "streaming" = "done",
): TimelineEntry {
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
    summary: ["Inspect the visible order inside the turn."],
    content: ["Inspect the detailed reasoning trace."],
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
    content: ["  ", ""],
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

function createPlan(): TimelineEntry {
  return {
    id: "plan-1",
    kind: "plan",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-plan",
    text: "1. Inspect settings\n2. Update layout",
    status: "done",
  };
}

function createRawResponse(): TimelineEntry {
  return {
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
}

function createDebug(): TimelineEntry {
  return {
    id: "debug-1",
    kind: "debug",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-debug",
    title: "turn:error",
    payload: { message: "boom" },
  };
}

function createSystemNotice(level: "info" | "warning" | "error"): TimelineEntry {
  return {
    id: `notice-${level}`,
    kind: "systemNotice",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: `item-notice-${level}`,
    level,
    title: `${level} notice`,
    detail: `${level} detail`,
    source: "test",
  };
}

function createUserInputRequest(): TimelineEntry {
  const questions = [{
    id: "scope",
    header: "Scope",
    question: "Choose a scope",
    isOther: false,
    isSecret: false,
    options: [{ label: "Main UI", description: "Only update the main UI" }],
  }];

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
      rpcId: "request-1",
      method: "item/tool/requestUserInput",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-request",
        questions,
      },
      questions,
    },
  } as TimelineEntry;
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
      createAssistantMessage("assistant-1", "Plan the update"),
      createCommand(),
      createFileChange(),
      createAssistantMessage("assistant-2", "Finished the changes"),
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
    const [group] = splitActivitiesIntoRenderGroups(
      [createUserMessage(), createCommand(), createAssistantMessage("assistant-streaming", "Streaming the reply", "streaming")],
      "turn-1",
    );

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "traceItem", "assistantMessage"]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("drops fully empty reasoning items instead of rendering a fake thinking line", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createEmptyReasoning(), createCommand()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "traceItem"]);
    expect(group.showThinkingIndicator).toBe(true);
  });

  it("hides the thinking indicator when a request block is waiting", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createUserInputRequest()], "turn-1");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual(["userBubble", "requestBlock"]);
    expect(group.showThinkingIndicator).toBe(false);
  });

  it("keeps only messages, plans, requests, and warning/error notices in compact mode", () => {
    const [group] = splitActivitiesIntoRenderGroups(
      [
        createUserMessage(),
        createAssistantMessage(),
        createPlan(),
        createReasoning(),
        createCommand(),
        createRawResponse(),
        createDebug(),
        createSystemNotice("info"),
        createSystemNotice("warning"),
        createUserInputRequest(),
      ],
      null,
      "compact",
    );

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual([
      "userBubble",
      "assistantMessage",
      "auxiliaryBlock",
      "auxiliaryBlock",
      "requestBlock",
    ]);
  });

  it("shows reasoning and trace items but still hides raw/debug in commands mode", () => {
    const [group] = splitActivitiesIntoRenderGroups(
      [createUserMessage(), createReasoning(), createCommand(), createRawResponse(), createDebug(), createSystemNotice("info")],
      null,
      "commands",
    );

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual([
      "userBubble",
      "reasoningBlock",
      "traceItem",
      "auxiliaryBlock",
    ]);
  });

  it("includes raw responses and debug entries in full mode", () => {
    const [group] = splitActivitiesIntoRenderGroups([createUserMessage(), createRawResponse(), createDebug()], null, "full");

    expect(flattenConversationRenderGroup(group).map((node) => node.kind)).toEqual([
      "userBubble",
      "auxiliaryBlock",
      "auxiliaryBlock",
    ]);
  });
});
