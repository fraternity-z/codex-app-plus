import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type {
  CollaborationModePreset,
  ConversationMessage,
  QueuedFollowUp,
  ReceivedServerRequest,
  ThreadRuntime,
  ThreadSummary,
  TimelineEntry,
} from "./timeline";

export type { CollaborationModePreset, ConversationMessage, FollowUpMode, QueuedFollowUp, ReceivedServerRequest, ServerRequestResolution, ThreadRuntime, ThreadSummary, TimelineEntry } from "./timeline";
export type TimelineItem = ConversationMessage;
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type AuthStatus = "unknown" | "authenticated" | "needs_login";
export type WorkspaceView = "conversation" | "settings" | "skills" | "mcp" | "worktrees";

export interface AppState {
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly activeView: WorkspaceView;
  readonly threads: Array<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly threadActivities: Record<string, Array<TimelineEntry>>;
  readonly threadRuntime: Record<string, ThreadRuntime>;
  readonly serverRequests: Record<string, ReceivedServerRequest>;
  readonly notifications: Array<ReceivedNotification>;
  readonly models: Array<string>;
  readonly collaborationModes: Array<CollaborationModePreset>;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly initialized: boolean;
  readonly retryScheduledAt: number | null;
  readonly inputText: string;
  readonly bootstrapBusy: boolean;
}

export interface ReceivedNotification {
  readonly method: string;
  readonly params: unknown;
}

export type AppAction =
  | { type: "connection/changed"; status: ConnectionStatus }
  | { type: "fatal/error"; message: string }
  | { type: "view/changed"; view: WorkspaceView }
  | { type: "threads/loaded"; threads: Array<ThreadSummary> }
  | { type: "thread/upserted"; thread: ThreadSummary }
  | { type: "thread/touched"; threadId: string; updatedAt: string }
  | { type: "thread/selected"; threadId: string | null }
  | { type: "thread/messagesLoaded"; threadId: string; messages: Array<ConversationMessage> }
  | { type: "thread/activitiesLoaded"; threadId: string; activities: Array<TimelineEntry> }
  | { type: "message/added"; message: ConversationMessage }
  | { type: "message/assistantDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "item/started"; threadId: string; turnId: string; item: unknown }
  | { type: "item/completed"; threadId: string; turnId: string; item: unknown }
  | { type: "item/planDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "item/commandOutputDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "item/fileChangeDelta"; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: "item/terminalInteraction"; threadId: string; turnId: string; itemId: string; stdin: string }
  | { type: "turn/started"; threadId: string; turnId: string }
  | { type: "turn/completed"; threadId: string; turnId: string }
  | { type: "thread/statusChanged"; threadId: string; status: ThreadSummary["status"]; activeFlags: ThreadSummary["activeFlags"] }
  | { type: "turn/planUpdated"; threadId: string; turnId: string; explanation: string | null; plan: Array<TurnPlanStep> }
  | { type: "turn/diffUpdated"; threadId: string; turnId: string; diff: string }
  | { type: "serverRequest/received"; request: ReceivedServerRequest }
  | { type: "serverRequest/resolved"; requestId: string }
  | { type: "followUp/enqueued"; threadId: string; followUp: QueuedFollowUp }
  | { type: "followUp/dequeued"; threadId: string; followUpId: string }
  | { type: "followUp/removed"; threadId: string; followUpId: string }
  | { type: "followUp/cleared"; threadId: string }
  | { type: "turn/interruptRequested"; threadId: string; turnId: string }
  | { type: "notification/received"; notification: ReceivedNotification }
  | { type: "models/loaded"; models: Array<string> }
  | { type: "collaborationModes/loaded"; modes: Array<CollaborationModePreset> }
  | { type: "config/loaded"; config: ConfigReadResponse }
  | { type: "auth/changed"; status: AuthStatus; mode: string | null }
  | { type: "initialized/changed"; ready: boolean }
  | { type: "retry/scheduled"; at: number | null }
  | { type: "input/changed"; value: string }
  | { type: "bootstrapBusy/changed"; busy: boolean };

export const INITIAL_STATE: AppState = {
  connectionStatus: "disconnected",
  fatalError: null,
  activeView: "conversation",
  threads: [],
  selectedThreadId: null,
  threadActivities: {},
  threadRuntime: {},
  serverRequests: {},
  notifications: [],
  models: [],
  collaborationModes: [],
  configSnapshot: null,
  authStatus: "unknown",
  authMode: null,
  initialized: false,
  retryScheduledAt: null,
  inputText: "",
  bootstrapBusy: false,
};
