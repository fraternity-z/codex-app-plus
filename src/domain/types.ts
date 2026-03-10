import type { AuthMode } from "../protocol/generated/AuthMode";
import type { PlanType } from "../protocol/generated/PlanType";
import type { FuzzyFileSearchResult } from "../protocol/generated/FuzzyFileSearchResult";
import type { ResponseItem } from "../protocol/generated/ResponseItem";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { McpServerStatus } from "../protocol/generated/v2/McpServerStatus";
import type { RateLimitSnapshot } from "../protocol/generated/v2/RateLimitSnapshot";
import type { ThreadRealtimeAudioChunk } from "../protocol/generated/v2/ThreadRealtimeAudioChunk";
import type { Thread } from "../protocol/generated/v2/Thread";
import type { ThreadItem } from "../protocol/generated/v2/ThreadItem";
import type { Turn } from "../protocol/generated/v2/Turn";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type {
  ConversationOutputDelta,
  ConversationState,
  ConversationTextDelta,
  ConversationTurnParams,
  DraftConversationState,
} from "./conversation";
import type {
  CollaborationModePreset,
  NoticeLevel,
  QueuedFollowUp,
} from "./timeline";
import type { ReceivedServerRequest } from "./serverRequests";

export type {
  CollaborationModePreset,
  ComposerAttachment,
  ComposerEnterBehavior,
  ConversationAttachment,
  ConversationMessage,
  FollowUpMode,
  QueuedFollowUp,
  ThreadSummary,
  TimelineEntry,
} from "./timeline";
export type {
  CommandApprovalRequest,
  FileChangeApprovalRequest,
  ReceivedServerRequest,
  ServerRequestResolution,
  TokenRefreshRequest,
  ToolCallRequest,
  ToolRequestUserInputRequest,
} from "./serverRequests";
export type { ConversationState, DraftConversationState } from "./conversation";
export type TimelineItem = import("./timeline").ConversationMessage;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type AuthStatus = "unknown" | "authenticated" | "needs_login";
export type WorkspaceView = "conversation" | "settings" | "skills" | "mcp" | "worktrees";

export interface ReceivedNotification {
  readonly method: string;
  readonly params: unknown;
}

export interface AccountSummary {
  readonly authMode: AuthMode | null;
  readonly planType: PlanType | null;
}

export interface AuthLoginState {
  readonly loginId: string | null;
  readonly authUrl: string | null;
  readonly pending: boolean;
  readonly error: string | null;
}

export interface TokenRefreshState {
  readonly requestId: string | null;
  readonly previousAccountId: string | null;
  readonly pending: boolean;
  readonly error: string | null;
}

export interface UiBanner {
  readonly id: string;
  readonly level: NoticeLevel;
  readonly title: string;
  readonly detail: string | null;
  readonly source: string;
}

export interface RealtimeState {
  readonly threadId: string;
  readonly sessionId: string | null;
  readonly items: ReadonlyArray<unknown>;
  readonly audioChunks: ReadonlyArray<ThreadRealtimeAudioChunk>;
  readonly error: string | null;
  readonly closed: boolean;
}

export interface FuzzySearchSessionState {
  readonly sessionId: string;
  readonly query: string;
  readonly files: ReadonlyArray<FuzzyFileSearchResult>;
  readonly completed: boolean;
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
  readonly mcpServerStatuses: ReadonlyArray<McpServerStatus>;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly account: AccountSummary | null;
  readonly rateLimits: RateLimitSnapshot | null;
  readonly authLogin: AuthLoginState;
  readonly tokenRefresh: TokenRefreshState;
  readonly realtimeByThreadId: Readonly<Record<string, RealtimeState>>;
  readonly fuzzySearchSessionsById: Readonly<Record<string, FuzzySearchSessionState>>;
  readonly banners: ReadonlyArray<UiBanner>;
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
  | { type: "conversation/titleChanged"; conversationId: string; title: string | null }
  | { type: "conversation/resumeStateChanged"; conversationId: string; resumeState: ConversationState["resumeState"] }
  | { type: "conversation/loaded"; conversationId: string; thread: Thread }
  | { type: "conversation/touched"; conversationId: string; updatedAt: string }
  | { type: "conversation/statusChanged"; conversationId: string; status: ConversationState["status"]; activeFlags: ConversationState["activeFlags"] }
  | { type: "conversation/turnPlaceholderAdded"; conversationId: string; params: ConversationTurnParams }
  | { type: "conversation/turnStarted"; conversationId: string; turn: Turn }
  | { type: "conversation/turnCompleted"; conversationId: string; turn: Turn }
  | { type: "conversation/itemStarted"; conversationId: string; turnId: string; item: ThreadItem }
  | { type: "conversation/itemCompleted"; conversationId: string; turnId: string; item: ThreadItem }
  | { type: "conversation/textDeltasFlushed"; entries: ReadonlyArray<ConversationTextDelta> }
  | { type: "conversation/outputDeltasFlushed"; entries: ReadonlyArray<ConversationOutputDelta> }
  | { type: "conversation/terminalInteraction"; conversationId: string; turnId: string; itemId: string; stdin: string }
  | { type: "conversation/rawResponseAttached"; conversationId: string; turnId: string; itemId: string; rawResponse: ResponseItem }
  | { type: "conversation/rawResponseAppended"; conversationId: string; turnId: string; rawResponse: ResponseItem }
  | { type: "conversation/planUpdated"; conversationId: string; turnId: string; explanation: string | null; plan: ReadonlyArray<TurnPlanStep> }
  | { type: "conversation/diffUpdated"; conversationId: string; turnId: string; diff: string }
  | { type: "conversation/mcpProgressAdded"; conversationId: string; turnId: string; itemId: string; message: string }
  | { type: "conversation/systemNoticeAdded"; conversationId: string; turnId: string | null; title: string; detail: string | null; level: NoticeLevel; source: string }
  | { type: "conversation/tokenUsageUpdated"; conversationId: string; turnId: string; usage: import("../protocol/generated/v2/ThreadTokenUsage").ThreadTokenUsage }
  | { type: "conversation/reviewModeChanged"; conversationId: string; turnId: string; itemId: string; state: "entered" | "exited"; review: string }
  | { type: "conversation/contextCompacted"; conversationId: string; turnId: string }
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
  | { type: "mcp/statusesLoaded"; statuses: ReadonlyArray<McpServerStatus> }
  | { type: "auth/changed"; status: AuthStatus; mode: string | null }
  | { type: "account/updated"; account: AccountSummary | null }
  | { type: "rateLimits/updated"; rateLimits: RateLimitSnapshot | null }
  | { type: "authLogin/started"; loginId: string | null; authUrl: string | null }
  | { type: "authLogin/completed"; success: boolean; error: string | null }
  | { type: "tokenRefresh/started"; requestId: string; previousAccountId: string | null }
  | { type: "tokenRefresh/completed"; requestId: string; error: string | null }
  | { type: "realtime/started"; threadId: string; sessionId: string | null }
  | { type: "realtime/itemAdded"; threadId: string; item: unknown }
  | { type: "realtime/audioAdded"; threadId: string; audio: ThreadRealtimeAudioChunk }
  | { type: "realtime/error"; threadId: string; message: string }
  | { type: "realtime/closed"; threadId: string }
  | { type: "fuzzySearch/updated"; sessionId: string; query: string; files: ReadonlyArray<FuzzyFileSearchResult> }
  | { type: "fuzzySearch/completed"; sessionId: string }
  | { type: "banner/pushed"; banner: UiBanner }
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
  mcpServerStatuses: [],
  authStatus: "unknown",
  authMode: null,
  account: null,
  rateLimits: null,
  authLogin: { loginId: null, authUrl: null, pending: false, error: null },
  tokenRefresh: { requestId: null, previousAccountId: null, pending: false, error: null },
  realtimeByThreadId: {},
  fuzzySearchSessionsById: {},
  banners: [],
  initialized: false,
  retryScheduledAt: null,
  inputText: "",
  bootstrapBusy: false,
};
