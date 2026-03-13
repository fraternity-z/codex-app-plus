import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import { createConversationTimelineMemo } from "./conversationTimelineMemo";

function createTurn(id: string, overrides?: Partial<ConversationTurnState>): ConversationTurnState {
  return {
    localId: `local-${id}`,
    turnId: id,
    status: "completed",
    error: null,
    params: { input: [{ type: "text", text: id, text_elements: [] }], cwd: null, model: null, effort: null, serviceTier: null, collaborationMode: null },
    items: [],
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

function createConversation(turns: ReadonlyArray<ConversationTurnState>, overrides?: Partial<ConversationState>): ConversationState {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-12T10:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [...turns],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
    ...overrides,
  };
}

describe("conversationTimelineMemo", () => {
  it("reuses the previous timeline when only conversation metadata changes", () => {
    const mapTimeline = createConversationTimelineMemo();
    const conversation = createConversation([createTurn("turn-1")]);

    const firstTimeline = mapTimeline(conversation, []);
    const secondTimeline = mapTimeline({ ...conversation, title: "Renamed thread" }, []);

    expect(secondTimeline).toBe(firstTimeline);
  });

  it("reuses unchanged turn entries when a later turn updates", () => {
    const mapTimeline = createConversationTimelineMemo();
    const firstTurn = createTurn("turn-1");
    const secondTurn = createTurn("turn-2", {
      items: [{ item: { type: "agentMessage", id: "assistant-1", text: "before", phase: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
    });

    const initialTimeline = mapTimeline(createConversation([firstTurn, secondTurn]), []);
    const updatedTimeline = mapTimeline(createConversation([
      firstTurn,
      {
        ...secondTurn,
        items: [{ item: { type: "agentMessage", id: "assistant-1", text: "after", phase: null }, approvalRequestId: null, outputText: "", terminalInteractions: [], rawResponse: null, progressMessages: [] }],
      },
    ]), []);

    expect(updatedTimeline[0]).toBe(initialTimeline[0]);
    expect(updatedTimeline[updatedTimeline.length - 1]).not.toBe(initialTimeline[initialTimeline.length - 1]);
  });
});
