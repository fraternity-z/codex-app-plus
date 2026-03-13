import type { AgentEnvironment } from "../bridge/types";
import type { ComposerPermissionLevel } from "../features/composer/model/composerPermission";
import type { ReasoningEffort } from "../protocol/generated/ReasoningEffort";
import type { ServiceTier } from "../protocol/generated/ServiceTier";
import type { Tool } from "../protocol/generated/Tool";
import type { ModeKind } from "../protocol/generated/ModeKind";
import type { MessagePhase } from "../protocol/generated/MessagePhase";
import type { FuzzyFileSearchResult } from "../protocol/generated/FuzzyFileSearchResult";
import type { ThreadRealtimeAudioChunk } from "../protocol/generated/v2/ThreadRealtimeAudioChunk";
import type { CollabAgentState } from "../protocol/generated/v2/CollabAgentState";
import type { CollabAgentTool } from "../protocol/generated/v2/CollabAgentTool";
import type { CollabAgentToolCallStatus } from "../protocol/generated/v2/CollabAgentToolCallStatus";
import type { CommandAction } from "../protocol/generated/v2/CommandAction";
import type { CommandExecutionStatus } from "../protocol/generated/v2/CommandExecutionStatus";
import type { DynamicToolCallOutputContentItem } from "../protocol/generated/v2/DynamicToolCallOutputContentItem";
import type { DynamicToolCallStatus } from "../protocol/generated/v2/DynamicToolCallStatus";
import type { FileUpdateChange } from "../protocol/generated/v2/FileUpdateChange";
import type { McpToolCallError } from "../protocol/generated/v2/McpToolCallError";
import type { McpToolCallResult } from "../protocol/generated/v2/McpToolCallResult";
import type { McpToolCallStatus } from "../protocol/generated/v2/McpToolCallStatus";
import type { PatchApplyStatus } from "../protocol/generated/v2/PatchApplyStatus";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type { WebSearchAction } from "../protocol/generated/v2/WebSearchAction";
import type {
  CommandApprovalRequest,
  FileChangeApprovalRequest,
  LegacyExecCommandApprovalRequest,
  LegacyPatchApprovalRequest,
  TokenRefreshRequest,
  ToolCallRequest,
  ToolRequestUserInputRequest,
} from "./serverRequests";
export type MessageStatus = "streaming" | "done";
export type ThreadRuntimeStatus = "notLoaded" | "idle" | "systemError" | "active";
export type ThreadActiveFlag = "waitingOnApproval" | "waitingOnUserInput";
export type CollaborationPreset = "default" | "plan";
export type FollowUpMode = "queue" | "steer" | "interrupt";
export type ComposerEnterBehavior = "enter" | "cmdIfMultiline";
export type NoticeLevel = "info" | "warning" | "error";
export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly branch: string | null;
  readonly cwd: string | null;
  readonly archived: boolean;
  readonly updatedAt: string;
  readonly source?: "rpc" | "codexData";
  readonly agentEnvironment: AgentEnvironment;
  readonly status: ThreadRuntimeStatus;
  readonly activeFlags: Array<ThreadActiveFlag>;
  readonly queuedCount: number;
}
interface TimelineBase {
  readonly id: string;
  readonly threadId: string;
  readonly turnId: string | null;
  readonly itemId: string | null;
}
export interface ConversationImageAttachment {
  readonly kind: "image";
  readonly source: "url" | "localPath" | "dataUrl";
  readonly value: string;
}

export interface ConversationFileAttachment {
  readonly kind: "file";
  readonly source: "mention";
  readonly value: string;
  readonly name: string;
}

export type ConversationAttachment = ConversationImageAttachment | ConversationFileAttachment;

export interface ComposerAttachment {
  readonly id: string;
  readonly kind: "image" | "file";
  readonly source: "localImage" | "dataUrl" | "mention";
  readonly value: string;
  readonly name: string;
}

export interface ConversationMessage extends TimelineBase {
  readonly kind: "userMessage" | "agentMessage";
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly status: MessageStatus;
  readonly attachments?: ReadonlyArray<ConversationAttachment>;
}
export interface PlanEntry extends TimelineBase {
  readonly kind: "plan";
  readonly text: string;
  readonly status: MessageStatus;
}
export interface ReasoningEntry extends TimelineBase {
  readonly kind: "reasoning";
  readonly summary: ReadonlyArray<string>;
  readonly content: ReadonlyArray<string>;
}
export interface CommandExecutionEntry extends TimelineBase {
  readonly kind: "commandExecution";
  readonly command: string;
  readonly cwd: string;
  readonly processId: string | null;
  readonly status: CommandExecutionStatus;
  readonly commandActions: ReadonlyArray<CommandAction>;
  readonly output: string;
  readonly exitCode: number | null;
  readonly durationMs: number | null;
  readonly terminalInteractions: ReadonlyArray<string>;
  readonly approvalRequestId: string | null;
}
export interface FileChangeEntry extends TimelineBase {
  readonly kind: "fileChange";
  readonly changes: ReadonlyArray<FileUpdateChange>;
  readonly status: PatchApplyStatus;
  readonly output: string;
  readonly approvalRequestId: string | null;
}
export interface McpToolCallEntry extends TimelineBase {
  readonly kind: "mcpToolCall";
  readonly server: string;
  readonly tool: string;
  readonly status: McpToolCallStatus;
  readonly arguments: unknown;
  readonly result: McpToolCallResult | null;
  readonly error: McpToolCallError | null;
  readonly durationMs: number | null;
  readonly progress: ReadonlyArray<string>;
}
export interface DynamicToolCallEntry extends TimelineBase {
  readonly kind: "dynamicToolCall";
  readonly tool: string;
  readonly arguments: unknown;
  readonly status: DynamicToolCallStatus;
  readonly contentItems: ReadonlyArray<DynamicToolCallOutputContentItem>;
  readonly success: boolean | null;
  readonly durationMs: number | null;
}
export interface CollabAgentToolCallEntry extends TimelineBase {
  readonly kind: "collabAgentToolCall";
  readonly tool: CollabAgentTool;
  readonly status: CollabAgentToolCallStatus;
  readonly senderThreadId: string;
  readonly receiverThreadIds: ReadonlyArray<string>;
  readonly prompt: string | null;
  readonly agentsStates: Readonly<Record<string, CollabAgentState>>;
}
export interface WebSearchEntry extends TimelineBase {
  readonly kind: "webSearch";
  readonly query: string;
  readonly action: WebSearchAction | null;
}
export interface ImageViewEntry extends TimelineBase {
  readonly kind: "imageView";
  readonly path: string;
}
export interface TurnPlanSnapshotEntry extends TimelineBase {
  readonly kind: "turnPlanSnapshot";
  readonly explanation: string | null;
  readonly plan: ReadonlyArray<TurnPlanStep>;
}
export interface TurnDiffSnapshotEntry extends TimelineBase {
  readonly kind: "turnDiffSnapshot";
  readonly diff: string;
}
export interface ReviewModeEntry extends TimelineBase {
  readonly kind: "reviewMode";
  readonly state: "entered" | "exited";
  readonly review: string;
}
export interface ContextCompactionEntry extends TimelineBase {
  readonly kind: "contextCompaction";
}
export interface RawResponseEntry extends TimelineBase {
  readonly kind: "rawResponse";
  readonly responseType: string;
  readonly title: string;
  readonly detail: string | null;
  readonly phase: MessagePhase | null;
  readonly payload: unknown;
}
export interface SystemNoticeEntry extends TimelineBase {
  readonly kind: "systemNotice";
  readonly level: NoticeLevel;
  readonly title: string;
  readonly detail: string | null;
  readonly source: string;
}
export interface RealtimeSessionEntry extends TimelineBase {
  readonly kind: "realtimeSession";
  readonly sessionId: string | null;
  readonly status: "started" | "error" | "closed";
  readonly message: string | null;
}
export interface RealtimeAudioEntry extends TimelineBase {
  readonly kind: "realtimeAudio";
  readonly chunkIndex: number;
  readonly audio: ThreadRealtimeAudioChunk;
}
export interface FuzzySearchEntry extends TimelineBase {
  readonly kind: "fuzzySearch";
  readonly sessionId: string;
  readonly query: string;
  readonly status: "updating" | "completed";
  readonly files: ReadonlyArray<FuzzyFileSearchResult>;
}
export interface DebugEntry extends TimelineBase {
  readonly kind: "debug";
  readonly title: string;
  readonly payload: unknown;
}
export interface QueuedFollowUp {
  readonly id: string;
  readonly text: string;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly model: string | null;
  readonly effort: ReasoningEffort | null;
  readonly serviceTier: ServiceTier | null;
  readonly permissionLevel: ComposerPermissionLevel;
  readonly collaborationPreset: CollaborationPreset;
  readonly mode: FollowUpMode;
  readonly createdAt: string;
}
export interface QueuedFollowUpEntry extends TimelineBase {
  readonly kind: "queuedFollowUp";
  readonly followUp: QueuedFollowUp;
}
export interface PendingApprovalEntry extends TimelineBase {
  readonly kind: "pendingApproval";
  readonly requestId: string;
  readonly request:
    | CommandApprovalRequest
    | FileChangeApprovalRequest
    | LegacyPatchApprovalRequest
    | LegacyExecCommandApprovalRequest;
}
export interface PendingUserInputEntry extends TimelineBase {
  readonly kind: "pendingUserInput";
  readonly requestId: string;
  readonly request: ToolRequestUserInputRequest;
}
export interface PendingToolCallEntry extends TimelineBase {
  readonly kind: "pendingToolCall";
  readonly requestId: string;
  readonly request: ToolCallRequest;
}
export interface PendingTokenRefreshEntry extends TimelineBase {
  readonly kind: "pendingTokenRefresh";
  readonly requestId: string;
  readonly request: TokenRefreshRequest;
}
export type TimelineEntry =
  | ConversationMessage
  | PlanEntry
  | ReasoningEntry
  | CommandExecutionEntry
  | FileChangeEntry
  | McpToolCallEntry
  | DynamicToolCallEntry
  | CollabAgentToolCallEntry
  | WebSearchEntry
  | ImageViewEntry
  | TurnPlanSnapshotEntry
  | TurnDiffSnapshotEntry
  | ReviewModeEntry
  | ContextCompactionEntry
  | RawResponseEntry
  | SystemNoticeEntry
  | RealtimeSessionEntry
  | RealtimeAudioEntry
  | FuzzySearchEntry
  | PendingApprovalEntry
  | PendingUserInputEntry
  | PendingToolCallEntry
  | PendingTokenRefreshEntry
  | QueuedFollowUpEntry
  | DebugEntry;
export interface ThreadRuntime {
  threadId: string;
  status: ThreadRuntimeStatus;
  activeFlags: Array<ThreadActiveFlag>;
  activeTurnId: string | null;
  interruptRequestedTurnId: string | null;
  queuedFollowUps: Array<QueuedFollowUp>;
  turnPlan: TurnPlanSnapshotEntry | null;
  turnDiff: TurnDiffSnapshotEntry | null;
}
export interface CollaborationModePreset {
  readonly name: string;
  readonly mode: ModeKind | null;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}
export interface McpShortcut {
  readonly id: string;
  readonly server: string;
  readonly tool: Tool;
}
