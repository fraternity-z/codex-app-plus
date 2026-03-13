import type { ConversationState } from "../domain/conversation";
import type { AppAction, AppState, RealtimeState, UiBanner } from "../domain/types";
import { INITIAL_STATE } from "../domain/types";
import {
  addConversationMcpProgress,
  addConversationSystemNotice,
  addPlaceholderTurn,
  appendConversationContextCompaction,
  appendConversationRawResponse,
  appendConversationReviewState,
  appendConversationTerminalInteraction,
  applyConversationOutputDelta,
  applyConversationTextDelta,
  attachApprovalRequestToConversation,
  attachConversationRawResponse,
  hydrateConversationFromThread,
  setConversationDiff,
  setConversationHidden,
  setConversationPlan,
  setConversationResumeState,
  setConversationStatus,
  setConversationTitle,
  setConversationTokenUsage,
  syncCompletedTurn,
  syncStartedTurn,
  touchConversation,
  upsertConversationItem,
} from "../features/conversation/model/conversationState";
import { pickConversationTitle } from "../features/conversation/model/conversationTitle";

const MAX_NOTIFICATION_LOG = 500;
const MAX_BANNERS = 20;

function upsertOrder(order: ReadonlyArray<string>, conversationId: string): ReadonlyArray<string> {
  return [conversationId, ...order.filter((id) => id !== conversationId)];
}

function mergeConversation(existing: ConversationState | undefined, nextConversation: ConversationState): ConversationState {
  if (existing === undefined) {
    return nextConversation;
  }
  if (existing.agentEnvironment !== nextConversation.agentEnvironment) {
    return nextConversation;
  }
  return {
    ...nextConversation,
    title: pickConversationTitle(nextConversation.title, existing.title),
    turns: nextConversation.turns.length > 0 ? nextConversation.turns : existing.turns,
    queuedFollowUps: existing.queuedFollowUps,
    interruptRequestedTurnId: existing.interruptRequestedTurnId,
    hidden: nextConversation.hidden || existing.hidden,
  };
}

function upsertConversationState(state: AppState, conversation: ConversationState): AppState {
  const nextConversation = mergeConversation(state.conversationsById[conversation.id], conversation);
  return { ...state, conversationsById: { ...state.conversationsById, [conversation.id]: nextConversation }, orderedConversationIds: upsertOrder(state.orderedConversationIds, conversation.id) };
}

function updateConversation(state: AppState, conversationId: string, updater: (conversation: ConversationState) => ConversationState): AppState {
  const current = state.conversationsById[conversationId];
  if (current === undefined) {
    return state;
  }
  return { ...state, conversationsById: { ...state.conversationsById, [conversationId]: updater(current) } };
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

function pushBanner(state: AppState, banner: UiBanner): AppState {
  const banners = [banner, ...state.banners.filter((item) => item.id !== banner.id)].slice(0, MAX_BANNERS);
  return { ...state, banners };
}

function updateRealtimeState(state: AppState, threadId: string, updater: (current: RealtimeState) => RealtimeState): AppState {
  const current = state.realtimeByThreadId[threadId] ?? { threadId, sessionId: null, items: [], audioChunks: [], error: null, closed: false };
  return { ...state, realtimeByThreadId: { ...state.realtimeByThreadId, [threadId]: updater(current) } };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "connection/changed":
      return {
        ...state,
        connectionStatus: action.status,
        fatalError: action.status === "error" ? state.fatalError : null,
        windowsSandboxSetup: action.status === "connected" ? state.windowsSandboxSetup : INITIAL_STATE.windowsSandboxSetup,
      };
    case "fatal/error":
      return { ...state, connectionStatus: "error", fatalError: action.message, initialized: false, windowsSandboxSetup: INITIAL_STATE.windowsSandboxSetup };
    case "view/changed":
      return { ...state, activeView: action.view };
    case "conversations/catalogLoaded": {
      const conversationsById: AppState["conversationsById"] = {};
      for (const conversation of action.conversations) {
        conversationsById[conversation.id] = mergeConversation(conversationsById[conversation.id], conversation);
        conversationsById[conversation.id] = mergeConversation(state.conversationsById[conversation.id], conversationsById[conversation.id]);
      }
      const orderedConversationIds = action.conversations.map((conversation) => conversation.id);
      const selectedConversationId = state.selectedConversationId !== null && conversationsById[state.selectedConversationId] !== undefined
        ? state.selectedConversationId
        : null;
      return { ...state, conversationsById, orderedConversationIds, selectedConversationId };
    }
    case "conversation/upserted":
      return upsertConversationState(state, action.conversation);
    case "conversation/selected":
      return { ...state, selectedConversationId: action.conversationId, draftConversation: action.conversationId === null ? state.draftConversation : null };
    case "conversation/draftOpened":
      return { ...state, draftConversation: action.draft, selectedConversationId: null };
    case "conversation/draftCleared":
      return { ...state, draftConversation: null };
    case "conversation/hiddenChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationHidden(conversation, action.hidden));
    case "conversation/titleChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationTitle(conversation, action.title));
    case "conversation/resumeStateChanged":
      return updateConversation(state, action.conversationId, (conversation) => setConversationResumeState(conversation, action.resumeState));
    case "conversation/loaded":
      return updateConversation(state, action.conversationId, (conversation) => hydrateConversationFromThread(conversation, action.thread));
    case "conversation/touched":
      return updateConversation(state, action.conversationId, (conversation) => touchConversation(conversation, action.updatedAt));
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
    case "conversation/rawResponseAppended":
      return updateConversation(state, action.conversationId, (conversation) => appendConversationRawResponse(conversation, action.turnId, action.rawResponse));
    case "conversation/planUpdated":
      return updateConversation(state, action.conversationId, (conversation) => setConversationPlan(conversation, action.turnId, action.explanation, action.plan));
    case "conversation/diffUpdated":
      return updateConversation(state, action.conversationId, (conversation) => setConversationDiff(conversation, action.turnId, action.diff));
    case "conversation/mcpProgressAdded":
      return updateConversation(state, action.conversationId, (conversation) => addConversationMcpProgress(conversation, action.turnId, action.itemId, action.message));
    case "conversation/systemNoticeAdded":
      return updateConversation(state, action.conversationId, (conversation) => addConversationSystemNotice(conversation, action.turnId, action.title, action.detail, action.level, action.source));
    case "conversation/tokenUsageUpdated":
      return updateConversation(state, action.conversationId, (conversation) => setConversationTokenUsage(conversation, action.turnId, action.usage));
    case "conversation/reviewModeChanged":
      return updateConversation(state, action.conversationId, (conversation) => appendConversationReviewState(conversation, action.turnId, action.itemId, action.state, action.review));
    case "conversation/contextCompacted":
      return updateConversation(state, action.conversationId, (conversation) => appendConversationContextCompaction(conversation, action.turnId));
    case "serverRequest/received": {
      const pendingRequestsById = { ...state.pendingRequestsById, [action.request.id]: action.request };
      let nextState = { ...state, pendingRequestsById, pendingRequestsByConversationId: rebuildPendingRequestsByConversationId(pendingRequestsById) };
      if ((action.request.kind === "commandApproval" || action.request.kind === "fileApproval") && action.request.threadId !== null && action.request.turnId !== null && action.request.itemId !== null) {
        const { threadId, turnId, itemId, id } = action.request;
        nextState = updateConversation(nextState, threadId, (conversation) => attachApprovalRequestToConversation(conversation, turnId, itemId, id));
      }
      if (action.request.kind === "tokenRefresh") {
        nextState = { ...nextState, tokenRefresh: { requestId: action.request.id, previousAccountId: action.request.params.previousAccountId ?? null, pending: true, error: null } };
      }
      return nextState;
    }
    case "serverRequest/resolved": {
      if (state.pendingRequestsById[action.requestId] === undefined) {
        return state;
      }
      const pendingRequestsById = { ...state.pendingRequestsById };
      delete pendingRequestsById[action.requestId];
      const nextState = { ...state, pendingRequestsById, pendingRequestsByConversationId: rebuildPendingRequestsByConversationId(pendingRequestsById) };
      return state.tokenRefresh.requestId === action.requestId ? { ...nextState, tokenRefresh: { requestId: null, previousAccountId: null, pending: false, error: null } } : nextState;
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
    case "experimentalFeatures/loaded":
      return { ...state, experimentalFeatures: [...action.features] };
    case "config/loaded":
      return { ...state, configSnapshot: action.config };
    case "mcp/statusesLoaded":
      return { ...state, mcpServerStatuses: [...action.statuses] };
    case "auth/changed":
      return { ...state, authStatus: action.status, authMode: action.mode };
    case "account/updated":
      return { ...state, account: action.account };
    case "rateLimits/updated":
      return { ...state, rateLimits: action.rateLimits };
    case "authLogin/started":
      return { ...state, authLogin: { loginId: action.loginId, authUrl: action.authUrl, pending: true, error: null } };
    case "authLogin/completed":
      return { ...state, authLogin: { ...state.authLogin, pending: false, error: action.success ? null : action.error } };
    case "tokenRefresh/started":
      return { ...state, tokenRefresh: { requestId: action.requestId, previousAccountId: action.previousAccountId, pending: true, error: null } };
    case "tokenRefresh/completed":
      return state.tokenRefresh.requestId !== action.requestId ? state : { ...state, tokenRefresh: { requestId: null, previousAccountId: null, pending: false, error: action.error } };
    case "windowsSandbox/setupStarted":
      return { ...state, windowsSandboxSetup: { pending: true, mode: action.mode, success: null, error: null } };
    case "windowsSandbox/setupCompleted":
      return { ...state, windowsSandboxSetup: { pending: false, mode: action.mode, success: action.success, error: action.error } };
    case "windowsSandbox/setupCleared":
      return { ...state, windowsSandboxSetup: INITIAL_STATE.windowsSandboxSetup };
    case "realtime/started":
      return updateRealtimeState(state, action.threadId, (current) => ({ ...current, sessionId: action.sessionId, closed: false, error: null }));
    case "realtime/itemAdded":
      return updateRealtimeState(state, action.threadId, (current) => ({ ...current, items: [...current.items, action.item] }));
    case "realtime/audioAdded":
      return updateRealtimeState(state, action.threadId, (current) => ({ ...current, audioChunks: [...current.audioChunks, action.audio] }));
    case "realtime/error":
      return updateRealtimeState(state, action.threadId, (current) => ({ ...current, error: action.message }));
    case "realtime/closed":
      return updateRealtimeState(state, action.threadId, (current) => ({ ...current, closed: true }));
    case "fuzzySearch/updated":
      return { ...state, fuzzySearchSessionsById: { ...state.fuzzySearchSessionsById, [action.sessionId]: { sessionId: action.sessionId, query: action.query, files: [...action.files], completed: false } } };
    case "fuzzySearch/completed": {
      const current = state.fuzzySearchSessionsById[action.sessionId];
      if (current === undefined) {
        return state;
      }
      return { ...state, fuzzySearchSessionsById: { ...state.fuzzySearchSessionsById, [action.sessionId]: { ...current, completed: true } } };
    }
    case "fuzzySearch/removed": {
      if (state.fuzzySearchSessionsById[action.sessionId] === undefined) {
        return state;
      }
      const fuzzySearchSessionsById = { ...state.fuzzySearchSessionsById };
      delete fuzzySearchSessionsById[action.sessionId];
      return { ...state, fuzzySearchSessionsById };
    }
    case "banner/pushed":
      return pushBanner(state, action.banner);
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
