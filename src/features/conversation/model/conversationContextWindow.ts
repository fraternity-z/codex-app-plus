import type { ConversationState } from "../../../domain/conversation";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";

const PERCENT_SCALE = 100;
const TOKEN_ABBREVIATION_BASE = 1000;

export interface ConversationContextWindowUsage {
  readonly turnId: string;
  readonly usedTokens: number;
  readonly totalTokens: number;
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly autoCompactConfigured: boolean;
}

function readWholeNumber(value: unknown): number | null {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isAutoCompactConfigured(configSnapshot: ConfigReadResponse | null): boolean {
  return readWholeNumber(configSnapshot?.config.model_auto_compact_token_limit) !== null;
}

function calculatePercent(usedTokens: number, totalTokens: number): number {
  return Math.round((usedTokens / totalTokens) * PERCENT_SCALE);
}

export function formatContextWindowTokenCount(tokens: number): string {
  if (tokens >= TOKEN_ABBREVIATION_BASE) {
    return `${Math.round(tokens / TOKEN_ABBREVIATION_BASE)}k`;
  }
  return String(tokens);
}

export function selectConversationContextWindowUsage(
  conversation: ConversationState | null,
  configSnapshot: ConfigReadResponse | null,
): ConversationContextWindowUsage | null {
  if (conversation === null) {
    return null;
  }
  const turn = [...conversation.turns].reverse().find((entry) => entry.turnId !== null && entry.tokenUsage !== null) ?? null;
  if (turn === null || turn.turnId === null || turn.tokenUsage === null) {
    return null;
  }
  const usedTokens = turn.tokenUsage.total.totalTokens;
  const totalTokens = turn.tokenUsage.modelContextWindow;
  if (totalTokens === null || totalTokens <= 0) {
    return null;
  }
  const usedPercent = calculatePercent(usedTokens, totalTokens);
  return {
    turnId: turn.turnId,
    usedTokens,
    totalTokens,
    usedPercent,
    remainingPercent: PERCENT_SCALE - usedPercent,
    autoCompactConfigured: isAutoCompactConfigured(configSnapshot),
  };
}
