import type { CodexSessionReadOutput } from "../bridge/types";
import type {
  CommandExecutionEntry,
  ConversationMessage,
  DebugEntry,
  FileChangeEntry,
  PendingApprovalEntry,
  PendingUserInputEntry,
  PlanEntry,
  QueuedFollowUp,
  QueuedFollowUpEntry,
  ReasoningEntry,
  ReceivedServerRequest,
  TimelineEntry,
  TurnDiffSnapshotEntry,
  TurnPlanSnapshotEntry,
} from "../domain/timeline";
import type { Thread } from "../protocol/generated/v2/Thread";
import type { ThreadItem } from "../protocol/generated/v2/ThreadItem";
import type { TurnPlanStep } from "../protocol/generated/v2/TurnPlanStep";
import type { UserInput } from "../protocol/generated/v2/UserInput";
import { normalizeConversationMessageText } from "./conversationMessages";

function createTimelineId(threadId: string, turnId: string | null, itemId: string | null, suffix: string): string {
  return [threadId, turnId ?? "thread", itemId ?? suffix, suffix].join(":");
}

function toUserInputText(content: Array<UserInput>): string {
  return content
    .map((input) => {
      if (input.type === "text") {
        return input.text;
      }
      if (input.type === "image") {
        return `[image] ${input.url}`;
      }
      if (input.type === "localImage") {
        return `[image] ${input.path}`;
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
}

function createDebugEntry(threadId: string, turnId: string, itemId: string, title: string, payload: unknown): DebugEntry {
  return { id: createTimelineId(threadId, turnId, itemId, "debug"), kind: "debug", threadId, turnId, itemId, title, payload };
}

function mapThreadItem(threadId: string, turnId: string, item: ThreadItem): TimelineEntry {
  if (item.type === "userMessage") {
    return {
      id: createTimelineId(threadId, turnId, item.id, "user"),
      kind: "userMessage",
      role: "user",
      threadId,
      turnId,
      itemId: item.id,
      text: normalizeConversationMessageText("user", toUserInputText(item.content)),
      status: "done"
    } satisfies ConversationMessage;
  }

  if (item.type === "agentMessage") {
    return {
      id: createTimelineId(threadId, turnId, item.id, "agent"),
      kind: "agentMessage",
      role: "assistant",
      threadId,
      turnId,
      itemId: item.id,
      text: normalizeConversationMessageText("assistant", item.text),
      status: "done"
    } satisfies ConversationMessage;
  }

  if (item.type === "plan") {
    return { id: createTimelineId(threadId, turnId, item.id, "plan"), kind: "plan", threadId, turnId, itemId: item.id, text: item.text, status: "done" } satisfies PlanEntry;
  }

  if (item.type === "reasoning") {
    return { id: createTimelineId(threadId, turnId, item.id, "reasoning"), kind: "reasoning", threadId, turnId, itemId: item.id, summary: item.summary, content: item.content } satisfies ReasoningEntry;
  }

  if (item.type === "commandExecution") {
    return {
      id: createTimelineId(threadId, turnId, item.id, "command"),
      kind: "commandExecution",
      threadId,
      turnId,
      itemId: item.id,
      command: item.command,
      cwd: item.cwd,
      processId: item.processId,
      status: item.status,
      commandActions: item.commandActions,
      output: item.aggregatedOutput ?? "",
      exitCode: item.exitCode,
      durationMs: item.durationMs,
      terminalInteractions: [],
      approvalRequestId: null
    } satisfies CommandExecutionEntry;
  }

  if (item.type === "fileChange") {
    return {
      id: createTimelineId(threadId, turnId, item.id, "fileChange"),
      kind: "fileChange",
      threadId,
      turnId,
      itemId: item.id,
      changes: item.changes,
      status: item.status,
      output: "",
      approvalRequestId: null
    } satisfies FileChangeEntry;
  }

  if (item.type === "mcpToolCall") {
    return {
      id: createTimelineId(threadId, turnId, item.id, "mcp"),
      kind: "mcpToolCall",
      threadId,
      turnId,
      itemId: item.id,
      server: item.server,
      tool: item.tool,
      status: item.status,
      arguments: item.arguments,
      result: item.result,
      error: item.error,
      durationMs: item.durationMs
    };
  }

  return createDebugEntry(threadId, turnId, item.id, `item:${item.type}`, item);
}

function upsertEntry(entries: Array<TimelineEntry>, next: TimelineEntry): Array<TimelineEntry> {
  const index = entries.findIndex((entry) => entry.id === next.id);
  if (index < 0) {
    return [...entries, next];
  }
  return entries.map((entry, currentIndex) => (currentIndex === index ? next : entry));
}

function patchItemEntry(
  entries: Array<TimelineEntry>,
  threadId: string,
  turnId: string,
  itemId: string,
  patch: (entry: TimelineEntry) => TimelineEntry
): Array<TimelineEntry> {
  return entries.map((entry) => {
    if (entry.threadId !== threadId || entry.turnId !== turnId || entry.itemId !== itemId) {
      return entry;
    }
    return patch(entry);
  });
}

export function mapThreadHistoryToActivities(thread: Thread): Array<TimelineEntry> {
  return thread.turns.flatMap((turn) => turn.items.map((item) => mapThreadItem(thread.id, turn.id, item)));
}

export function mapCodexSessionToActivities(threadId: string, response: CodexSessionReadOutput): Array<TimelineEntry> {
  return response.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: createTimelineId(threadId, null, message.id, message.role),
      kind: message.role === "user" ? "userMessage" : "agentMessage",
      role: message.role as "user" | "assistant",
      threadId,
      turnId: null,
      itemId: message.id,
      text: normalizeConversationMessageText(message.role as "user" | "assistant", message.text),
      status: "done"
    }) as ConversationMessage)
    .filter((entry) => entry.text.trim().length > 0);
}

export function createUserMessageEntry(threadId: string, turnId: string, itemId: string, text: string): ConversationMessage {
  return {
    id: createTimelineId(threadId, turnId, itemId, "user"),
    kind: "userMessage",
    role: "user",
    threadId,
    turnId,
    itemId,
    text: normalizeConversationMessageText("user", text),
    status: "done"
  };
}

export function replaceThreadActivities(
  threadActivities: Record<string, Array<TimelineEntry>>,
  threadId: string,
  activities: Array<TimelineEntry>
): Record<string, Array<TimelineEntry>> {
  return { ...threadActivities, [threadId]: [...activities] };
}

export function appendAssistantDelta(entries: Array<TimelineEntry>, threadId: string, turnId: string, itemId: string, delta: string): Array<TimelineEntry> {
  const nextId = createTimelineId(threadId, turnId, itemId, "agent");
  const existing = entries.find((entry) => entry.id === nextId);
  if (existing !== undefined && existing.kind === "agentMessage") {
    return upsertEntry(entries, { ...existing, text: `${existing.text}${delta}`, status: "streaming" });
  }
  return upsertEntry(entries, { id: nextId, kind: "agentMessage", role: "assistant", threadId, turnId, itemId, text: delta, status: "streaming" });
}

export function appendPlanDelta(entries: Array<TimelineEntry>, threadId: string, turnId: string, itemId: string, delta: string): Array<TimelineEntry> {
  const nextId = createTimelineId(threadId, turnId, itemId, "plan");
  const existing = entries.find((entry) => entry.id === nextId);
  if (existing !== undefined && existing.kind === "plan") {
    return upsertEntry(entries, { ...existing, text: `${existing.text}${delta}`, status: "streaming" });
  }
  return upsertEntry(entries, { id: nextId, kind: "plan", threadId, turnId, itemId, text: delta, status: "streaming" });
}

export function applyItemStarted(entries: Array<TimelineEntry>, threadId: string, turnId: string, item: ThreadItem): Array<TimelineEntry> {
  return upsertEntry(entries, mapThreadItem(threadId, turnId, item));
}

export function applyItemCompleted(entries: Array<TimelineEntry>, threadId: string, turnId: string, item: ThreadItem): Array<TimelineEntry> {
  return upsertEntry(entries, mapThreadItem(threadId, turnId, item));
}

export function appendCommandOutputDelta(entries: Array<TimelineEntry>, threadId: string, turnId: string, itemId: string, delta: string): Array<TimelineEntry> {
  return patchItemEntry(entries, threadId, turnId, itemId, (entry) => entry.kind === "commandExecution" ? { ...entry, output: `${entry.output}${delta}` } : entry);
}

export function appendFileChangeOutputDelta(entries: Array<TimelineEntry>, threadId: string, turnId: string, itemId: string, delta: string): Array<TimelineEntry> {
  return patchItemEntry(entries, threadId, turnId, itemId, (entry) => entry.kind === "fileChange" ? { ...entry, output: `${entry.output}${delta}` } : entry);
}

export function appendTerminalInteraction(entries: Array<TimelineEntry>, threadId: string, turnId: string, itemId: string, stdin: string): Array<TimelineEntry> {
  return patchItemEntry(entries, threadId, turnId, itemId, (entry) => entry.kind === "commandExecution" ? { ...entry, terminalInteractions: [...entry.terminalInteractions, stdin] } : entry);
}

export function completeTurnActivities(entries: Array<TimelineEntry>, threadId: string, turnId: string): Array<TimelineEntry> {
  return entries.map((entry) => {
    if (entry.threadId !== threadId || entry.turnId !== turnId) {
      return entry;
    }
    if (entry.kind === "agentMessage" || entry.kind === "plan") {
      return { ...entry, status: "done" };
    }
    return entry;
  });
}

export function upsertTurnPlanSnapshot(entries: Array<TimelineEntry>, threadId: string, turnId: string, explanation: string | null, plan: Array<TurnPlanStep>): Array<TimelineEntry> {
  const entry: TurnPlanSnapshotEntry = { id: createTimelineId(threadId, turnId, null, "turnPlan"), kind: "turnPlanSnapshot", threadId, turnId, itemId: null, explanation, plan };
  return upsertEntry(entries, entry);
}

export function upsertTurnDiffSnapshot(entries: Array<TimelineEntry>, threadId: string, turnId: string, diff: string): Array<TimelineEntry> {
  const entry: TurnDiffSnapshotEntry = { id: createTimelineId(threadId, turnId, null, "turnDiff"), kind: "turnDiffSnapshot", threadId, turnId, itemId: null, diff };
  return upsertEntry(entries, entry);
}

export function createRequestEntry(request: ReceivedServerRequest): TimelineEntry | null {
  if (request.kind === "commandApproval" || request.kind === "fileApproval") {
    return { id: createTimelineId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingApproval", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request } satisfies PendingApprovalEntry;
  }
  if (request.kind === "userInput") {
    return { id: createTimelineId(request.threadId, request.turnId, request.itemId, `request:${request.id}`), kind: "pendingUserInput", threadId: request.threadId, turnId: request.turnId, itemId: request.itemId, requestId: request.id, request } satisfies PendingUserInputEntry;
  }
  if (request.threadId === null || request.turnId === null || request.itemId === null) {
    return null;
  }
  return createDebugEntry(request.threadId, request.turnId, request.itemId, `request:${request.method}`, request.params);
}

export function applyRequestToEntries(entries: Array<TimelineEntry>, request: ReceivedServerRequest): Array<TimelineEntry> {
  const entry = createRequestEntry(request);
  let nextEntries = entries;
  if (request.kind === "commandApproval") {
    nextEntries = patchItemEntry(entries, request.threadId, request.turnId, request.itemId, (current) => current.kind === "commandExecution" ? { ...current, approvalRequestId: request.id } : current);
  }
  if (request.kind === "fileApproval") {
    nextEntries = patchItemEntry(nextEntries, request.threadId, request.turnId, request.itemId, (current) => current.kind === "fileChange" ? { ...current, approvalRequestId: request.id } : current);
  }
  return entry === null ? nextEntries : upsertEntry(nextEntries, entry);
}

export function resolveRequestInEntries(entries: Array<TimelineEntry>, requestId: string): Array<TimelineEntry> {
  return entries.filter((entry) => !((entry.kind === "pendingApproval" || entry.kind === "pendingUserInput") && entry.requestId === requestId));
}

export function createQueuedFollowUpEntry(threadId: string, followUp: QueuedFollowUp): QueuedFollowUpEntry {
  return { id: createTimelineId(threadId, null, followUp.id, "queuedFollowUp"), kind: "queuedFollowUp", threadId, turnId: null, itemId: followUp.id, followUp };
}
