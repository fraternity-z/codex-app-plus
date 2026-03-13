import { describe, expect, it } from "vitest";
import type { ConversationState } from "../../../domain/conversation";
import { getActiveTurnId, hasInProgressTurn, isConversationStreaming } from "./conversationSelectors";

function createConversation(turns: ConversationState["turns"]): ConversationState {
  return {
    id: "thread-1",
    title: "thread",
    branch: null,
    cwd: "E:/code/FPGA",
    updatedAt: new Date().toISOString(),
    source: "appServer",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns,
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };
}

describe("conversationSelectors", () => {
  it("treats placeholder in-progress turns as streaming without an active turn id", () => {
    const conversation = createConversation([{
      localId: "local-1",
      turnId: null,
      status: "inProgress",
      error: null,
      params: null,
      items: [],
      turnStartedAtMs: Date.now(),
      planExplanation: null,
      planSteps: [],
      diff: null,
      rawResponses: [],
      notices: [],
      reviewStates: [],
      contextCompactions: [],
      tokenUsage: null,
    }]);

    expect(getActiveTurnId(conversation)).toBeNull();
    expect(hasInProgressTurn(conversation)).toBe(true);
    expect(isConversationStreaming(conversation)).toBe(true);
  });

  it("keeps completed idle turns non-streaming", () => {
    const conversation = createConversation([{
      localId: "turn-1",
      turnId: "turn-1",
      status: "completed",
      error: null,
      params: null,
      items: [],
      turnStartedAtMs: Date.now(),
      planExplanation: null,
      planSteps: [],
      diff: null,
      rawResponses: [],
      notices: [],
      reviewStates: [],
      contextCompactions: [],
      tokenUsage: null,
    }]);

    expect(getActiveTurnId(conversation)).toBeNull();
    expect(hasInProgressTurn(conversation)).toBe(false);
    expect(isConversationStreaming(conversation)).toBe(false);
  });

  it("preserves active turn id behavior for interruptable turns", () => {
    const conversation = createConversation([{
      localId: "turn-1",
      turnId: "turn-1",
      status: "inProgress",
      error: null,
      params: null,
      items: [],
      turnStartedAtMs: Date.now(),
      planExplanation: null,
      planSteps: [],
      diff: null,
      rawResponses: [],
      notices: [],
      reviewStates: [],
      contextCompactions: [],
      tokenUsage: null,
    }]);

    expect(getActiveTurnId(conversation)).toBe("turn-1");
    expect(hasInProgressTurn(conversation)).toBe(true);
    expect(isConversationStreaming(conversation)).toBe(true);
  });
});
