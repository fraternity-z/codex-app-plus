import { produce } from "immer";
import type { AppAction, AppState } from "../domain/types";
import { INITIAL_STATE } from "../domain/types";

const MAX_NOTIFICATION_LOG = 500;
const MAX_TIMELINE_ITEMS = 1000;

function pushBounded<T>(items: Array<T>, next: T, max: number): void {
  items.push(next);
  if (items.length > max) {
    items.splice(0, items.length - max);
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  return produce(state, (draft) => {
    switch (action.type) {
      case "connection/changed":
        draft.connectionStatus = action.status;
        if (action.status !== "error") {
          draft.fatalError = null;
        }
        return;
      case "fatal/error":
        draft.connectionStatus = "error";
        draft.fatalError = action.message;
        return;
      case "view/changed":
        draft.activeView = action.view;
        return;
      case "threads/loaded":
        draft.threads = [...action.threads];
        return;
      case "thread/selected":
        draft.selectedThreadId = action.threadId;
        return;
      case "timeline/appended":
        pushBounded(draft.timeline as Array<typeof action.item>, action.item, MAX_TIMELINE_ITEMS);
        return;
      case "serverRequest/received":
        draft.pendingServerRequests = [...draft.pendingServerRequests, action.request];
        return;
      case "serverRequest/resolved":
        draft.pendingServerRequests = draft.pendingServerRequests.filter(
          (request) => request.id !== action.requestId
        );
        return;
      case "notification/received":
        pushBounded(
          draft.notifications as Array<typeof action.notification>,
          action.notification,
          MAX_NOTIFICATION_LOG
        );
        return;
      case "models/loaded":
        draft.models = [...action.models];
        return;
      case "config/loaded":
        draft.configSnapshot = action.config;
        return;
      case "input/changed":
        draft.inputText = action.value;
        return;
      case "busy/changed":
        draft.busy = action.busy;
        return;
      default:
        return;
    }
  });
}

export function createInitialState(): AppState {
  return INITIAL_STATE;
}
