import type { ConversationState } from "../../../domain/conversation";
import type { ThreadSummary } from "../../../domain/types";

function mapConversationSource(source: ConversationState["source"]): ThreadSummary["source"] {
  return source === "codexData" ? "codexData" : "rpc";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isConversationSourceSubagent(source: ConversationState["source"]): boolean {
  return isRecord(source) && ("subAgent" in source || "subagent" in source);
}

export function mapConversationToThreadSummary(conversation: ConversationState): ThreadSummary {
  const isSubagent = conversation.isSubagent === true
    || isConversationSourceSubagent(conversation.source)
    || hasText(conversation.agentNickname)
    || hasText(conversation.agentRole);
  return {
    id: conversation.id,
    title: conversation.title ?? conversation.id,
    branch: conversation.branch,
    cwd: conversation.cwd,
    archived: conversation.hidden,
    updatedAt: conversation.updatedAt,
    source: mapConversationSource(conversation.source),
    ...(isSubagent ? { isSubagent: true } : {}),
    ...(hasText(conversation.agentNickname) ? { agentNickname: conversation.agentNickname } : {}),
    ...(hasText(conversation.agentRole) ? { agentRole: conversation.agentRole } : {}),
    agentEnvironment: conversation.agentEnvironment,
    status: conversation.status,
    activeFlags: [...conversation.activeFlags],
    queuedCount: conversation.queuedFollowUps.length,
  };
}

export function getActiveTurnId(conversation: ConversationState | null): string | null {
  if (conversation === null) {
    return null;
  }
  for (let index = conversation.turns.length - 1; index >= 0; index -= 1) {
    const turn = conversation.turns[index];
    if (turn.status === "inProgress") {
      return turn.turnId;
    }
  }
  return null;
}

export function hasInProgressTurn(conversation: ConversationState | null): boolean {
  return conversation?.turns.some((turn) => turn.status === "inProgress") ?? false;
}

export function isConversationStreaming(conversation: ConversationState | null): boolean {
  return hasInProgressTurn(conversation) || conversation?.status === "active";
}

export function hasVisibleConversationContent(conversation: ConversationState | null): boolean {
  return conversation !== null && conversation.turns.some((turn) => turn.params !== null || turn.items.length > 0 || turn.planSteps.length > 0 || turn.diff !== null);
}
