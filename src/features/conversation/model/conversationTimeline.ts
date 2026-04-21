import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import type {
  ConversationMessage,
  FuzzySearchSessionState,
  RealtimeState,
} from "../../../domain/types";
import type {
  PendingApprovalEntry,
  PendingTokenRefreshEntry,
  PendingToolCallEntry,
  PendingUserInputEntry,
  RawResponseEntry,
  RealtimeSessionEntry,
  TimelineEntry,
} from "../../../domain/timeline";
import type { ReceivedServerRequest } from "../../../domain/serverRequests";
import { summarizeUserInputs } from "./conversationUserInput";
import { normalizeConversationMessageText } from "./conversationMessages";

interface TimelineExtras {
  readonly realtime: RealtimeState | null;
  readonly fuzzySessions: ReadonlyArray<FuzzySearchSessionState>;
}

function createEntryId(
  conversationId: string,
  turnId: string | null,
  itemId: string | null,
  suffix: string,
): string {
  return `${conversationId}:${turnId ?? "turn"}:${itemId ?? suffix}:${suffix}`;
}

function createUserInputMessage(
  conversationId: string,
  turn: ConversationTurnState,
): ConversationMessage | null {
  const summary = summarizeUserInputs(turn.params?.input ?? []);
  if (summary.text.length === 0 && summary.attachments.length === 0) {
    return null;
  }

  return {
    id: createEntryId(conversationId, turn.turnId, "user", "user"),
    kind: "userMessage",
    role: "user",
    threadId: conversationId,
    turnId: turn.turnId,
    itemId: "user",
    text: normalizeConversationMessageText("user", summary.text),
    status: "done",
    attachments: summary.attachments,
  };
}

function mapRawResponseEntry(
  conversationId: string,
  turnId: string | null,
  index: number,
  item: import("../../../protocol/generated/ResponseItem").ResponseItem,
): RawResponseEntry {
  if (item.type === "function_call") {
    return { id: createEntryId(conversationId, turnId, item.call_id, `raw:${index}`), kind: "rawResponse", threadId: conversationId, turnId, itemId: item.call_id, responseType: item.type, title: `Function call · ${item.name}`, detail: item.arguments, phase: null, payload: item };
  }
  if (item.type === "custom_tool_call") {
    return { id: createEntryId(conversationId, turnId, item.call_id, `raw:${index}`), kind: "rawResponse", threadId: conversationId, turnId, itemId: item.call_id, responseType: item.type, title: `Custom tool · ${item.name}`, detail: item.input, phase: null, payload: item };
  }
  if (item.type === "web_search_call") {
    return { id: createEntryId(conversationId, turnId, null, `raw:${index}`), kind: "rawResponse", threadId: conversationId, turnId, itemId: null, responseType: item.type, title: "Web search call", detail: item.action ? JSON.stringify(item.action) : null, phase: null, payload: item };
  }
  if (item.type === "message") {
    return { id: createEntryId(conversationId, turnId, null, `raw:${index}`), kind: "rawResponse", threadId: conversationId, turnId, itemId: null, responseType: item.type, title: `${item.role} raw message`, detail: item.content.map((content) => JSON.stringify(content)).join("\n"), phase: item.phase ?? null, payload: item };
  }

  return { id: createEntryId(conversationId, turnId, null, `raw:${index}`), kind: "rawResponse", threadId: conversationId, turnId, itemId: null, responseType: item.type, title: `Raw response · ${item.type}`, detail: null, phase: null, payload: item };
}

function turnHasExplicitUserMessage(turn: ConversationTurnState): boolean {
  return turn.items.some(({ item }) => item.type === "userMessage");
}

function getTurnMessageStatus(turn: ConversationTurnState): "streaming" | "done" {
  return turn.status === "inProgress" ? "streaming" : "done";
}

function appendInitialUserEntry(
  entries: Array<TimelineEntry>,
  conversationId: string,
  turn: ConversationTurnState,
): void {
  if (turnHasExplicitUserMessage(turn)) {
    return;
  }

  const initialUserMessage = createUserInputMessage(conversationId, turn);
  if (initialUserMessage !== null) {
    entries.push(initialUserMessage);
  }
}

function mapMessageLikeEntry(
  conversationId: string,
  turn: ConversationTurnState,
  itemState: ConversationTurnState["items"][number],
): TimelineEntry | null {
  const { item } = itemState;
  const status = getTurnMessageStatus(turn);

  if (item.type === "userMessage") {
    const summary = summarizeUserInputs(item.content);
    return { id: createEntryId(conversationId, turn.turnId, item.id, "user"), kind: "userMessage", role: "user", threadId: conversationId, turnId: turn.turnId, itemId: item.id, text: normalizeConversationMessageText("user", summary.text), status: "done", attachments: summary.attachments };
  }
  if (item.type === "agentMessage") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "agent"), kind: "agentMessage", role: "assistant", threadId: conversationId, turnId: turn.turnId, itemId: item.id, text: normalizeConversationMessageText("assistant", item.text), status };
  }
  if (item.type === "plan") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "plan"), kind: "plan", threadId: conversationId, turnId: turn.turnId, itemId: item.id, text: item.text, status };
  }
  if (item.type === "reasoning") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "reasoning"), kind: "reasoning", threadId: conversationId, turnId: turn.turnId, itemId: item.id, summary: [...item.summary], content: [...item.content] };
  }
  if (item.type === "contextCompaction") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "contextCompaction"), kind: "contextCompaction", threadId: conversationId, turnId: turn.turnId, itemId: item.id };
  }

  return null;
}

function mapExecutionEntry(
  conversationId: string,
  turn: ConversationTurnState,
  itemState: ConversationTurnState["items"][number],
): TimelineEntry | null {
  const { item } = itemState;

  if (item.type === "commandExecution") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "command"), kind: "commandExecution", threadId: conversationId, turnId: turn.turnId, itemId: item.id, command: item.command, cwd: item.cwd, processId: item.processId, status: item.status, commandActions: [...item.commandActions], output: itemState.outputText, exitCode: item.exitCode, durationMs: item.durationMs, terminalInteractions: [...itemState.terminalInteractions], approvalRequestId: itemState.approvalRequestId };
  }
  if (item.type === "fileChange") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "fileChange"), kind: "fileChange", threadId: conversationId, turnId: turn.turnId, itemId: item.id, changes: [...item.changes], status: item.status, output: itemState.outputText, approvalRequestId: itemState.approvalRequestId };
  }

  return null;
}

function mapToolCallEntry(
  conversationId: string,
  turn: ConversationTurnState,
  itemState: ConversationTurnState["items"][number],
): TimelineEntry | null {
  const { item } = itemState;

  if (item.type === "mcpToolCall") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "mcp"), kind: "mcpToolCall", threadId: conversationId, turnId: turn.turnId, itemId: item.id, server: item.server, tool: item.tool, status: item.status, arguments: item.arguments, result: item.result, error: item.error, durationMs: item.durationMs, progress: [...itemState.progressMessages] };
  }
  if (item.type === "dynamicToolCall") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "dynamicTool"), kind: "dynamicToolCall", threadId: conversationId, turnId: turn.turnId, itemId: item.id, tool: item.tool, arguments: item.arguments, status: item.status, contentItems: [...(item.contentItems ?? [])], success: item.success, durationMs: item.durationMs };
  }
  if (item.type === "collabAgentToolCall") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "collabTool"), kind: "collabAgentToolCall", threadId: conversationId, turnId: turn.turnId, itemId: item.id, tool: item.tool, status: item.status, senderThreadId: item.senderThreadId, receiverThreadIds: [...item.receiverThreadIds], prompt: item.prompt, agentsStates: Object.fromEntries(Object.entries(item.agentsStates).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== undefined)) };
  }

  return null;
}

function mapSearchOrImageEntry(
  conversationId: string,
  turn: ConversationTurnState,
  itemState: ConversationTurnState["items"][number],
): TimelineEntry | null {
  const { item } = itemState;

  if (item.type === "webSearch") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "webSearch"), kind: "webSearch", threadId: conversationId, turnId: turn.turnId, itemId: item.id, query: item.query, action: item.action };
  }
  if (item.type === "imageView") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "imageView"), kind: "imageView", threadId: conversationId, turnId: turn.turnId, itemId: item.id, path: item.path };
  }
  if (item.type === "imageGeneration") {
    return { id: createEntryId(conversationId, turn.turnId, item.id, "imageGeneration"), kind: "imageGeneration", threadId: conversationId, turnId: turn.turnId, itemId: item.id, status: item.status, revisedPrompt: item.revisedPrompt, result: item.result, savedPath: item.savedPath ?? null };
  }

  return null;
}

function mapTurnItemEntry(
  conversationId: string,
  turn: ConversationTurnState,
  itemState: ConversationTurnState["items"][number],
): TimelineEntry | null {
  return mapMessageLikeEntry(conversationId, turn, itemState)
    ?? mapExecutionEntry(conversationId, turn, itemState)
    ?? mapToolCallEntry(conversationId, turn, itemState)
    ?? mapSearchOrImageEntry(conversationId, turn, itemState);
}

function appendTurnArtifacts(
  entries: Array<TimelineEntry>,
  conversationId: string,
  turn: ConversationTurnState,
): void {
  if (turn.planSteps.length > 0) {
    entries.push({ id: createEntryId(conversationId, turn.turnId, null, "turnPlan"), kind: "turnPlanSnapshot", threadId: conversationId, turnId: turn.turnId, itemId: null, explanation: turn.planExplanation, plan: [...turn.planSteps] });
  }
  if (turn.diff !== null) {
    entries.push({ id: createEntryId(conversationId, turn.turnId, null, "turnDiff"), kind: "turnDiffSnapshot", threadId: conversationId, turnId: turn.turnId, itemId: null, diff: turn.diff });
  }
  turn.reviewStates.forEach((reviewState) => entries.push({ id: createEntryId(conversationId, turn.turnId, reviewState.itemId, reviewState.state), kind: "reviewMode", threadId: conversationId, turnId: turn.turnId, itemId: reviewState.itemId, state: reviewState.state, review: reviewState.review }));
  turn.notices.forEach((notice) => entries.push({ id: createEntryId(conversationId, turn.turnId, notice.itemId, notice.id), kind: "systemNotice", threadId: conversationId, turnId: turn.turnId, itemId: notice.itemId, level: notice.level, title: notice.title, detail: notice.detail, source: notice.source }));
  turn.rawResponses.forEach((item, index) => entries.push(mapRawResponseEntry(conversationId, turn.turnId, index, item)));
  if (turn.error !== null) {
    entries.push({ id: createEntryId(conversationId, turn.turnId, null, "turnError"), kind: "debug", threadId: conversationId, turnId: turn.turnId, itemId: null, title: "turn:error", payload: turn.error });
  }
}

function appendAnchoredContextCompactions(
  entries: Array<TimelineEntry>,
  conversationId: string,
  turn: ConversationTurnState,
  afterItemId: string | null,
): void {
  turn.contextCompactions
    .filter((compaction) => compaction.afterItemId === afterItemId)
    .forEach((compaction) => entries.push({
      id: createEntryId(conversationId, turn.turnId, compaction.itemId, compaction.id),
      kind: "contextCompaction",
      threadId: conversationId,
      turnId: turn.turnId,
      itemId: compaction.itemId,
    }));
}

export function mapConversationTurnToTimelineEntries(conversation: ConversationState, turn: ConversationTurnState): Array<TimelineEntry> {
  const entries: Array<TimelineEntry> = [];
  appendInitialUserEntry(entries, conversation.id, turn);
  appendAnchoredContextCompactions(entries, conversation.id, turn, null);

  for (const itemState of turn.items) {
    const entry = mapTurnItemEntry(conversation.id, turn, itemState);
    if (entry !== null) {
      entries.push(entry);
    }
    appendAnchoredContextCompactions(entries, conversation.id, turn, itemState.item.id);
  }

  appendTurnArtifacts(entries, conversation.id, turn);
  return entries;
}

export function mapRequestEntry(
  request: ReceivedServerRequest,
): PendingApprovalEntry | PendingUserInputEntry | PendingToolCallEntry | PendingTokenRefreshEntry | TimelineEntry | null {
  if (request.kind === "commandApproval" || request.kind === "fileApproval" || request.kind === "legacyPatchApproval" || request.kind === "legacyCommandApproval") {
    return { id: createEntryId(request.threadId ?? "request", request.turnId, request.itemId, `request:${request.id}`), kind: "pendingApproval", threadId: request.threadId ?? "request", turnId: request.turnId, itemId: request.itemId, requestId: request.id, request };
  }
  if (request.kind === "userInput") {
    return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingUserInput", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request };
  }
  if (request.kind === "toolCall") {
    return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingToolCall", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request };
  }
  if (request.kind === "tokenRefresh") {
    return { id: `request:${request.id}`, kind: "pendingTokenRefresh", threadId: "request", turnId: null, itemId: null, requestId: request.id, request };
  }
  if (request.threadId === null) {
    return null;
  }

  return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "debug", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, title: `request:${request.method}`, payload: request.params };
}

export function mapRealtimeEntries(
  conversationId: string,
  realtime: RealtimeState | null,
): ReadonlyArray<TimelineEntry> {
  if (realtime === null) {
    return [];
  }

  const entries: Array<TimelineEntry> = [];
  const status: RealtimeSessionEntry["status"] = realtime.error ? "error" : realtime.closed ? "closed" : "started";
  entries.push({ id: createEntryId(conversationId, null, null, "realtime-session"), kind: "realtimeSession", threadId: conversationId, turnId: null, itemId: null, sessionId: realtime.sessionId, status, message: realtime.error });
  realtime.audioChunks.forEach((audio, index) => entries.push({ id: createEntryId(conversationId, null, `audio-${index}`, "realtime-audio"), kind: "realtimeAudio", threadId: conversationId, turnId: null, itemId: `audio-${index}`, chunkIndex: index, audio }));
  return entries;
}

export function mapFuzzyEntries(
  fuzzySessions: ReadonlyArray<FuzzySearchSessionState>,
): ReadonlyArray<TimelineEntry> {
  return fuzzySessions.map((session) => ({ id: `fuzzy:${session.sessionId}`, kind: "fuzzySearch", threadId: "search", turnId: null, itemId: session.sessionId, sessionId: session.sessionId, query: session.query, status: session.completed ? "completed" : "updating", files: session.files }));
}

export function mapConversationToTimelineEntries(
  conversation: ConversationState | null,
  requests: ReadonlyArray<ReceivedServerRequest>,
  extras?: Partial<TimelineExtras>,
): ReadonlyArray<TimelineEntry> {
  const fuzzyEntries = mapFuzzyEntries(extras?.fuzzySessions ?? []);
  if (conversation === null) {
    return [...requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null), ...fuzzyEntries];
  }

  const entries = conversation.turns.flatMap((turn) => mapConversationTurnToTimelineEntries(conversation, turn));
  const requestEntries = requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null);
  const realtimeEntries = mapRealtimeEntries(conversation.id, extras?.realtime ?? null);
  return [...entries, ...requestEntries, ...realtimeEntries, ...fuzzyEntries];
}
