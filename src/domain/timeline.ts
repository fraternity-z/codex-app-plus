import type { ReasoningEffort } from "../protocol/generated/ReasoningEffort";
import type { ModeKind } from "../protocol/generated/ModeKind";
import type { CommandAction } from "../protocol/generated/v2/CommandAction";
import type { CommandExecutionApprovalDecision } from "../protocol/generated/v2/CommandExecutionApprovalDecision";
import type { CommandExecutionRequestApprovalParams } from "../protocol/generated/v2/CommandExecutionRequestApprovalParams";
import type { CommandExecutionStatus } from "../protocol/generated/v2/CommandExecutionStatus";
import type { FileChangeRequestApprovalParams } from "../protocol/generated/v2/FileChangeRequestApprovalParams";
import type { FileUpdateChange } from "../protocol/generated/v2/FileUpdateChange";
import type { McpToolCallError } from "../protocol/generated/v2/McpToolCallError";
import type { McpToolCallResult } from "../protocol/generated/v2/McpToolCallResult";
import type { McpToolCallStatus } from "../protocol/generated/v2/McpToolCallStatus";
import type { PatchApplyStatus } from "../protocol/generated/v2/PatchApplyStatus";
import type { ToolRequestUserInputParams } from "../protocol/generated/v2/ToolRequestUserInputParams";
import type { ToolRequestUserInputQuestion } from "../protocol/generated/v2/ToolRequestUserInputQuestion";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";

export type MessageStatus = "streaming" | "done";
export type ThreadRuntimeStatus = "notLoaded" | "idle" | "systemError" | "active";
export type ThreadActiveFlag = "waitingOnApproval" | "waitingOnUserInput";
export type FollowUpMode = "queue" | "steer" | "interrupt";
export type ComposerEnterBehavior = "enter" | "cmdIfMultiline";

export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly cwd: string | null;
  readonly archived: boolean;
  readonly updatedAt: string;
  readonly source?: "rpc" | "codexData";
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

export interface ConversationMessage extends TimelineBase {
  readonly kind: "userMessage" | "agentMessage";
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly status: MessageStatus;
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

export interface DebugEntry extends TimelineBase {
  readonly kind: "debug";
  readonly title: string;
  readonly payload: unknown;
}

export interface QueuedFollowUp {
  readonly id: string;
  readonly text: string;
  readonly model: string | null;
  readonly effort: ReasoningEffort | null;
  readonly planModeEnabled: boolean;
  readonly mode: FollowUpMode;
  readonly createdAt: string;
}

export interface QueuedFollowUpEntry extends TimelineBase {
  readonly kind: "queuedFollowUp";
  readonly followUp: QueuedFollowUp;
}

export interface CommandApprovalRequest {
  readonly kind: "commandApproval";
  readonly id: string;
  readonly method: "item/commandExecution/requestApproval";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: CommandExecutionRequestApprovalParams;
}

export interface FileChangeApprovalRequest {
  readonly kind: "fileApproval";
  readonly id: string;
  readonly method: "item/fileChange/requestApproval";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: FileChangeRequestApprovalParams;
}

export interface ToolRequestUserInputRequest {
  readonly kind: "userInput";
  readonly id: string;
  readonly method: "item/tool/requestUserInput";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: ToolRequestUserInputParams;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
}

export interface ToolCallRequest {
  readonly kind: "toolCall";
  readonly id: string;
  readonly method: "item/tool/call";
  readonly threadId: string | null;
  readonly turnId: string | null;
  readonly itemId: string | null;
  readonly params: unknown;
}

export interface UnknownServerRequest {
  readonly kind: "unknown";
  readonly id: string;
  readonly method: string;
  readonly threadId: string | null;
  readonly turnId: string | null;
  readonly itemId: string | null;
  readonly params: unknown;
}

export type ReceivedServerRequest =
  | CommandApprovalRequest
  | FileChangeApprovalRequest
  | ToolRequestUserInputRequest
  | ToolCallRequest
  | UnknownServerRequest;

export interface PendingApprovalEntry extends TimelineBase {
  readonly kind: "pendingApproval";
  readonly requestId: string;
  readonly request: CommandApprovalRequest | FileChangeApprovalRequest;
}

export interface PendingUserInputEntry extends TimelineBase {
  readonly kind: "pendingUserInput";
  readonly requestId: string;
  readonly request: ToolRequestUserInputRequest;
}

export type TimelineEntry =
  | ConversationMessage
  | PlanEntry
  | ReasoningEntry
  | CommandExecutionEntry
  | FileChangeEntry
  | McpToolCallEntry
  | TurnPlanSnapshotEntry
  | TurnDiffSnapshotEntry
  | PendingApprovalEntry
  | PendingUserInputEntry
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

export interface ServerRequestApprovalResolution {
  readonly kind: "commandApproval";
  readonly requestId: string;
  readonly decision: CommandExecutionApprovalDecision;
}

export interface ServerRequestFileResolution {
  readonly kind: "fileApproval";
  readonly requestId: string;
  readonly decision: "accept" | "decline";
}

export interface ServerRequestUserInputResolution {
  readonly kind: "userInput";
  readonly requestId: string;
  readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
}

export type ServerRequestResolution =
  | ServerRequestApprovalResolution
  | ServerRequestFileResolution
  | ServerRequestUserInputResolution;
