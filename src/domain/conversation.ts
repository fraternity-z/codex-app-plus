import type { ReasoningEffort } from "../protocol/generated/ReasoningEffort";
import type { ResponseItem } from "../protocol/generated/ResponseItem";
import type { CollaborationMode } from "../protocol/generated/CollaborationMode";
import type { ThreadItem } from "../protocol/generated/v2/ThreadItem";
import type { ThreadTokenUsage } from "../protocol/generated/v2/ThreadTokenUsage";
import type { TurnError } from "../protocol/generated/v2/TurnError";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type { TurnStatus } from "../protocol/generated/v2/TurnStatus";
import type { UserInput } from "../protocol/generated/v2/UserInput";
import type { NoticeLevel } from "./timeline";
import type { QueuedFollowUp, ThreadActiveFlag, ThreadRuntimeStatus } from "./timeline";

export interface ConversationTurnParams {
  input: Array<UserInput>;
  cwd: string | null;
  model: string | null;
  effort: ReasoningEffort | null;
  collaborationMode: CollaborationMode | null;
}

export interface ConversationItemState {
  item: ThreadItem;
  approvalRequestId: string | null;
  outputText: string;
  terminalInteractions: Array<string>;
  rawResponse: ResponseItem | null;
  progressMessages: Array<string>;
}

export interface ConversationSystemNotice {
  readonly id: string;
  readonly itemId: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly level: NoticeLevel;
  readonly source: string;
}

export interface ConversationReviewState {
  readonly id: string;
  readonly itemId: string;
  readonly state: "entered" | "exited";
  readonly review: string;
}

export interface ConversationContextCompaction {
  readonly id: string;
  readonly itemId: string | null;
}

export interface ConversationTurnState {
  localId: string;
  turnId: string | null;
  status: TurnStatus;
  error: TurnError | null;
  params: ConversationTurnParams | null;
  items: Array<ConversationItemState>;
  turnStartedAtMs: number | null;
  planExplanation: string | null;
  planSteps: Array<TurnPlanStep>;
  diff: string | null;
  rawResponses: Array<ResponseItem>;
  notices: Array<ConversationSystemNotice>;
  reviewStates: Array<ConversationReviewState>;
  contextCompactions: Array<ConversationContextCompaction>;
  tokenUsage: ThreadTokenUsage | null;
}

export type ConversationResumeState = "needs_resume" | "resuming" | "resumed";

export interface ConversationState {
  id: string;
  title: string | null;
  cwd: string | null;
  updatedAt: string;
  source: unknown;
  status: ThreadRuntimeStatus;
  activeFlags: Array<ThreadActiveFlag>;
  resumeState: ConversationResumeState;
  turns: Array<ConversationTurnState>;
  queuedFollowUps: Array<QueuedFollowUp>;
  interruptRequestedTurnId: string | null;
  hidden: boolean;
}

export interface DraftConversationState {
  workspacePath: string | null;
  createdAt: string;
}

export type TextDeltaTarget =
  | { type: "agentMessage" }
  | { type: "plan" }
  | { type: "reasoningSummary"; summaryIndex: number }
  | { type: "reasoningContent"; contentIndex: number };

export interface ConversationTextDelta {
  conversationId: string;
  turnId: string | null;
  itemId: string;
  target: TextDeltaTarget;
  delta: string;
}

export interface ConversationOutputDelta {
  conversationId: string;
  turnId: string | null;
  itemId: string;
  delta: string;
  target: "commandExecution" | "fileChange";
}
