import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  ContextCompactionEntry,
  ConversationMessage,
  DebugEntry,
  DynamicToolCallEntry,
  FileChangeEntry,
  FuzzySearchEntry,
  ImageGenerationEntry,
  ImageViewEntry,
  McpToolCallEntry,
  PendingApprovalEntry,
  PendingTokenRefreshEntry,
  PendingToolCallEntry,
  PendingUserInputEntry,
  PlanEntry,
  RawResponseEntry,
  ReasoningEntry,
  RealtimeAudioEntry,
  RealtimeSessionEntry,
  ReviewModeEntry,
  SystemNoticeEntry,
  TimelineEntry,
  TurnDiffSnapshotEntry,
  TurnPlanSnapshotEntry,
  WebSearchEntry,
} from "../../../domain/timeline";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";

const REASONING_LABEL = "Reasoning";
const REASONING_TITLE_PREFIX = "**";

export type TraceEntry =
  | CommandExecutionEntry
  | FileChangeEntry
  | McpToolCallEntry
  | DynamicToolCallEntry
  | CollabAgentToolCallEntry
  | WebSearchEntry
  | ImageViewEntry
  | ImageGenerationEntry;

export type RequestBlock =
  | PendingApprovalEntry
  | PendingUserInputEntry
  | PendingToolCallEntry
  | PendingTokenRefreshEntry;

export type AuxiliaryBlock =
  | PlanEntry
  | TurnPlanSnapshotEntry
  | TurnDiffSnapshotEntry
  | ReviewModeEntry
  | ContextCompactionEntry
  | RawResponseEntry
  | SystemNoticeEntry
  | RealtimeSessionEntry
  | RealtimeAudioEntry
  | FuzzySearchEntry
  | DebugEntry;

export interface ReasoningBlock {
  readonly id: string;
  readonly titleMarkdown: string;
  readonly bodyMarkdown: string;
}

type AssistantFlowNode =
  | { readonly key: string; readonly kind: "assistantMessage"; readonly message: ConversationMessage }
  | { readonly key: string; readonly kind: "reasoningBlock"; readonly block: ReasoningBlock }
  | { readonly key: string; readonly kind: "traceItem"; readonly item: TraceEntry }
  | { readonly key: string; readonly kind: "requestBlock"; readonly entry: RequestBlock }
  | { readonly key: string; readonly kind: "auxiliaryBlock"; readonly entry: AuxiliaryBlock };

export interface ConversationRenderGroup {
  readonly key: string;
  readonly turnId: string | null;
  readonly userBubble: ConversationMessage | null;
  readonly assistantFlow: ReadonlyArray<AssistantFlowNode>;
  readonly showThinkingIndicator: boolean;
}

export type ConversationRenderNode =
  | { readonly key: string; readonly kind: "userBubble"; readonly message: ConversationMessage }
  | AssistantFlowNode;

export function splitActivitiesIntoRenderGroups(
  entries: ReadonlyArray<TimelineEntry>,
  activeTurnId: string | null,
  detailLevel: ThreadDetailLevel = "commands",
): Array<ConversationRenderGroup> {
  return groupActivitiesByTurn(entries.filter((entry) => isVisibleEntry(entry, detailLevel)))
    .map((group) => buildConversationRenderGroup(group, group[0]?.turnId === activeTurnId))
    .filter((group) => group.userBubble !== null || group.assistantFlow.length > 0);
}

export function flattenConversationRenderGroup(group: ConversationRenderGroup): Array<ConversationRenderNode> {
  const nodes = group.assistantFlow.map<ConversationRenderNode>((node) => node);
  return group.userBubble === null ? nodes : [{ key: group.userBubble.id, kind: "userBubble", message: group.userBubble }, ...nodes];
}

function isVisibleEntry(entry: TimelineEntry, detailLevel: ThreadDetailLevel): boolean {
  if (entry.kind === "queuedFollowUp") {
    return false;
  }
  if (detailLevel === "full") {
    return true;
  }
  if (detailLevel === "commands") {
    return entry.kind !== "rawResponse" && entry.kind !== "debug";
  }
  return isCompactVisibleEntry(entry);
}

function isCompactVisibleEntry(entry: TimelineEntry): boolean {
  if (entry.kind === "systemNotice") {
    return entry.level === "warning" || entry.level === "error";
  }
  return entry.kind === "userMessage"
    || entry.kind === "agentMessage"
    || entry.kind === "plan"
    || entry.kind === "turnPlanSnapshot"
    || entry.kind === "pendingApproval"
    || entry.kind === "pendingUserInput"
    || entry.kind === "pendingToolCall"
    || entry.kind === "pendingTokenRefresh";
}

function groupActivitiesByTurn(entries: ReadonlyArray<TimelineEntry>): Array<Array<TimelineEntry>> {
  const groups: Array<Array<TimelineEntry>> = [];
  let currentGroup: Array<TimelineEntry> = [];
  let currentTurnId: string | null | undefined;

  for (const entry of entries) {
    if (currentGroup.length === 0 || entry.turnId === currentTurnId) {
      currentGroup.push(entry);
      currentTurnId = entry.turnId;
      continue;
    }
    groups.push(currentGroup);
    currentGroup = [entry];
    currentTurnId = entry.turnId;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

function buildConversationRenderGroup(items: ReadonlyArray<TimelineEntry>, activeTurn: boolean): ConversationRenderGroup {
  const turnId = items[0]?.turnId ?? null;
  const userBubble = items.find(isUserMessage) ?? null;
  const assistantFlow = createAssistantFlow(items);
  return {
    key: turnId ?? `group-${items[0]?.id ?? "empty"}`,
    turnId,
    userBubble,
    assistantFlow,
    showThinkingIndicator: shouldShowThinkingIndicator(activeTurn, userBubble, assistantFlow),
  };
}

function createAssistantFlow(items: ReadonlyArray<TimelineEntry>): Array<AssistantFlowNode> {
  return items.flatMap((entry) => mapAssistantFlowNode(entry));
}

function mapAssistantFlowNode(entry: TimelineEntry): Array<AssistantFlowNode> {
  if (isUserMessage(entry)) {
    return [];
  }
  if (isAssistantMessage(entry)) {
    return [{ key: entry.id, kind: "assistantMessage", message: entry }];
  }
  if (isReasoningEntry(entry)) {
    const reasoningBlock = createReasoningBlock(entry);
    return reasoningBlock === null ? [] : [{ key: entry.id, kind: "reasoningBlock", block: reasoningBlock }];
  }
  if (isTraceEntry(entry)) {
    return [{ key: entry.id, kind: "traceItem", item: entry }];
  }
  if (isRequestBlock(entry)) {
    return [{ key: entry.id, kind: "requestBlock", entry }];
  }
  if (isAuxiliaryBlock(entry)) {
    return [{ key: entry.id, kind: "auxiliaryBlock", entry }];
  }
  return [];
}

function createReasoningBlock(entry: ReasoningEntry): ReasoningBlock | null {
  const summaryBlocks = normalizeReasoningBlocks(entry.summary);
  const contentBlocks = normalizeReasoningBlocks(entry.content);
  if (summaryBlocks.length === 0 && contentBlocks.length === 0) {
    return null;
  }
  const splitSummary = splitReasoningSummary(summaryBlocks);
  const bodyMarkdown = dedupeReasoningBlocks([splitSummary.bodyMarkdown, ...contentBlocks]).join("\n\n");
  return {
    id: entry.id,
    titleMarkdown: splitSummary.titleMarkdown,
    bodyMarkdown,
  };
}

function normalizeReasoningBlocks(items: ReadonlyArray<string>): Array<string> {
  return items.map((item) => item.trim()).filter(Boolean);
}
function splitReasoningSummary(summaryBlocks: ReadonlyArray<string>): { titleMarkdown: string; bodyMarkdown: string } {
  const firstBlock = summaryBlocks[0];
  if (!firstBlock) {
    return { titleMarkdown: createDefaultReasoningTitle(), bodyMarkdown: "" };
  }
  const lines = firstBlock.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.trim().length > 0);
  const titleLine = titleIndex < 0 ? null : lines[titleIndex].trim();
  if (titleLine === null || !isReasoningTitleLine(titleLine)) {
    return { titleMarkdown: createDefaultReasoningTitle(), bodyMarkdown: summaryBlocks.join("\n\n") };
  }
  const remainingFirstBlock = lines.filter((_, index) => index !== titleIndex).join("\n").trim();
  const bodyBlocks = [remainingFirstBlock, ...summaryBlocks.slice(1)].filter(Boolean);
  return { titleMarkdown: titleLine, bodyMarkdown: bodyBlocks.join("\n\n") };
}
function dedupeReasoningBlocks(blocks: ReadonlyArray<string>): Array<string> {
  const seen = new Set<string>();
  const uniqueBlocks: Array<string> = [];
  for (const block of blocks) {
    const normalizedBlock = block.trim();
    if (normalizedBlock.length === 0) {
      continue;
    }
    const dedupeKey = normalizedBlock.replace(/\s+/g, " ");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    uniqueBlocks.push(normalizedBlock);
  }
  return uniqueBlocks;
}
function createDefaultReasoningTitle(): string {
  return `${REASONING_TITLE_PREFIX}${REASONING_LABEL}${REASONING_TITLE_PREFIX}`;
}
function isReasoningTitleLine(line: string): boolean {
  return line.startsWith(REASONING_TITLE_PREFIX)
    && line.endsWith(REASONING_TITLE_PREFIX)
    && line.length > REASONING_TITLE_PREFIX.length * 2;
}

function shouldShowThinkingIndicator(
  activeTurn: boolean,
  userBubble: ConversationMessage | null,
  nodes: ReadonlyArray<AssistantFlowNode>,
): boolean {
  return activeTurn && userBubble !== null && nodes.every((node) => node.kind !== "requestBlock");
}

function isUserMessage(entry: TimelineEntry): entry is ConversationMessage & { kind: "userMessage"; role: "user" } {
  return entry.kind === "userMessage";
}

function isAssistantMessage(entry: TimelineEntry): entry is ConversationMessage & { kind: "agentMessage"; role: "assistant" } {
  return entry.kind === "agentMessage";
}

function isReasoningEntry(entry: TimelineEntry): entry is ReasoningEntry {
  return entry.kind === "reasoning";
}

function isTraceEntry(entry: TimelineEntry): entry is TraceEntry {
  return entry.kind === "commandExecution"
    || entry.kind === "fileChange"
    || entry.kind === "mcpToolCall"
    || entry.kind === "dynamicToolCall"
    || entry.kind === "collabAgentToolCall"
    || entry.kind === "webSearch"
    || entry.kind === "imageView"
    || entry.kind === "imageGeneration";
}

function isRequestBlock(entry: TimelineEntry): entry is RequestBlock {
  return entry.kind === "pendingApproval"
    || entry.kind === "pendingUserInput"
    || entry.kind === "pendingToolCall"
    || entry.kind === "pendingTokenRefresh";
}

function isAuxiliaryBlock(entry: TimelineEntry): entry is AuxiliaryBlock {
  return entry.kind === "plan"
    || entry.kind === "turnPlanSnapshot"
    || entry.kind === "turnDiffSnapshot"
    || entry.kind === "reviewMode"
    || entry.kind === "contextCompaction"
    || entry.kind === "rawResponse"
    || entry.kind === "systemNotice"
    || entry.kind === "realtimeSession"
    || entry.kind === "realtimeAudio"
    || entry.kind === "fuzzySearch"
    || entry.kind === "debug";
}
