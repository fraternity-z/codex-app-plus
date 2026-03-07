import type { ConversationState, ConversationTurnState } from "../domain/conversation";
import type {
  ConversationMessage,
  PendingApprovalEntry,
  PendingUserInputEntry,
  ReceivedServerRequest,
  TimelineEntry,
} from "../domain/timeline";
import { summarizeUserInputs } from "./conversationUserInput";
import { normalizeConversationMessageText } from "./conversationMessages";

function createEntryId(conversationId: string, turnId: string | null, itemId: string | null, suffix: string): string {
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
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "command"), kind: "commandExecution", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, command: item.command, cwd: item.cwd, processId: item.processId, status: item.status, commandActions: [...item.commandActions], output: itemState.outputText, exitCode: item.exitCode, durationMs: item.durationMs, terminalInteractions: [...itemState.terminalInteractions], approvalRequestId: itemState.approvalRequestId });
      continue;
    }
    if (item.type === "fileChange") {
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "fileChange"), kind: "fileChange", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, changes: [...item.changes], status: item.status, output: itemState.outputText, approvalRequestId: itemState.approvalRequestId });
      continue;
    }
    if (item.type === "mcpToolCall") {
      entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "mcp"), kind: "mcpToolCall", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, server: item.server, tool: item.tool, status: item.status, arguments: item.arguments, result: item.result, error: item.error, durationMs: item.durationMs });
      continue;
    }
    entries.push({ id: createEntryId(conversation.id, turn.turnId, item.id, "debug"), kind: "debug", threadId: conversation.id, turnId: turn.turnId, itemId: item.id, title: `unsupported:${item.type}`, payload: itemState.rawResponse ?? item });
  }
  if (turn.planSteps.length > 0) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnPlan"), kind: "turnPlanSnapshot", threadId: conversation.id, turnId: turn.turnId, itemId: null, explanation: turn.planExplanation, plan: [...turn.planSteps] });
  }
  if (turn.diff !== null) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnDiff"), kind: "turnDiffSnapshot", threadId: conversation.id, turnId: turn.turnId, itemId: null, diff: turn.diff });
  }
  if (turn.error !== null) {
    entries.push({ id: createEntryId(conversation.id, turn.turnId, null, "turnError"), kind: "debug", threadId: conversation.id, turnId: turn.turnId, itemId: null, title: "turn:error", payload: turn.error });
  }
  return entries;
}

function mapRequestEntry(request: ReceivedServerRequest): PendingApprovalEntry | PendingUserInputEntry | TimelineEntry | null {
  if (request.threadId === null || request.turnId === null || request.itemId === null) {
    return request.kind === "unknown" || request.kind === "toolCall"
      ? { id: `request:${request.id}`, kind: "debug", threadId: "request", turnId: null, itemId: null, title: `request:${request.method}`, payload: request.params }
      : null;
  }
  if (request.kind === "commandApproval" || request.kind === "fileApproval") {
    return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingApproval", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request };
  }
  if (request.kind === "userInput") {
    return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingUserInput", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request };
  }
  return { id: createEntryId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "debug", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, title: `request:${request.method}`, payload: request.params };
}

export function mapConversationToTimelineEntries(conversation: ConversationState | null, requests: ReadonlyArray<ReceivedServerRequest>): ReadonlyArray<TimelineEntry> {
  if (conversation === null) {
    return [];
  }
  const entries = conversation.turns.flatMap((turn) => mapTurnItems(conversation, turn));
  return [...entries, ...requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null)];
}
