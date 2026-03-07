import type { ConversationState, ConversationTurnState } from "../domain/conversation";
import type {
  ConversationMessage,
  FuzzySearchSessionState,
  RealtimeState,
} from "../domain/types";
import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  ContextCompactionEntry,
  DynamicToolCallEntry,
  FileChangeEntry,
  FuzzySearchEntry,
  ImageViewEntry,
  McpToolCallEntry,
  PendingApprovalEntry,
  PendingTokenRefreshEntry,
  PendingToolCallEntry,
  PendingUserInputEntry,
  RawResponseEntry,
  RealtimeAudioEntry,
  RealtimeSessionEntry,
  ReviewModeEntry,
  SystemNoticeEntry,
  TimelineEntry,
  TokenUsageEntry,
  WebSearchEntry,
} from "../domain/timeline";
import type { ReceivedServerRequest } from "../domain/serverRequests";
import { summarizeUserInputs } from "./conversationUserInput";
import { normalizeConversationMessageText } from "./conversationMessages";

interface TimelineExtras {
  readonly realtime: RealtimeState | null;
  readonly fuzzySessions: ReadonlyArray<FuzzySearchSessionState>;
}

function createEntryId(conversationId: string, turnId: string | null, itemId: string | null, suffix: string): string {
  return `${conversationId}:${turnId ?? "turn"}:${itemId ?? suffix}:${suffix}`;
}

function createUserInputMessage(conversationId: string, turn: ConversationTurnState): ConversationMessage | null {
  const summary = summarizeUserInputs(turn.params?.input ?? []);
  if (summary.text.length === 0 && summary.attachments.length === 0) {
    return null;
  }
  return { id: createEntryId(conversationId, turn.turnId, "user", "user"), kind: "userMessage", role: "user", threadId: conversationId, turnId: turn.turnId, itemId: "user", text: normalizeConversationMessageText("user", summary.text), status: "done", attachments: summary.attachments };
}

function mapRawResponseEntry(conversationId: string, turnId: string | null, index: number, item: import("../protocol/generated/ResponseItem").ResponseItem): RawResponseEntry {
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

function mapTurnItems(conversation: ConversationState, turn: ConversationTurnState): Array<TimelineEntry> {
  const entries: Array<TimelineEntry> = [];
  const initialUserMessage = createUserInputMessage(conversation.id, turn);
  if (initialUserMessage !== null) {
    entries.push(initialUserMessage);
  }
  for (const itemState of turn.items) {
    const { item } = itemState;
    if (item.type === "userMessage") {
      const summary = summarizeUserInputs(item.content);
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "user"), kind: "userMessage", role: "user", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, text: normalizeConversationMessageText("user", summary.text), status: "done", attachments: summary.attachments });
      continue;
    }
    if (item.type === "agentMessage") {
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "agent"), kind: "agentMessage", role: "assistant", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, text: normalizeConversationMessageText("assistant", item.text), status: turn.status === "inProgress" ? "streaming" : "done" });
      continue;
    }
    if (item.type === "plan") {
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "plan"), kind: "plan", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, text: item.text, status: turn.status === "inProgress" ? "streaming" : "done" });
      continue;
    }
    if (item.type === "reasoning") {
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "reasoning"), kind: "reasoning", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, summary: [...item.summary], content: [...item.content] });
      continue;
    }
    if (item.type === "commandExecution") {
      const commandEntry: CommandExecutionEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "command"), kind: "commandExecution", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, command: item.command, cwd: item.cwd, processId: item.processId, status: item.status, commandActions: [...item.commandActions], output: itemState.outputText, exitCode: item.exitCode, durationMs: item.durationMs, terminalInteractions: [...itemState.terminalInteractions], approvalRequestId: itemState.approvalRequestId };
      entries.push(commandEntry);
      continue;
    }
    if (item.type === "fileChange") {
      const fileEntry: FileChangeEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "fileChange"), kind: "fileChange", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, changes: [...item.changes], status: item.status, output: itemState.outputText, approvalRequestId: itemState.approvalRequestId };
      entries.push(fileEntry);
      continue;
    }
    if (item.type === "mcpToolCall") {
      const mcpEntry: McpToolCallEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "mcp"), kind: "mcpToolCall", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, server: item.server, tool: item.tool, status: item.status, arguments: item.arguments, result: item.result, error: item.error, durationMs: item.durationMs, progress: [...itemState.progressMessages] };
      entries.push(mcpEntry);
      continue;
    }
    if (item.type === "dynamicToolCall") {
      const dynamicEntry: DynamicToolCallEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "dynamicTool"), kind: "dynamicToolCall", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, tool: item.tool, arguments: item.arguments, status: item.status, contentItems: [...(item.contentItems ?? [])], success: item.success, durationMs: item.durationMs };
      entries.push(dynamicEntry);
      continue;
    }
    if (item.type === "collabAgentToolCall") {
      const collabEntry: CollabAgentToolCallEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "collabTool"), kind: "collabAgentToolCall", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, tool: item.tool, status: item.status, senderThreadId: item.senderThreadId, receiverThreadIds: [...item.receiverThreadIds], prompt: item.prompt, agentsStates: Object.fromEntries(Object.entries(item.agentsStates).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== undefined)) };
      entries.push(collabEntry);
      continue;
    }
    if (item.type === "webSearch") {
      const webSearchEntry: WebSearchEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "webSearch"), kind: "webSearch", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, query: item.query, action: item.action };
      entries.push(webSearchEntry);
      continue;
    }
    if (item.type === "imageView") {
      const imageEntry: ImageViewEntry = { id: createEntryId(conversation.id, turn.turnId, item.id, "imageView"), kind: "imageView", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, path: item.path };
      entries.push(imageEntry);
      continue;
    }
  }
  if (turn.planSteps.length > 0) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnPlan"), kind: "turnPlanSnapshot", threadId: conversation.id, turnId: turn.turnId, itemId: null, explanation: turn.planExplanation, plan: [...turn.planSteps] });
  }
  if (turn.diff !== null) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnDiff"), kind: "turnDiffSnapshot", threadId: conversation.id, turnId: turn.turnId, itemId: null, diff: turn.diff });
  }
  turn.reviewStates.forEach((reviewState) => {
    const entry: ReviewModeEntry = { id: createEntryId(conversation.id, turn.turnId, reviewState.itemId, reviewState.state), kind: "reviewMode", threadId: conversation.id, turnId: turn.turnId, itemId: reviewState.itemId, state: reviewState.state, review: reviewState.review };
    entries.push(entry);
  });
  turn.contextCompactions.forEach((compaction) => {
    const entry: ContextCompactionEntry = { id: createEntryId(conversation.id, turn.turnId, compaction.itemId, compaction.id), kind: "contextCompaction", threadId: conversation.id, turnId: turn.turnId, itemId: compaction.itemId };
    entries.push(entry);
  });
  turn.notices.forEach((notice) => {
    const entry: SystemNoticeEntry = { id: createEntryId(conversation.id, turn.turnId, notice.itemId, notice.id), kind: "systemNotice", threadId: conversation.id, turnId: turn.turnId, itemId: notice.itemId, level: notice.level, title: notice.title, detail: notice.detail, source: notice.source };
    entries.push(entry);
  });
  if (turn.tokenUsage !== null) {
    const tokenUsageEntry: TokenUsageEntry = { id: createEntryId(conversation.id, turn.turnId, null, "tokenUsage"), kind: "tokenUsage", threadId: conversation.id, turnId: turn.turnId, itemId: null, usage: turn.tokenUsage };
    entries.push(tokenUsageEntry);
  }
  turn.rawResponses.forEach((item, index) => entries.push(mapRawResponseEntry(conversation.id, turn.turnId, index, item)));
  if (turn.error !== null) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnError"), kind: "debug", threadId: conversation.id, turnId: turn.turnId, itemId: null, title: "turn:error", payload: turn.error });
  }
  return entries;
}

function mapRequestEntry(request: ReceivedServerRequest): PendingApprovalEntry | PendingUserInputEntry | PendingToolCallEntry | PendingTokenRefreshEntry | TimelineEntry | null {
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

function mapRealtimeEntries(conversationId: string, realtime: RealtimeState | null): ReadonlyArray<TimelineEntry> {
  if (realtime === null) {
    return [];
  }
  const entries: Array<TimelineEntry> = [];
  const status: RealtimeSessionEntry["status"] = realtime.error ? "error" : realtime.closed ? "closed" : "started";
  entries.push({ id: createEntryId(conversationId, null, null, "realtime-session"), kind: "realtimeSession", threadId: conversationId, turnId: null, itemId: null, sessionId: realtime.sessionId, status, message: realtime.error });
  realtime.audioChunks.forEach((audio, index) => {
    const audioEntry: RealtimeAudioEntry = { id: createEntryId(conversationId, null, `audio-${index}`, "realtime-audio"), kind: "realtimeAudio", threadId: conversationId, turnId: null, itemId: `audio-${index}`, chunkIndex: index, audio };
    entries.push(audioEntry);
  });
  return entries;
}

function mapFuzzyEntries(fuzzySessions: ReadonlyArray<FuzzySearchSessionState>): ReadonlyArray<FuzzySearchEntry> {
  return fuzzySessions.map((session) => ({ id: `fuzzy:${session.sessionId}`, kind: "fuzzySearch", threadId: "search", turnId: null, itemId: session.sessionId, sessionId: session.sessionId, query: session.query, status: session.completed ? "completed" : "updating", files: session.files }));
}

export function mapConversationToTimelineEntries(conversation: ConversationState | null, requests: ReadonlyArray<ReceivedServerRequest>, extras?: Partial<TimelineExtras>): ReadonlyArray<TimelineEntry> {
  const fuzzyEntries = mapFuzzyEntries(extras?.fuzzySessions ?? []);
  if (conversation === null) {
    return [...requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null), ...fuzzyEntries];
  }
  const entries = conversation.turns.flatMap((turn) => mapTurnItems(conversation, turn));
  const requestEntries = requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null);
  const realtimeEntries = mapRealtimeEntries(conversation.id, extras?.realtime ?? null);
  return [...entries, ...requestEntries, ...realtimeEntries, ...fuzzyEntries];
}
