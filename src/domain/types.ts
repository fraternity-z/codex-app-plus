export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type WorkspaceView = "conversation" | "settings" | "skills" | "mcp" | "worktrees";

export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly cwd: string | null;
  readonly archived: boolean;
  readonly updatedAt: string;
}

export interface TimelineItem {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
}

export interface ReceivedNotification {
  readonly method: string;
  readonly params: unknown;
}

export interface ReceivedServerRequest {
  readonly id: string;
  readonly method: string;
  readonly params: unknown;
}

export interface AppState {
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly activeView: WorkspaceView;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly timeline: ReadonlyArray<TimelineItem>;
  readonly pendingServerRequests: ReadonlyArray<ReceivedServerRequest>;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly models: ReadonlyArray<string>;
  readonly configSnapshot: unknown;
  readonly inputText: string;
  readonly busy: boolean;
}

export type AppAction =
  | { type: "connection/changed"; status: ConnectionStatus }
  | { type: "fatal/error"; message: string }
  | { type: "view/changed"; view: WorkspaceView }
  | { type: "threads/loaded"; threads: ReadonlyArray<ThreadSummary> }
  | { type: "thread/selected"; threadId: string | null }
  | { type: "timeline/appended"; item: TimelineItem }
  | { type: "serverRequest/received"; request: ReceivedServerRequest }
  | { type: "serverRequest/resolved"; requestId: string }
  | { type: "notification/received"; notification: ReceivedNotification }
  | { type: "models/loaded"; models: ReadonlyArray<string> }
  | { type: "config/loaded"; config: unknown }
  | { type: "input/changed"; value: string }
  | { type: "busy/changed"; busy: boolean };

export const INITIAL_STATE: AppState = {
  connectionStatus: "disconnected",
  fatalError: null,
  activeView: "conversation",
  threads: [],
  selectedThreadId: null,
  timeline: [],
  pendingServerRequests: [],
  notifications: [],
  models: [],
  configSnapshot: null,
  inputText: "",
  busy: false
};
