import type { ConversationState } from "../domain/conversation";
import type { ThreadSummary } from "../domain/types";

export function mapConversationToThreadSummary(conversation: ConversationState): ThreadSummary {
  return {
    id: conversation.id,
    title: conversation.title ?? conversation.id,
    cwd: conversation.cwd,
    archived: conversation.hidden,
    updatedAt: conversation.updatedAt,
    source: "rpc",
    status: conversation.status,
    activeFlags: [...conversation.activeFlags],
    queuedCount: conversation.queuedFollowUps.length,
  };
}

export function getActiveTurnId(conversation: ConversationState | null): string | null {
  if (conversation === null) {
    return null;
  }
  const activeTurn = [...conversation.turns].reverse().find((turn) => turn.status === "inProgress") ?? null;
  return activeTurn?.turnId ?? null;
}

export function isConversationStreaming(conversation: ConversationState | null): boolean {
  return getActiveTurnId(conversation) !== null || conversation?.status === "active";
}

export function hasVisibleConversationContent(conversation: ConversationState | null): boolean {
  return conversation !== null && conversation.turns.some((turn) => turn.params !== null || turn.items.length > 0 || turn.planSteps.length > 0 || turn.diff !== null);
}
