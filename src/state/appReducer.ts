import {
  appendAssistantDelta,
  appendCommandOutputDelta,
  appendFileChangeOutputDelta,
  appendPlanDelta,
  appendTerminalInteraction,
  applyItemCompleted,
  applyItemStarted,
  applyRequestToEntries,
  completeTurnActivities,
  createQueuedFollowUpEntry,
  replaceThreadActivities,
  resolveRequestInEntries,
  upsertTurnDiffSnapshot,
  upsertTurnPlanSnapshot,
} from "../app/threadActivities";
import type { AppAction, AppState } from "../domain/types";
import type { ThreadActiveFlag, ThreadRuntime, ThreadSummary } from "../domain/timeline";
import { INITIAL_STATE } from "../domain/types";

const MAX_NOTIFICATION_LOG = 500;

function createThreadRuntime(thread: Pick<ThreadSummary, "id" | "status" | "activeFlags">): ThreadRuntime {
  return {
    threadId: thread.id,
    status: thread.status,
    activeFlags: [...thread.activeFlags],
    activeTurnId: null,
    interruptRequestedTurnId: null,
    queuedFollowUps: [],
    turnPlan: null,
    turnDiff: null,
  };
}

function defaultRuntime(threadId: string): ThreadRuntime {
  return {
    threadId,
    status: "notLoaded",
    activeFlags: [],
    activeTurnId: null,
    interruptRequestedTurnId: null,
    queuedFollowUps: [],
    turnPlan: null,
    turnDiff: null,
  };
}

function getRuntime(state: AppState, threadId: string): ThreadRuntime {
  return state.threadRuntime[threadId] ?? defaultRuntime(threadId);
}

function updateThreadSummary(thread: ThreadSummary, runtime: ThreadRuntime): ThreadSummary {
  return { ...thread, status: runtime.status, activeFlags: [...runtime.activeFlags], queuedCount: runtime.queuedFollowUps.length };
}

function upsertThreadSummary(threads: Array<ThreadSummary>, nextThread: ThreadSummary): Array<ThreadSummary> {
  return [nextThread, ...threads.filter((thread) => thread.id !== nextThread.id)];
}

function syncThread(state: AppState, threadId: string, runtime: ThreadRuntime): AppState {
  return {
    ...state,
    threadRuntime: { ...state.threadRuntime, [threadId]: runtime },
    threads: state.threads.map((thread) => (thread.id === threadId ? updateThreadSummary(thread, runtime) : thread))
  };
}

function setActivities(state: AppState, threadId: string, activities: Array<unknown>): AppState {
  return { ...state, threadActivities: replaceThreadActivities(state.threadActivities, threadId, activities as never) };
}

function pushNotification(state: AppState, action: Extract<AppAction, { type: "notification/received" }>): AppState {
  const notifications = [...state.notifications, action.notification];
  return {
    ...state,
    notifications: notifications.length > MAX_NOTIFICATION_LOG ? notifications.slice(-MAX_NOTIFICATION_LOG) : notifications
  };
}

function rebuildActiveFlags(state: AppState, threadId: string): Array<ThreadActiveFlag> {
  const requests = Object.values(state.serverRequests).filter((request) => request.threadId === threadId);
  const flags: Array<ThreadActiveFlag> = [];
  if (requests.some((request) => request.kind === "commandApproval" || request.kind === "fileApproval")) {
    flags.push("waitingOnApproval");
  }
  if (requests.some((request) => request.kind === "userInput")) {
    flags.push("waitingOnUserInput");
  }
  return flags;
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "connection/changed":
      return { ...state, connectionStatus: action.status, fatalError: action.status === "error" ? state.fatalError : null };
    case "fatal/error":
      return { ...state, connectionStatus: "error", fatalError: action.message, initialized: false };
    case "view/changed":
      return { ...state, activeView: action.view };
    case "threads/loaded":
      return {
        ...state,
        threads: [...action.threads],
        threadRuntime: {
          ...state.threadRuntime,
          ...Object.fromEntries(action.threads.map((thread) => [thread.id, state.threadRuntime[thread.id] ?? createThreadRuntime(thread)]))
        }
      };
    case "thread/upserted": {
      const runtime = state.threadRuntime[action.thread.id] ?? createThreadRuntime(action.thread);
      return {
        ...state,
        threads: upsertThreadSummary(state.threads, updateThreadSummary(action.thread, runtime)),
        threadRuntime: { ...state.threadRuntime, [action.thread.id]: runtime }
      };
    }
    case "thread/touched":
      return { ...state, threads: state.threads.map((thread) => thread.id === action.threadId ? { ...thread, updatedAt: action.updatedAt } : thread) };
    case "thread/selected":
      return { ...state, selectedThreadId: action.threadId };
    case "thread/messagesLoaded":
      return setActivities(state, action.threadId, action.messages);
    case "thread/activitiesLoaded":
      return setActivities(state, action.threadId, action.activities);
    case "message/added": {
      const entries = state.threadActivities[action.message.threadId] ?? [];
      return setActivities(state, action.message.threadId, [...entries, action.message]);
    }
    case "message/assistantDelta": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, appendAssistantDelta(entries, action.threadId, action.turnId, action.itemId, action.delta));
    }
    case "item/started": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, applyItemStarted(entries, action.threadId, action.turnId, action.item as never));
    }
    case "item/completed": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, applyItemCompleted(entries, action.threadId, action.turnId, action.item as never));
    }
    case "item/planDelta": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, appendPlanDelta(entries, action.threadId, action.turnId, action.itemId, action.delta));
    }
    case "item/commandOutputDelta": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, appendCommandOutputDelta(entries, action.threadId, action.turnId, action.itemId, action.delta));
    }
    case "item/fileChangeDelta": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, appendFileChangeOutputDelta(entries, action.threadId, action.turnId, action.itemId, action.delta));
    }
    case "item/terminalInteraction": {
      const entries = state.threadActivities[action.threadId] ?? [];
      return setActivities(state, action.threadId, appendTerminalInteraction(entries, action.threadId, action.turnId, action.itemId, action.stdin));
    }
    case "turn/started": {
      const runtime = { ...getRuntime(state, action.threadId), activeTurnId: action.turnId, status: "active" as const };
      return syncThread(state, action.threadId, runtime);
    }
    case "turn/completed": {
      const nextState = setActivities(state, action.threadId, completeTurnActivities(state.threadActivities[action.threadId] ?? [], action.threadId, action.turnId));
      const runtime = { ...getRuntime(nextState, action.threadId), activeTurnId: null, interruptRequestedTurnId: null, status: "idle" as const, activeFlags: [] };
      return syncThread(nextState, action.threadId, runtime);
    }
    case "thread/statusChanged": {
      const runtime = { ...getRuntime(state, action.threadId), status: action.status, activeFlags: [...action.activeFlags], activeTurnId: action.status === "active" ? getRuntime(state, action.threadId).activeTurnId : null };
      return syncThread(state, action.threadId, runtime);
    }
    case "turn/planUpdated": {
      const activities = upsertTurnPlanSnapshot(state.threadActivities[action.threadId] ?? [], action.threadId, action.turnId, action.explanation, action.plan);
      const nextState = setActivities(state, action.threadId, activities);
      const turnPlan = activities.find((entry) => entry.kind === "turnPlanSnapshot" && entry.turnId === action.turnId);
      const runtime = { ...getRuntime(nextState, action.threadId), turnPlan: turnPlan?.kind === "turnPlanSnapshot" ? turnPlan : null };
      return syncThread(nextState, action.threadId, runtime);
    }
    case "turn/diffUpdated": {
      const activities = upsertTurnDiffSnapshot(state.threadActivities[action.threadId] ?? [], action.threadId, action.turnId, action.diff);
      const nextState = setActivities(state, action.threadId, activities);
      const turnDiff = activities.find((entry) => entry.kind === "turnDiffSnapshot" && entry.turnId === action.turnId);
      const runtime = { ...getRuntime(nextState, action.threadId), turnDiff: turnDiff?.kind === "turnDiffSnapshot" ? turnDiff : null };
      return syncThread(nextState, action.threadId, runtime);
    }
    case "serverRequest/received": {
      const nextRequests = { ...state.serverRequests, [action.request.id]: action.request };
      let nextState: AppState = { ...state, serverRequests: nextRequests };
      if (action.request.threadId !== null) {
        nextState = setActivities(nextState, action.request.threadId, applyRequestToEntries(nextState.threadActivities[action.request.threadId] ?? [], action.request));
        const runtime = { ...getRuntime(nextState, action.request.threadId), activeFlags: rebuildActiveFlags(nextState, action.request.threadId) };
        return syncThread(nextState, action.request.threadId, runtime);
      }
      return nextState;
    }
    case "serverRequest/resolved": {
      const request = state.serverRequests[action.requestId];
      if (request === undefined) {
        return state;
      }
      const nextRequests = { ...state.serverRequests };
      delete nextRequests[action.requestId];
      let nextState: AppState = { ...state, serverRequests: nextRequests };
      if (request.threadId !== null) {
        nextState = setActivities(nextState, request.threadId, resolveRequestInEntries(nextState.threadActivities[request.threadId] ?? [], action.requestId));
        const runtime = { ...getRuntime(nextState, request.threadId), activeFlags: rebuildActiveFlags(nextState, request.threadId) };
        return syncThread(nextState, request.threadId, runtime);
      }
      return nextState;
    }
    case "followUp/enqueued": {
      const runtime = { ...getRuntime(state, action.threadId), queuedFollowUps: [...getRuntime(state, action.threadId).queuedFollowUps, action.followUp] };
      const nextState = syncThread(state, action.threadId, runtime);
      return setActivities(nextState, action.threadId, [...(nextState.threadActivities[action.threadId] ?? []), createQueuedFollowUpEntry(action.threadId, action.followUp)]);
    }
    case "followUp/dequeued":
    case "followUp/removed": {
      const runtime = { ...getRuntime(state, action.threadId), queuedFollowUps: getRuntime(state, action.threadId).queuedFollowUps.filter((followUp) => followUp.id !== action.followUpId) };
      const nextState = syncThread(state, action.threadId, runtime);
      return setActivities(nextState, action.threadId, (nextState.threadActivities[action.threadId] ?? []).filter((entry) => !(entry.kind === "queuedFollowUp" && entry.followUp.id === action.followUpId)));
    }
    case "followUp/cleared": {
      const runtime = { ...getRuntime(state, action.threadId), queuedFollowUps: [] };
      const nextState = syncThread(state, action.threadId, runtime);
      return setActivities(nextState, action.threadId, (nextState.threadActivities[action.threadId] ?? []).filter((entry) => entry.kind !== "queuedFollowUp"));
    }
    case "turn/interruptRequested":
      return syncThread(state, action.threadId, { ...getRuntime(state, action.threadId), interruptRequestedTurnId: action.turnId });
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
