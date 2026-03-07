import type { ThreadSummary } from "../../domain/types";
import type {
  CommandExecutionEntry,
  ConversationMessage,
  FileChangeEntry,
  McpToolCallEntry,
  PendingApprovalEntry,
  PendingUserInputEntry,
  PlanEntry,
  ReasoningEntry,
  TimelineEntry,
  TurnDiffSnapshotEntry,
} from "../../domain/timeline";

const DONE_STATUS = "done";
const THINKING_LABEL = "正在思考";
const PROCESSING_LABEL = "正在处理";
const REASONING_LABEL = "思考摘要";
const MESSAGE_BREAK = "\n\n";

export type TraceEntry = CommandExecutionEntry | FileChangeEntry | McpToolCallEntry;
export type RequestBlock = PendingApprovalEntry | PendingUserInputEntry;
export type AuxiliaryBlock = PlanEntry | TurnDiffSnapshotEntry;

export interface ThinkingBlock {
  readonly id: string;
  readonly kind: "placeholder" | "processing" | "reasoning";
  readonly label: string;
  readonly summary: string | null;
}

export interface ConversationRenderGroup {
  readonly key: string;
  readonly turnId: string | null;
  readonly userBubble: ConversationMessage | null;
  readonly thinkingBlock: ThinkingBlock | null;
  readonly traceItems: ReadonlyArray<TraceEntry>;
  readonly requestBlock: RequestBlock | null;
  readonly auxiliaryBlocks: ReadonlyArray<AuxiliaryBlock>;
  readonly assistantMessage: ConversationMessage | null;
}

export type ConversationRenderNode =
  | { readonly key: string; readonly kind: "userBubble"; readonly message: ConversationMessage }
  | { readonly key: string; readonly kind: "thinkingBlock"; readonly block: ThinkingBlock }
  | { readonly key: string; readonly kind: "traceItem"; readonly item: TraceEntry }
  | { readonly key: string; readonly kind: "requestBlock"; readonly entry: RequestBlock }
  | { readonly key: string; readonly kind: "auxiliaryBlock"; readonly entry: AuxiliaryBlock }
  | { readonly key: string; readonly kind: "assistantMessage"; readonly message: ConversationMessage };

export function splitActivitiesIntoRenderGroups(
  entries: ReadonlyArray<TimelineEntry>,
  selectedThread: ThreadSummary | null,
): Array<ConversationRenderGroup> {
  const visibleEntries = entries.filter(isVisibleEntry);
  const turnGroups = groupActivitiesByTurn(visibleEntries);
  return turnGroups.map((group, index) =>
    buildConversationRenderGroup(group, index === turnGroups.length - 1 && selectedThread?.status === "active"),
  );
}

export function flattenConversationRenderGroup(
  group: ConversationRenderGroup,
): Array<ConversationRenderNode> {
  const nodes: Array<ConversationRenderNode> = [];
  pushMessageNode(nodes, "userBubble", group.userBubble);
  pushThinkingNode(nodes, group.thinkingBlock);
  pushTraceNodes(nodes, group.traceItems);
  pushRequestNode(nodes, group.requestBlock);
  pushAuxiliaryNodes(nodes, group.auxiliaryBlocks);
  pushMessageNode(nodes, "assistantMessage", group.assistantMessage);
  return nodes;
}

function pushMessageNode(
  nodes: Array<ConversationRenderNode>,
  kind: "userBubble" | "assistantMessage",
  message: ConversationMessage | null,
): void {
  if (message === null) {
    return;
  }
  nodes.push({ key: message.id, kind, message });
}

function pushThinkingNode(
  nodes: Array<ConversationRenderNode>,
  block: ThinkingBlock | null,
): void {
  if (block !== null) {
    nodes.push({ key: block.id, kind: "thinkingBlock", block });
  }
}

function pushTraceNodes(
  nodes: Array<ConversationRenderNode>,
  traceItems: ReadonlyArray<TraceEntry>,
): void {
  traceItems.forEach((item) => nodes.push({ key: item.id, kind: "traceItem", item }));
}

function pushRequestNode(
  nodes: Array<ConversationRenderNode>,
  entry: RequestBlock | null,
): void {
  if (entry !== null) {
    nodes.push({ key: entry.id, kind: "requestBlock", entry });
  }
}

function pushAuxiliaryNodes(
  nodes: Array<ConversationRenderNode>,
  auxiliaryBlocks: ReadonlyArray<AuxiliaryBlock>,
): void {
  auxiliaryBlocks.forEach((entry) => nodes.push({ key: entry.id, kind: "auxiliaryBlock", entry }));
}

function isVisibleEntry(entry: TimelineEntry): boolean {
  switch (entry.kind) {
    case "queuedFollowUp":
    case "debug":
    case "turnPlanSnapshot":
      return false;
    default:
      return true;
  }
}

function groupActivitiesByTurn(
  entries: ReadonlyArray<TimelineEntry>,
): Array<Array<TimelineEntry>> {
  const groups: Array<Array<TimelineEntry>> = [];
  let current: Array<TimelineEntry> = [];
  let currentTurnId: string | null | undefined;

  for (const entry of entries) {
    if (current.length === 0) {
      current = [entry];
      currentTurnId = entry.turnId;
      continue;
    }
    if (entry.turnId !== null && currentTurnId !== null && entry.turnId === currentTurnId) {
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

function buildConversationRenderGroup(
  items: ReadonlyArray<TimelineEntry>,
  activeTurn: boolean,
): ConversationRenderGroup {
  const userMessages = items.filter(isUserMessage);
  const assistantMessages = items.filter(isAssistantMessage);
  const reasoningEntries = items.filter(isReasoningEntry);
  const traceItems = items.filter(isTraceEntry);
  const requestBlock = findRequestBlock(items);
  return {
    key: items[0]?.turnId ?? `group-${items[0]?.id ?? "empty"}`,
    turnId: items[0]?.turnId ?? null,
    userBubble: mergeMessages(userMessages),
    thinkingBlock: createThinkingBlock({
      activeTurn,
      turnId: items[0]?.turnId ?? null,
      userMessages,
      assistantMessages,
      reasoningEntries,
      traceItems,
      requestBlock,
    }),
    traceItems,
    requestBlock,
    auxiliaryBlocks: items.filter(isAuxiliaryBlock),
    assistantMessage: mergeMessages(assistantMessages),
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
  return entry.kind === "commandExecution" || entry.kind === "fileChange" || entry.kind === "mcpToolCall";
}

function isAuxiliaryBlock(entry: TimelineEntry): entry is AuxiliaryBlock {
  return entry.kind === "plan" || entry.kind === "turnDiffSnapshot";
}

function findRequestBlock(items: ReadonlyArray<TimelineEntry>): RequestBlock | null {
  return [...items].reverse().find(isRequestBlock) ?? null;
}

function isRequestBlock(entry: TimelineEntry): entry is RequestBlock {
  return entry.kind === "pendingApproval" || entry.kind === "pendingUserInput";
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
    status: messages.some((message) => message.status === "streaming") ? "streaming" : DONE_STATUS,
    attachments: messages.flatMap((message) => message.attachments ?? []),
  };
}

function createThinkingBlock(params: {
  readonly activeTurn: boolean;
  readonly turnId: string | null;
  readonly userMessages: ReadonlyArray<ConversationMessage>;
  readonly assistantMessages: ReadonlyArray<ConversationMessage>;
  readonly reasoningEntries: ReadonlyArray<ReasoningEntry>;
  readonly traceItems: ReadonlyArray<TraceEntry>;
  readonly requestBlock: RequestBlock | null;
}): ThinkingBlock | null {
  if (params.reasoningEntries.length > 0) {
    return createReasoningBlock(params.turnId, params.reasoningEntries);
  }
  if (params.requestBlock !== null || !params.activeTurn || params.userMessages.length === 0) {
    return null;
  }
  if (params.assistantMessages.length > 0) {
    return null;
  }
  return params.traceItems.length > 0
    ? createProcessingBlock(params.turnId, params.traceItems)
    : createPlaceholderBlock(params.turnId);
}

function createReasoningBlock(
  turnId: string | null,
  entries: ReadonlyArray<ReasoningEntry>,
): ThinkingBlock {
  return {
    id: `${turnId ?? "turn"}:thinking:reasoning`,
    kind: "reasoning",
    label: REASONING_LABEL,
    summary: summarizeReasoning(entries),
  };
}

function summarizeReasoning(entries: ReadonlyArray<ReasoningEntry>): string | null {
  const summary = entries.flatMap((entry) => entry.summary).map((item) => item.trim()).filter(Boolean);
  return summary.length > 0 ? summary.join("\n") : null;
}

function createProcessingBlock(
  turnId: string | null,
  traceItems: ReadonlyArray<TraceEntry>,
): ThinkingBlock {
  return {
    id: `${turnId ?? "turn"}:thinking:processing`,
    kind: "processing",
    label: PROCESSING_LABEL,
    summary: summarizeProcessing(traceItems[traceItems.length - 1]),
  };
}

function summarizeProcessing(traceItem: TraceEntry): string {
  if (traceItem.kind === "commandExecution") {
    return `正在运行命令：${traceItem.command}`;
  }
  if (traceItem.kind === "mcpToolCall") {
    return `正在调用工具：${traceItem.server}/${traceItem.tool}`;
  }
  return `正在应用 ${traceItem.changes.length} 项文件变更`;
}

function createPlaceholderBlock(turnId: string | null): ThinkingBlock {
  return {
    id: `${turnId ?? "turn"}:thinking:placeholder`,
    kind: "placeholder",
    label: THINKING_LABEL,
    summary: null,
  };
}
