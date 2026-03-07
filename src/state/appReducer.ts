import type { ConversationState } from "../domain/conversation";
import type { AppAction, AppState } from "../domain/types";
import { INITIAL_STATE } from "../domain/types";
import {
  addPlaceholderTurn,
  applyConversationOutputDelta,
  applyConversationTextDelta,
  appendConversationTerminalInteraction,
  attachApprovalRequestToConversation,
  attachConversationRawResponse,
  createConversationFromThread,
  hydrateConversationFromThread,
  setConversationDiff,
  setConversationHidden,
  setConversationPlan,
  setConversationResumeState,
  setConversationStatus,
  syncCompletedTurn,
  syncStartedTurn,
  touchConversation,
  upsertConversationItem,
} from "../app/conversationState";

const MAX_NOTIFICATION_LOG = 500;

function upsertOrder(order: ReadonlyArray<string>, conversationId: string): ReadonlyArray<string> {
  return [conversationId, ...order.filter((id) => id !== conversationId)];
}

function mergeConversation(existing: ConversationState | undefined, nextConversation: ConversationState): ConversationState {
  if (existing === undefined) {
    return nextConversation;
  }
  return {
    ...nextConversation,
    turns: nextConversation.turns.length > 0 ? nextConversation.turns : existing.turns,
    queuedFollowUps: existing.queuedFollowUps,
    interruptRequestedTurnId: existing.interruptRequestedTurnId,
    hidden: nextConversation.hidden || existing.hidden,
  };
}

function upsertConversationState(state: AppState, conversation: ConversationState): AppState {
  const nextConversation = mergeConversation(state.conversationsById[conversation.id], conversation);
  return {
    ...state,
    conversationsById: { ...state.conversationsById, [conversation.id]: nextConversation },
    orderedConversationIds: upsertOrder(state.orderedConversationIds, conversation.id),
  };
}

function updateConversation(state: AppState, conversationId: string, updater: (conversation: ConversationState) => ConversationState): AppState {
  const current = state.conversationsById[conversationId];
  if (current === undefined) {
    return state;
  }
  return {
    ...state,
    conversationsById: { ...state.conversationsById, [conversationId]: updater(current) },
  };
}

function rebuildPendingRequestsByConversationId(requestsById: Record<string, AppState["pendingRequestsById"][string]>): AppState["pendingRequestsByConversationId"] {
  const nextMap: Record<string, Array<AppState["pendingRequestsById"][string]>> = {};
  for (const request of Object.values(requestsById)) {
    if (request.threadId === null) {
      continue;
    }
    nextMap[request.threadId] = [...(nextMap[request.threadId] ?? []), request];
  }
  return nextMap;
}

function pushNotification(state: AppState, action: Extract<AppAction, { type: "notification/received" }>): AppState {
  const notifications = [...state.notifications, action.notification];
  return { ...state, notifications: notifications.length > MAX_NOTIFICATION_LOG ? notifications.slice(-MAX_NOTIFICATION_LOG) : notifications };
}

function updateQueuedFollowUps(state: AppState, conversationId: string, nextQueuedFollowUps: ConversationState["queuedFollowUps"]): AppState {
  return updateConversation(state, conversationId, (conversation) => ({ ...conversation, queuedFollowUps: nextQueuedFollowUps }));
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "connection/changed":
      return { ...state, connectionStatus: action.status, fatalError: action.status === "error" ? state.fatalError : null };
    case "fatal/error":
      return { ...state, connectionStatus: "error", fatalError: action.message, initialized: false };
    case "view/changed":
      return { ...state, activeView: action.view };
    case "conversations/catalogLoaded": {
      const conversationsById = { ...state.conversationsById };
      for (const conversation of action.conversations) {
        conversationsById[conversation.id] = mergeConversation(conversationsById[conversation.id], conversation);
      }
      return { ...state, conversationsById, orderedConversationIds: [...new Set([...action.conversations.map((conversation) => conversation.id), ...state.orderedConversationIds])] };
    }
    case "conversation/upserted":
      return upsertConversationState(state, action.conversation);
    case "conversation/selected":
      return { ...state, selectedConversationId: action.conversationId };
    case "conversation/draftOpened":
      return { ...state, draftConversation: action.draft, selectedConversationId: null };
    case "conversation/draftCleared":
      return { ...state, draftConversation: null };
    case "conversation/hiddenChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationHidden(conversation, action.hidden));
    case "conversation/resumeStateChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationResumeState(conversation, action.resumeState));
    case "conversation/loaded": {
      const existing = state.conversationsById[action.conversationId] ?? createConversationFromThread(action.thread, { resumeState: "resumed" });
      return upsertConversationState(state, hydrateConversationFromThread(existing, action.thread));
    }
    case "conversation/touched": {
      const nextState = updateConversation(state, action.conversationId, (conversation) => touchConversation(conversation, action.updatedAt));
      return { ...nextState, orderedConversationIds: upsertOrder(nextState.orderedConversationIds, action.conversationId) };
    }
    case "conversation/statusChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationStatus(conversation, action.status, action.activeFlags));
    case "conversation/turnPlaceholderAdded":
      return updateConversation(state, action.conversationId, (conversation) => addPlaceholderTurn(conversation, action.params));
    case "conversation/turnStarted":
      return updateConversation(state, action.conversationId, (conversation) => syncStartedTurn(conversation, action.turn));
    case "conversation/turnCompleted":
      return updateConversation(state, action.conversationId, (conversation) => syncCompletedTurn(conversation, action.turn));
    case "conversation/itemStarted":
    case "conversation/itemCompleted":
      return updateConversation(state, action.conversationId, (conversation) => upsertConversationItem(conversation, action.turnId, action.item));
    case "conversation/textDeltasFlushed": {
      let nextState = state;
      for (const entry of action.entries) {
        nextState = updateConversation(nextState, entry.conversationId, (conversation) => applyConversationTextDelta(conversation, entry));
      }
      return nextState;
    }
    case "conversation/outputDeltasFlushed": {
      let nextState = state;
      for (const entry of action.entries) {
        nextState = updateConversation(nextState, entry.conversationId, (conversation) => applyConversationOutputDelta(conversation, entry));
      }
      return nextState;
    }
    case "conversation/terminalInteraction":
      return updateConversation(state, action.conversationId, (conversation) => appendConversationTerminalInteraction(conversation, action.turnId, action.itemId, action.stdin));
    case "conversation/rawResponseAttached":
      return updateConversation(state, action.conversationId, (conversation) => attachConversationRawResponse(conversation, action.turnId, action.itemId, action.rawResponse));
    case "conversation/planUpdated":
      return updateConversation(state, action.conversationId, (conversation) => setConversationPlan(conversation, action.turnId, action.explanation, action.plan));
    case "conversation/diffUpdated":
      return updateConversation(state, action.conversationId, (conversation) => setConversationDiff(conversation, action.turnId, action.diff));
    case "serverRequest/received": {
      const pendingRequestsById = { ...state.pendingRequestsById, [action.request.id]: action.request };
      let nextState = { ...state, pendingRequestsById, pendingRequestsByConversationId: rebuildPendingRequestsByConversationId(pendingRequestsById) };
      if ((action.request.kind === "commandApproval" || action.request.kind === "fileApproval") && action.request.threadId !== null && action.request.turnId !== null && action.request.itemId !== null) {
        const { threadId, turnId, itemId, id } = action.request;
        nextState = updateConversation(nextState, threadId, (conversation) => attachApprovalRequestToConversation(conversation, turnId, itemId, id));
      }
      return nextState;
    }
    case "serverRequest/resolved": {
      if (state.pendingRequestsById[action.requestId] === undefined) {
        return state;
      }
      const pendingRequestsById = { ...state.pendingRequestsById };
      delete pendingRequestsById[action.requestId];
      return { ...state, pendingRequestsById, pendingRequestsByConversationId: rebuildPendingRequestsByConversationId(pendingRequestsById) };
    }
    case "followUp/enqueued": {
      const current = state.conversationsById[action.conversationId];
      return current === undefined ? state : updateQueuedFollowUps(state, action.conversationId, [...current.queuedFollowUps, action.followUp]);
    }
    case "followUp/dequeued":
    case "followUp/removed": {
      const current = state.conversationsById[action.conversationId];
      return current === undefined ? state : updateQueuedFollowUps(state, action.conversationId, current.queuedFollowUps.filter((followUp) => followUp.id !== action.followUpId));
    }
    case "followUp/cleared":
      return updateQueuedFollowUps(state, action.conversationId, []);
    case "turn/interruptRequested":
      return updateConversation(state, action.conversationId, (conversation) => ({ ...conversation, interruptRequestedTurnId: action.turnId }));
    case "notification/received":
      return pushNotification(state, action);
    case "models/loaded":
      return { ...state, models: [...action.models] };
    case "collaborationModes/loaded":
      return { ...state, collaborationModes: [...action.modes] };
    case "config/loaded":
      return { ...state, configSnapshot: action.config };
    case "auth/changed":
      return { ...state, authStatus: action.status, authMode: action.mode };
    case "initialized/changed":
      return { ...state, initialized: action.ready };
    case "retry/scheduled":
      return { ...state, retryScheduledAt: action.at };
    case "input/changed":
      return { ...state, inputText: action.value };
    case "bootstrapBusy/changed":
      return { ...state, bootstrapBusy: action.busy };
    default:
      return state;
  }
}

export function createInitialState(): AppState {
  return INITIAL_STATE;
}
