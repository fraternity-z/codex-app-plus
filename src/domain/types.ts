import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type { ConversationOutputDelta, ConversationState, ConversationTextDelta, DraftConversationState } from "./conversation";
import type {
  CollaborationModePreset,
  QueuedFollowUp,
  ReceivedServerRequest,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
} from "./timeline";

export type {
  CollaborationModePreset,
  FollowUpMode,
  QueuedFollowUp,
  ReceivedServerRequest,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
} from "./timeline";
export type { ConversationState, DraftConversationState } from "./conversation";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type AuthStatus = "unknown" | "authenticated" | "needs_login";
export type WorkspaceView = "conversation" | "settings" | "skills" | "mcp" | "worktrees";

export interface ReceivedNotification {
  readonly method: string;
  readonly params: unknown;
}

export interface AppState {
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly activeView: WorkspaceView;
  readonly conversationsById: Record<string, ConversationState>;
  readonly orderedConversationIds: ReadonlyArray<string>;
  readonly selectedConversationId: string | null;
  readonly draftConversation: DraftConversationState | null;
  readonly pendingRequestsById: Record<string, ReceivedServerRequest>;
  readonly pendingRequestsByConversationId: Record<string, ReadonlyArray<ReceivedServerRequest>>;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly models: ReadonlyArray<string>;
  readonly collaborationModes: ReadonlyArray<CollaborationModePreset>;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly initialized: boolean;
  readonly retryScheduledAt: number | null;
  readonly inputText: string;
  readonly bootstrapBusy: boolean;
}

export type AppAction =
  | { type: "connection/changed"; status: ConnectionStatus }
  | { type: "fatal/error"; message: string }
  | { type: "view/changed"; view: WorkspaceView }
  | { type: "conversations/catalogLoaded"; conversations: ReadonlyArray<ConversationState> }
  | { type: "conversation/upserted"; conversation: ConversationState }
  | { type: "conversation/selected"; conversationId: string | null }
  | { type: "conversation/draftOpened"; draft: DraftConversationState }
  | { type: "conversation/draftCleared" }
  | { type: "conversation/hiddenChanged"; conversationId: string; hidden: boolean }
  | { type: "conversation/resumeStateChanged"; conversationId: string; resumeState: ConversationState["resumeState"] }
  | { type: "conversation/loaded"; conversationId: string; thread: Parameters<(typeof import("../app/conversationState"))["createConversationFromThread"]>[0] }
  | { type: "conversation/touched"; conversationId: string; updatedAt: string }
  | { type: "conversation/statusChanged"; conversationId: string; status: ConversationState["status"]; activeFlags: ConversationState["activeFlags"] }
  | { type: "conversation/turnPlaceholderAdded"; conversationId: string; params: import("./conversation").ConversationTurnParams }
  | { type: "conversation/turnStarted"; conversationId: string; turn: import("../protocol/generated/v2/Turn").Turn }
  | { type: "conversation/turnCompleted"; conversationId: string; turn: import("../protocol/generated/v2/Turn").Turn }
  | { type: "conversation/itemStarted"; conversationId: string; turnId: string; item: import("../protocol/generated/v2/ThreadItem").ThreadItem }
  | { type: "conversation/itemCompleted"; conversationId: string; turnId: string; item: import("../protocol/generated/v2/ThreadItem").ThreadItem }
  | { type: "conversation/textDeltasFlushed"; entries: ReadonlyArray<ConversationTextDelta> }
  | { type: "conversation/outputDeltasFlushed"; entries: ReadonlyArray<ConversationOutputDelta> }
  | { type: "conversation/terminalInteraction"; conversationId: string; turnId: string; itemId: string; stdin: string }
  | { type: "conversation/rawResponseAttached"; conversationId: string; turnId: string; itemId: string; rawResponse: import("../protocol/generated/ResponseItem").ResponseItem }
  | { type: "conversation/planUpdated"; conversationId: string; turnId: string; explanation: string | null; plan: ReadonlyArray<TurnPlanStep> }
  | { type: "conversation/diffUpdated"; conversationId: string; turnId: string; diff: string }
  | { type: "serverRequest/received"; request: ReceivedServerRequest }
  | { type: "serverRequest/resolved"; requestId: string }
  | { type: "followUp/enqueued"; conversationId: string; followUp: QueuedFollowUp }
  | { type: "followUp/dequeued"; conversationId: string; followUpId: string }
  | { type: "followUp/removed"; conversationId: string; followUpId: string }
  | { type: "followUp/cleared"; conversationId: string }
  | { type: "turn/interruptRequested"; conversationId: string; turnId: string }
  | { type: "notification/received"; notification: ReceivedNotification }
  | { type: "models/loaded"; models: ReadonlyArray<string> }
  | { type: "collaborationModes/loaded"; modes: ReadonlyArray<CollaborationModePreset> }
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
  conversationsById: {},
  orderedConversationIds: [],
  selectedConversationId: null,
  draftConversation: null,
  pendingRequestsById: {},
  pendingRequestsByConversationId: {},
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
