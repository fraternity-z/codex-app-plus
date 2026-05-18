export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "disabled"
  | "error"
  | "upToDate";

export interface AppUpdateState {
  readonly status: AppUpdateStatus;
  readonly currentVersion: string | null;
  readonly nextVersion: string | null;
  readonly notes: string | null;
  readonly lastCheckedAt: string | null;
  readonly downloadedBytes: number;
  readonly totalBytes: number | null;
  readonly progressPercent: number | null;
  readonly error: string | null;
}

export type AppUpdateAction =
  | { type: "appUpdate/currentVersionLoaded"; version: string }
  | { type: "appUpdate/checkStarted" }
  | { type: "appUpdate/upToDate"; checkedAt: string }
  | { type: "appUpdate/available"; currentVersion: string; nextVersion: string; notes: string | null; checkedAt: string }
  | { type: "appUpdate/downloadStarted" }
  | { type: "appUpdate/downloadProgress"; downloadedBytes: number; totalBytes: number | null; progressPercent: number | null }
  | { type: "appUpdate/downloaded" }
  | { type: "appUpdate/installStarted" }
  | { type: "appUpdate/disabled" }
  | { type: "appUpdate/error"; message: string };

export const INITIAL_APP_UPDATE_STATE: AppUpdateState = {
  status: "idle",
  currentVersion: null,
  nextVersion: null,
  notes: null,
  lastCheckedAt: null,
  downloadedBytes: 0,
  totalBytes: null,
  progressPercent: null,
  error: null,
};
