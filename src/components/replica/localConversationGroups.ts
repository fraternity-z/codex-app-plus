import type { ThreadSummary } from "../../domain/types";
import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  ContextCompactionEntry,
  ConversationMessage,
  DynamicToolCallEntry,
  FileChangeEntry,
  FuzzySearchEntry,
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
  TokenUsageEntry,
  TurnDiffSnapshotEntry,
  TurnPlanSnapshotEntry,
  WebSearchEntry,
} from "../../domain/timeline";

const DONE_STATUS = "done";
const STREAMING_STATUS = "streaming";
const REASONING_LABEL = "Reasoning";
const MESSAGE_BREAK = "\n\n";

export type TraceEntry = CommandExecutionEntry | FileChangeEntry | McpToolCallEntry | DynamicToolCallEntry | CollabAgentToolCallEntry | WebSearchEntry | ImageViewEntry;
export type RequestBlock = PendingApprovalEntry | PendingUserInputEntry | PendingToolCallEntry | PendingTokenRefreshEntry;
export type AuxiliaryBlock = PlanEntry | TurnPlanSnapshotEntry | TurnDiffSnapshotEntry | ReviewModeEntry | ContextCompactionEntry | RawResponseEntry | SystemNoticeEntry | TokenUsageEntry | RealtimeSessionEntry | RealtimeAudioEntry | FuzzySearchEntry;

export interface ReasoningBlock {
  readonly id: string;
  readonly label: string;
  readonly summary: string | null;
}

export interface AssistantRenderMessage {
  readonly message: ConversationMessage;
  readonly showThinkingIndicator: boolean;
}

export interface ConversationRenderGroup {
  readonly key: string;
  readonly turnId: string | null;
  readonly userBubble: ConversationMessage | null;
  readonly reasoningBlock: ReasoningBlock | null;
  readonly traceItems: ReadonlyArray<TraceEntry>;
  readonly requestBlock: RequestBlock | null;
  readonly auxiliaryBlocks: ReadonlyArray<AuxiliaryBlock>;
  readonly assistantMessage: AssistantRenderMessage | null;
}

export type ConversationRenderNode =
  | { readonly key: string; readonly kind: "userBubble"; readonly message: ConversationMessage }
  | { readonly key: string; readonly kind: "reasoningBlock"; readonly block: ReasoningBlock }
  | { readonly key: string; readonly kind: "traceItem"; readonly item: TraceEntry }
  | { readonly key: string; readonly kind: "requestBlock"; readonly entry: RequestBlock }
  | { readonly key: string; readonly kind: "auxiliaryBlock"; readonly entry: AuxiliaryBlock }
  | { readonly key: string; readonly kind: "assistantMessage"; readonly message: ConversationMessage; readonly showThinkingIndicator: boolean };

export function splitActivitiesIntoRenderGroups(entries: ReadonlyArray<TimelineEntry>, selectedThread: ThreadSummary | null): Array<ConversationRenderGroup> {
  const visibleEntries = entries.filter(isVisibleEntry);
  const turnGroups = groupActivitiesByTurn(visibleEntries);
  return turnGroups.map((group, index) => buildConversationRenderGroup(group, index === turnGroups.length - 1 && selectedThread?.status === "active"));
}

export function flattenConversationRenderGroup(group: ConversationRenderGroup): Array<ConversationRenderNode> {
  const nodes: Array<ConversationRenderNode> = [];
  pushMessageNode(nodes, "userBubble", group.userBubble);
  pushReasoningNode(nodes, group.reasoningBlock);
  pushTraceNodes(nodes, group.traceItems);
  pushRequestNode(nodes, group.requestBlock);
  pushAuxiliaryNodes(nodes, group.auxiliaryBlocks);
  pushAssistantNode(nodes, group.assistantMessage);
  return nodes;
}

function pushMessageNode(nodes: Array<ConversationRenderNode>, kind: "userBubble", message: ConversationMessage | null): void {
  if (message !== null) {
    nodes.push({ key: message.id, kind, message });
  }
}

function pushReasoningNode(nodes: Array<ConversationRenderNode>, block: ReasoningBlock | null): void {
  if (block !== null) {
    nodes.push({ key: block.id, kind: "reasoningBlock", block });
  }
}

function pushAssistantNode(nodes: Array<ConversationRenderNode>, assistantMessage: AssistantRenderMessage | null): void {
  if (assistantMessage !== null) {
    nodes.push({
      key: assistantMessage.message.id,
      kind: "assistantMessage",
      message: assistantMessage.message,
      showThinkingIndicator: assistantMessage.showThinkingIndicator,
    });
  }
}

function pushTraceNodes(nodes: Array<ConversationRenderNode>, traceItems: ReadonlyArray<TraceEntry>): void {
  traceItems.forEach((item) => nodes.push({ key: item.id, kind: "traceItem", item }));
}

function pushRequestNode(nodes: Array<ConversationRenderNode>, entry: RequestBlock | null): void {
  if (entry !== null) {
    nodes.push({ key: entry.id, kind: "requestBlock", entry });
  }
}

function pushAuxiliaryNodes(nodes: Array<ConversationRenderNode>, auxiliaryBlocks: ReadonlyArray<AuxiliaryBlock>): void {
  auxiliaryBlocks.forEach((entry) => nodes.push({ key: entry.id, kind: "auxiliaryBlock", entry }));
}

function isVisibleEntry(entry: TimelineEntry): boolean {
  return entry.kind !== "queuedFollowUp" && entry.kind !== "debug";
}

function groupActivitiesByTurn(entries: ReadonlyArray<TimelineEntry>): Array<Array<TimelineEntry>> {
  const groups: Array<Array<TimelineEntry>> = [];
  let current: Array<TimelineEntry> = [];
  let currentTurnId: string | null | undefined;
  for (const entry of entries) {
    if (current.length === 0) {
      current = [entry];
      currentTurnId = entry.turnId;
      continue;
    }
    if (entry.turnId === currentTurnId) {
      current.push(entry);
      continue;
    }
    groups.push(current);
    current = [entry];
    currentTurnId = entry.turnId;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function buildConversationRenderGroup(items: ReadonlyArray<TimelineEntry>, activeTurn: boolean): ConversationRenderGroup {
  const threadId = items[0]?.threadId ?? "thread";
  const turnId = items[0]?.turnId ?? null;
  const userMessages = items.filter(isUserMessage);
  const assistantMessages = items.filter(isAssistantMessage);
  const reasoningEntries = items.filter(isReasoningEntry);
  const traceItems = items.filter(isTraceEntry);
  const requestBlock = findRequestBlock(items);
  const showThinkingIndicator = shouldShowThinkingIndicator(activeTurn, userMessages, requestBlock);
  return {
    key: turnId ?? `group-${items[0]?.id ?? "empty"}`,
    turnId,
    userBubble: mergeMessages(userMessages),
    reasoningBlock: createReasoningBlock(turnId, reasoningEntries),
    traceItems,
    requestBlock,
    auxiliaryBlocks: items.filter(isAuxiliaryBlock),
    assistantMessage: createAssistantRenderMessage({ threadId, turnId, assistantMessages, showThinkingIndicator }),
  };
}

function isUserMessage(entry: TimelineEntry): entry is ConversationMessage {
  return entry.kind === "userMessage";
}

function isAssistantMessage(entry: TimelineEntry): entry is ConversationMessage {
  return entry.kind === "agentMessage";
}

function isReasoningEntry(entry: TimelineEntry): entry is ReasoningEntry {
  return entry.kind === "reasoning";
}

function isTraceEntry(entry: TimelineEntry): entry is TraceEntry {
  return entry.kind === "commandExecution" || entry.kind === "fileChange" || entry.kind === "mcpToolCall" || entry.kind === "dynamicToolCall" || entry.kind === "collabAgentToolCall" || entry.kind === "webSearch" || entry.kind === "imageView";
}

function isAuxiliaryBlock(entry: TimelineEntry): entry is AuxiliaryBlock {
  return entry.kind === "plan" || entry.kind === "turnPlanSnapshot" || entry.kind === "turnDiffSnapshot" || entry.kind === "reviewMode" || entry.kind === "contextCompaction" || entry.kind === "rawResponse" || entry.kind === "systemNotice" || entry.kind === "tokenUsage" || entry.kind === "realtimeSession" || entry.kind === "realtimeAudio" || entry.kind === "fuzzySearch";
}

function findRequestBlock(items: ReadonlyArray<TimelineEntry>): RequestBlock | null {
  return [...items].reverse().find(isRequestBlock) ?? null;
}

function isRequestBlock(entry: TimelineEntry): entry is RequestBlock {
  return entry.kind === "pendingApproval" || entry.kind === "pendingUserInput" || entry.kind === "pendingToolCall" || entry.kind === "pendingTokenRefresh";
}

function mergeMessages(messages: ReadonlyArray<ConversationMessage>): ConversationMessage | null {
  if (messages.length === 0) {
    return null;
  }
  const first = messages[0];
  return {
    ...first,
    id: messages.map((message) => message.id).join("|"),
    text: messages.map((message) => message.text).join(MESSAGE_BREAK),
    status: messages.some((message) => message.status === STREAMING_STATUS) ? STREAMING_STATUS : DONE_STATUS,
    attachments: messages.flatMap((message) => message.attachments ?? []),
  };
}

function createReasoningBlock(turnId: string | null, reasoningEntries: ReadonlyArray<ReasoningEntry>): ReasoningBlock | null {
  if (reasoningEntries.length === 0) {
    return null;
  }
  return {
    id: `${turnId ?? "turn"}:reasoning`,
    label: REASONING_LABEL,
    summary: reasoningEntries.flatMap((entry) => entry.summary).map((item) => item.trim()).filter(Boolean).join("\n") || null,
  };
}

function shouldShowThinkingIndicator(
  activeTurn: boolean,
  userMessages: ReadonlyArray<ConversationMessage>,
  requestBlock: RequestBlock | null,
): boolean {
  return activeTurn && requestBlock === null && userMessages.length > 0;
}

function createAssistantRenderMessage(params: {
  readonly threadId: string;
  readonly turnId: string | null;
  readonly assistantMessages: ReadonlyArray<ConversationMessage>;
  readonly showThinkingIndicator: boolean;
}): AssistantRenderMessage | null {
  const assistantMessage = mergeMessages(params.assistantMessages);
  if (assistantMessage !== null) {
    return { message: assistantMessage, showThinkingIndicator: params.showThinkingIndicator };
  }
  if (!params.showThinkingIndicator) {
    return null;
  }
  return {
    message: {
      id: `${params.turnId ?? "turn"}:assistant:placeholder`,
      kind: "agentMessage",
      role: "assistant",
      threadId: params.threadId,
      turnId: params.turnId,
      itemId: null,
      text: "",
      status: STREAMING_STATUS,
    },
    showThinkingIndicator: true,
  };
}
