import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import { mapConversationTurnToTimelineEntries } from "./conversationTimeline";

function createConversation(): ConversationState {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-04-21T00:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };
}

function createTurn(): ConversationTurnState {
  return {
    localId: "local-turn-1",
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: null,
    items: [{
      item: {
        type: "imageGeneration",
        id: "ig_123",
        status: "completed",
        revisedPrompt: "A tiny blue square",
        result: "Zm9v",
        savedPath: "E:/code/codex-app-plus/.codex/images/ig_123.png",
      },
      approvalRequestId: null,
      outputText: "",
      terminalInteractions: [],
      rawResponse: null,
      progressMessages: [],
    }],
    turnStartedAtMs: null,
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

describe("conversationTimeline image generation", () => {
  it("maps app-server image generation items into timeline entries", () => {
    const entries = mapConversationTurnToTimelineEntries(createConversation(), createTurn());
    const [entry] = entries;

    expect(entry).toMatchObject({
      kind: "imageGeneration",
      itemId: "ig_123",
      status: "completed",
      revisedPrompt: "A tiny blue square",
      result: "Zm9v",
      savedPath: "E:/code/codex-app-plus/.codex/images/ig_123.png",
    });
  });
});
