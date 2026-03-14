import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import { applyConversationOutputDeltas, applyConversationTextDeltas } from "./conversationDeltaState";

function createAgentMessageItem(id: string, text: string): ConversationTurnState["items"][number] {
  return {
    item: { type: "agentMessage", id, text, phase: null },
    approvalRequestId: null,
    outputText: "",
    terminalInteractions: [],
    rawResponse: null,
    progressMessages: [],
  };
}

function createPlanItem(id: string, text: string): ConversationTurnState["items"][number] {
  return {
    item: { type: "plan", id, text },
    approvalRequestId: null,
    outputText: "",
    terminalInteractions: [],
    rawResponse: null,
    progressMessages: [],
  };
}

function createCommandItem(id: string, outputText: string): ConversationTurnState["items"][number] {
  return {
    item: {
      type: "commandExecution",
      id,
      command: "dir",
      cwd: "E:/code/codex-app-plus",
      processId: null,
      status: "inProgress",
      commandActions: [],
      aggregatedOutput: outputText,
      exitCode: null,
      durationMs: null,
    },
    approvalRequestId: null,
    outputText,
    terminalInteractions: [],
    rawResponse: null,
    progressMessages: [],
  };
}

function createTurn(turnId: string, items: ConversationTurnState["items"]): ConversationTurnState {
  return {
    localId: turnId,
    turnId,
    status: "inProgress",
    error: null,
    params: null,
    items: [...items],
    turnStartedAtMs: 1,
    planExplanation: null,
    planSteps: [],
    diff: null,
    rawResponses: [],
    notices: [],
    reviewStates: [],
    contextCompactions: [],
    tokenUsage: null,
  };
}

function createConversation(turns: ReadonlyArray<ConversationTurnState>): ConversationState {
  return {
    id: "thread-1",
    title: "Thread 1",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-14T00:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [...turns],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };
}

describe("conversationDeltaState", () => {
  it("applies multiple text deltas to the same turn without touching unrelated turns", () => {
    const firstTurn = createTurn("turn-1", [createAgentMessageItem("message-1", "hello"), createPlanItem("plan-1", "plan")]);
    const secondTurn = createTurn("turn-2", [createAgentMessageItem("message-2", "unchanged")]);
    const conversation = createConversation([firstTurn, secondTurn]);

    const nextConversation = applyConversationTextDeltas(conversation, [
      { conversationId: "thread-1", turnId: "turn-1", itemId: "message-1", target: { type: "agentMessage" }, delta: " world" },
      { conversationId: "thread-1", turnId: "turn-1", itemId: "plan-1", target: { type: "plan" }, delta: " more" },
    ]);

    expect(nextConversation).not.toBe(conversation);
    expect(nextConversation.turns[0]).not.toBe(firstTurn);
    expect(nextConversation.turns[1]).toBe(secondTurn);
    expect(nextConversation.turns[0]?.items[0]?.item).toEqual({ type: "agentMessage", id: "message-1", text: "hello world", phase: null });
    expect(nextConversation.turns[0]?.items[1]?.item).toEqual({ type: "plan", id: "plan-1", text: "plan more" });
  });

  it("applies output deltas in one pass and preserves untouched turns", () => {
    const firstTurn = createTurn("turn-1", [createCommandItem("command-1", "dir")]);
    const secondTurn = createTurn("turn-2", [createAgentMessageItem("message-2", "stable")]);
    const conversation = createConversation([firstTurn, secondTurn]);

    const nextConversation = applyConversationOutputDeltas(conversation, [
      { conversationId: "thread-1", turnId: "turn-1", itemId: "command-1", target: "commandExecution", delta: " /b" },
      { conversationId: "thread-1", turnId: "turn-1", itemId: "file-1", target: "fileChange", delta: "patched" },
    ]);

    expect(nextConversation.turns[0]).not.toBe(firstTurn);
    expect(nextConversation.turns[1]).toBe(secondTurn);
    expect(nextConversation.turns[0]?.items[0]?.outputText).toBe("dir /b");
    expect(nextConversation.turns[0]?.items[0]?.item).toEqual(expect.objectContaining({
      type: "commandExecution",
      aggregatedOutput: "dir /b",
    }));
    expect(nextConversation.turns[0]?.items[1]?.item).toEqual({ type: "fileChange", id: "file-1", changes: [], status: "inProgress" });
    expect(nextConversation.turns[0]?.items[1]?.outputText).toBe("patched");
  });
});
