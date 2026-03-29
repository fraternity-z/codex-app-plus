import { describe, expect, it } from "vitest";
import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ThreadTokenUsage } from "../../../protocol/generated/v2/ThreadTokenUsage";
import { formatContextWindowTokenCount, selectConversationContextWindowUsage } from "./conversationContextWindow";

const TOKEN_USAGE_EARLY: ThreadTokenUsage = {
  total: { totalTokens: 4000, inputTokens: 3800, cachedInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 0 },
  last: { totalTokens: 200, inputTokens: 0, cachedInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 0 },
  modelContextWindow: 100000,
};

const TOKEN_USAGE_LATE: ThreadTokenUsage = {
  total: { totalTokens: 39000, inputTokens: 36000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  last: { totalTokens: 3000, inputTokens: 0, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  modelContextWindow: 258000,
};

const TOKEN_USAGE_INVALID: ThreadTokenUsage = {
  total: { totalTokens: 320000, inputTokens: 317000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  last: { totalTokens: 160000, inputTokens: 157000, cachedInputTokens: 0, outputTokens: 3000, reasoningOutputTokens: 0 },
  modelContextWindow: 128000,
};

function createTurn(overrides: Partial<ConversationTurnState> = {}): ConversationTurnState {
  return {
    localId: `local-${overrides.turnId ?? "turn"}`,
    turnId: "turn-1",
    status: "completed",
    error: null,
    params: null,
    items: [],
    turnStartedAtMs: 1,
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

function createConversation(turns: ReadonlyArray<ConversationTurnState>): ConversationState {
  return {
    id: "thread-1",
    title: "Thread",
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-11T00:00:00.000Z",
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

function createConfigSnapshot(overrides: Partial<ConfigReadResponse["config"]> = {}): ConfigReadResponse {
  return {
    config: {
      model: null,
      review_model: null,
      model_context_window: null,
      model_auto_compact_token_limit: null,
      model_provider: null,
      approval_policy: null,
      approvals_reviewer: null,
      sandbox_mode: null,
      sandbox_workspace_write: null,
      forced_chatgpt_workspace_id: null,
      forced_login_method: null,
      web_search: null,
      tools: null,
      profile: null,
      profiles: {},
      instructions: null,
      developer_instructions: null,
      compact_prompt: null,
      model_reasoning_effort: null,
      model_reasoning_summary: null,
      model_verbosity: null,
      service_tier: null,
      analytics: null,
      apps: null,
      ...overrides,
    } as ConfigReadResponse["config"],
    origins: {},
    layers: [],
  };
}

describe("selectConversationContextWindowUsage", () => {
  it("selects the latest turn with official usage data", () => {
    const conversation = createConversation([
      createTurn({ turnId: "turn-1", tokenUsage: TOKEN_USAGE_EARLY }),
      createTurn({ turnId: "turn-2" }),
      createTurn({ turnId: "turn-3", tokenUsage: TOKEN_USAGE_LATE }),
    ]);

    const result = selectConversationContextWindowUsage(
      conversation,
      createConfigSnapshot({ model_auto_compact_token_limit: 120000n as never }),
    );

    expect(result).toEqual({
      turnId: "turn-3",
      usedTokens: 3000,
      totalTokens: 258000,
      usedPercent: 1,
      remainingPercent: 99,
      autoCompactConfigured: true,
    });
  });

  it("prefers latest-turn delta when available to match the official usage indicator", () => {
    const conversation = createConversation([
      createTurn({ turnId: "turn-1", tokenUsage: TOKEN_USAGE_EARLY }),
      createTurn({ turnId: "turn-2", tokenUsage: TOKEN_USAGE_LATE }),
    ]);

    expect(selectConversationContextWindowUsage(conversation, createConfigSnapshot())).toEqual({
      turnId: "turn-2",
      usedTokens: 3000,
      totalTokens: 258000,
      usedPercent: 1,
      remainingPercent: 99,
      autoCompactConfigured: false,
    });
  });

  it("falls back to cumulative totals when latest-turn delta is unavailable", () => {
    const conversation = createConversation([
      createTurn({
        turnId: "turn-1",
        tokenUsage: {
          ...TOKEN_USAGE_LATE,
          last: { ...TOKEN_USAGE_LATE.last, totalTokens: 0 },
        },
      }),
    ]);

    expect(selectConversationContextWindowUsage(conversation, createConfigSnapshot())).toEqual({
      turnId: "turn-1",
      usedTokens: 39000,
      totalTokens: 258000,
      usedPercent: 15,
      remainingPercent: 85,
      autoCompactConfigured: false,
    });
  });

  it("clamps latest-turn delta when it exceeds the context window", () => {
    const conversation = createConversation([
      createTurn({ turnId: "turn-1", tokenUsage: TOKEN_USAGE_INVALID }),
    ]);

    expect(selectConversationContextWindowUsage(conversation, createConfigSnapshot())).toEqual({
      turnId: "turn-1",
      usedTokens: 128000,
      totalTokens: 128000,
      usedPercent: 100,
      remainingPercent: 0,
      autoCompactConfigured: false,
    });
  });

  it("hides the indicator when the official context window is unavailable", () => {
    const conversation = createConversation([
      createTurn({
        turnId: "turn-1",
        tokenUsage: {
          ...TOKEN_USAGE_LATE,
          modelContextWindow: null,
        },
      }),
    ]);

    expect(selectConversationContextWindowUsage(conversation, createConfigSnapshot())).toBeNull();
  });
});

describe("formatContextWindowTokenCount", () => {
  it("formats token counts for the compact tooltip copy", () => {
    expect(formatContextWindowTokenCount(999)).toBe("999");
    expect(formatContextWindowTokenCount(14996)).toBe("15k");
    expect(formatContextWindowTokenCount(258000)).toBe("258k");
  });
});
