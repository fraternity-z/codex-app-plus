import type { AppUpdateAction } from "../../../domain/appUpdate";
import type { AppAction, AppState } from "../../../domain/types";

function isCurrentAppUpdateAction(action: AppAction): action is AppUpdateAction {
  return action.type.startsWith("appUpdate/");
}

function withProgress(
  state: AppState,
  downloadedBytes: number,
  totalBytes: number | null,
  progressPercent: number | null,
): AppState {
  return {
    ...state,
    appUpdate: {
      ...state.appUpdate,
      status: "downloading",
      downloadedBytes,
      totalBytes,
      progressPercent,
      error: null,
    },
  };
}

function withAvailableUpdate(
  state: AppState,
  action: Extract<AppUpdateAction, { type: "appUpdate/available" }>,
): AppState {
  return {
    ...state,
    appUpdate: {
      ...state.appUpdate,
      status: "available",
      currentVersion: action.currentVersion,
      nextVersion: action.nextVersion,
      notes: action.notes,
      lastCheckedAt: action.checkedAt,
      downloadedBytes: 0,
      totalBytes: null,
      progressPercent: null,
      error: null,
    },
  };
}

function withCheckStatus(
  state: AppState,
  status: AppState["appUpdate"]["status"],
  checkedAt: string,
): AppState {
  return {
    ...state,
    appUpdate: {
      ...state.appUpdate,
      status,
      lastCheckedAt: checkedAt,
      downloadedBytes: 0,
      totalBytes: null,
      progressPercent: null,
      error: null,
      nextVersion: status === "upToDate" ? null : state.appUpdate.nextVersion,
      notes: status === "upToDate" ? null : state.appUpdate.notes,
    },
  };
}

export function reduceAppUpdateState(state: AppState, action: AppAction): AppState | null {
  if (!isCurrentAppUpdateAction(action)) {
    return null;
  }
  switch (action.type) {
    case "appUpdate/currentVersionLoaded":
      return { ...state, appUpdate: { ...state.appUpdate, currentVersion: action.version } };
    case "appUpdate/checkStarted":
      return { ...state, appUpdate: { ...state.appUpdate, status: "checking", error: null, progressPercent: null } };
    case "appUpdate/upToDate":
      return withCheckStatus(state, "upToDate", action.checkedAt);
    case "appUpdate/available":
      return withAvailableUpdate(state, action);
    case "appUpdate/downloadStarted":
      return withProgress(state, 0, null, 0);
    case "appUpdate/downloadProgress":
      return withProgress(state, action.downloadedBytes, action.totalBytes, action.progressPercent);
    case "appUpdate/downloaded":
      return {
        ...state,
        appUpdate: { ...state.appUpdate, status: "downloaded", progressPercent: 1, error: null },
      };
    case "appUpdate/installStarted":
      return { ...state, appUpdate: { ...state.appUpdate, status: "installing", error: null } };
    case "appUpdate/disabled":
      return {
        ...state,
        appUpdate: {
          ...state.appUpdate,
          status: "disabled",
          nextVersion: null,
          notes: null,
          downloadedBytes: 0,
          totalBytes: null,
          progressPercent: null,
          error: null,
        },
      };
    case "appUpdate/error":
      return { ...state, appUpdate: { ...state.appUpdate, status: "error", error: action.message } };
    default:
      return state;
  }
}
