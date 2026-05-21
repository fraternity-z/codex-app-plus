import type { ConversationState } from "../domain/conversation";
import type { AppAction, AppState, RealtimeState, UiBanner } from "../domain/types";
import { INITIAL_STATE } from "../domain/types";
import { DEFAULT_COLLABORATION_PRESET } from "../domain/timeline";
import { pickConversationTitle } from "../features/conversation/model/conversationTitle";

const MAX_NOTIFICATION_LOG = 500;
const MAX_BANNERS = 20;

function upsertOrder(order: ReadonlyArray<string>, conversationId: string): ReadonlyArray<string> {
  return [conversationId, ...order.filter((id) => id !== conversationId)];
}

export function mergeConversation(existing: ConversationState | undefined, nextConversation: ConversationState): ConversationState {
  if (existing === undefined) {
    return nextConversation;
  }
  if (existing.agentEnvironment !== nextConversation.agentEnvironment) {
    return nextConversation;
  }
  return {
    ...nextConversation,
    title: pickConversationTitle(nextConversation.title, existing.title),
    goal: nextConversation.goal ?? existing.goal ?? null,
    turns: nextConversation.turns.length > 0 ? nextConversation.turns : existing.turns,
    queuedFollowUps: existing.queuedFollowUps,
    interruptRequestedTurnId: existing.interruptRequestedTurnId,
    hidden: nextConversation.hidden || existing.hidden,
  };
}

export function upsertConversationState(state: AppState, conversation: ConversationState): AppState {
  const nextConversation = mergeConversation(state.conversationsById[conversation.id], conversation);
  return {
    ...state,
    conversationsById: { ...state.conversationsById, [conversation.id]: nextConversation },
    orderedConversationIds: upsertOrder(state.orderedConversationIds, conversation.id),
  };
}

export function pruneThreadCollaborationPresets(
  currentPresets: AppState["composerUi"]["threadCollaborationPresets"],
  conversationIds: ReadonlyArray<string>,
): AppState["composerUi"]["threadCollaborationPresets"] {
  return conversationIds.reduce<Record<string, AppState["composerUi"]["draftCollaborationPreset"]>>((nextPresets, conversationId) => {
    const preset = currentPresets[conversationId];
    if (preset !== undefined) {
      nextPresets[conversationId] = preset;
    }
    return nextPresets;
  }, {});
}

export function updateConversation(
  state: AppState,
  conversationId: string,
  updater: (conversation: ConversationState) => ConversationState,
): AppState {
  const current = state.conversationsById[conversationId];
  if (current === undefined) {
    return state;
  }
  return { ...state, conversationsById: { ...state.conversationsById, [conversationId]: updater(current) } };
}

export function rebuildPendingRequestsByConversationId(
  requestsById: Record<string, AppState["pendingRequestsById"][string]>,
): AppState["pendingRequestsByConversationId"] {
  const nextMap: Record<string, Array<AppState["pendingRequestsById"][string]>> = {};
  for (const request of Object.values(requestsById)) {
    if (request.threadId === null) {
      continue;
    }
    nextMap[request.threadId] = [...(nextMap[request.threadId] ?? []), request];
  }
  return nextMap;
}

export function resetTransientRequestState(state: AppState): AppState {
  return {
    ...state,
    pendingRequestsById: INITIAL_STATE.pendingRequestsById,
    pendingRequestsByConversationId: INITIAL_STATE.pendingRequestsByConversationId,
    tokenRefresh: INITIAL_STATE.tokenRefresh,
  };
}

export function pushNotification(state: AppState, action: Extract<AppAction, { type: "notification/received" }>): AppState {
  const notifications = [...state.notifications, action.notification];
  return { ...state, notifications: notifications.length > MAX_NOTIFICATION_LOG ? notifications.slice(-MAX_NOTIFICATION_LOG) : notifications };
}

export function setDraftCollaborationPreset(state: AppState, preset: AppState["composerUi"]["draftCollaborationPreset"]): AppState {
  return { ...state, composerUi: { ...state.composerUi, draftCollaborationPreset: preset } };
}

export function resetDraftCollaborationPreset(state: AppState): AppState {
  return setDraftCollaborationPreset(state, DEFAULT_COLLABORATION_PRESET);
}

export function setThreadCollaborationPreset(
  state: AppState,
  conversationId: string,
  preset: AppState["composerUi"]["draftCollaborationPreset"],
): AppState {
  return {
    ...state,
    composerUi: {
      ...state.composerUi,
      threadCollaborationPresets: { ...state.composerUi.threadCollaborationPresets, [conversationId]: preset },
    },
  };
}

export function transferDraftCollaborationPreset(state: AppState, conversationId: string): AppState {
  const nextState = setThreadCollaborationPreset(state, conversationId, state.composerUi.draftCollaborationPreset);
  return resetDraftCollaborationPreset(nextState);
}

export function updateQueuedFollowUps(state: AppState, conversationId: string, nextQueuedFollowUps: ConversationState["queuedFollowUps"]): AppState {
  return updateConversation(state, conversationId, (conversation) => ({ ...conversation, queuedFollowUps: nextQueuedFollowUps }));
}

export function promoteQueuedFollowUp(
  queuedFollowUps: ConversationState["queuedFollowUps"],
  followUpId: string,
): ConversationState["queuedFollowUps"] {
  const target = queuedFollowUps.find((followUp) => followUp.id === followUpId);
  if (target === undefined || queuedFollowUps[0]?.id === followUpId) {
    return queuedFollowUps;
  }
  return [target, ...queuedFollowUps.filter((followUp) => followUp.id !== followUpId)];
}

export function pushBanner(state: AppState, banner: UiBanner): AppState {
  const banners = [banner, ...state.banners.filter((item) => item.id !== banner.id)].slice(0, MAX_BANNERS);
  return { ...state, banners };
}

export function dismissBanner(state: AppState, bannerId: string): AppState {
  return { ...state, banners: state.banners.filter((banner) => banner.id !== bannerId) };
}

export function updateRealtimeState(state: AppState, threadId: string, updater: (current: RealtimeState) => RealtimeState): AppState {
  const current = state.realtimeByThreadId[threadId] ?? { threadId, sessionId: null, items: [], audioChunks: [], error: null, closed: false };
  return { ...state, realtimeByThreadId: { ...state.realtimeByThreadId, [threadId]: updater(current) } };
}
