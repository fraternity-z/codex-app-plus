import type {
  ConversationOutputDelta,
  ConversationState,
  ConversationTextDelta,
  ConversationTurnParams,
  ConversationTurnState,
} from "../domain/conversation";
import type { ResponseItem } from "../protocol/generated/ResponseItem";
import type { Thread } from "../protocol/generated/v2/Thread";
import type { ThreadItem } from "../protocol/generated/v2/ThreadItem";
import type { Turn } from "../protocol/generated/v2/Turn";

function toIsoFromUnixSeconds(value: number): string {
  return new Date(value * 1000).toISOString();
}

function createLocalTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createItemState(item: ThreadItem) {
  return { item, approvalRequestId: null, outputText: item.type === "commandExecution" ? item.aggregatedOutput ?? "" : "", terminalInteractions: [], rawResponse: null };
}

function createSkeletonItem(itemId: string, target: ConversationTextDelta["target"] | ConversationOutputDelta["target"], cwd: string | null): ThreadItem {
  if (target === "commandExecution") {
    return { type: "commandExecution", id: itemId, command: "", cwd: cwd ?? "", processId: null, status: "inProgress", commandActions: [], aggregatedOutput: "", exitCode: null, durationMs: null };
  }
  if (target === "fileChange") {
    return { type: "fileChange", id: itemId, changes: [], status: "inProgress" };
  }
  if (target.type === "plan") {
    return { type: "plan", id: itemId, text: "" };
  }
  if (target.type === "agentMessage") {
    return { type: "agentMessage", id: itemId, text: "", phase: null };
  }
  return { type: "reasoning", id: itemId, summary: [], content: [] };
}

function createTurnState(turn: Turn, params: ConversationTurnParams | null): ConversationTurnState {
  return { localId: turn.id, turnId: turn.id, status: turn.status, error: turn.error, params, items: turn.items.map(createItemState), turnStartedAtMs: Date.now(), planExplanation: null, planSteps: [], diff: null };
}

function createEmptyTurn(turnId: string | null): ConversationTurnState {
  return { localId: turnId ?? createLocalTurnId(), turnId, status: "inProgress", error: null, params: null, items: [], turnStartedAtMs: Date.now(), planExplanation: null, planSteps: [], diff: null };
}

function updateIndexedTextArray(parts: ReadonlyArray<string>, index: number, delta: string): Array<string> {
  const next = [...parts];
  while (next.length <= index) {
    next.push("");
  }
  next[index] = `${next[index]}${delta}`;
  return next;
}

function ensureTurnState(conversation: ConversationState, turnId: string | null): { turns: Array<ConversationTurnState>; turnIndex: number } {
  const existingIndex = conversation.turns.findIndex((turn) => turn.turnId === turnId);
  if (existingIndex >= 0) {
    return { turns: [...conversation.turns], turnIndex: existingIndex };
  }
  const placeholderIndex = [...conversation.turns].reverse().findIndex((turn) => turn.turnId === null && turn.status === "inProgress");
  if (placeholderIndex >= 0) {
    const actualIndex = conversation.turns.length - 1 - placeholderIndex;
    const turns = conversation.turns.map((turn, index) => index === actualIndex ? { ...turn, turnId, localId: turnId ?? turn.localId } : turn);
    return { turns, turnIndex: actualIndex };
  }
  const turns = [...conversation.turns, createEmptyTurn(turnId)];
  return { turns, turnIndex: turns.length - 1 };
}

function upsertTurnItem(turn: ConversationTurnState, nextItem: ThreadItem): ConversationTurnState {
  const itemIndex = turn.items.findIndex((entry) => entry.item.id === nextItem.id);
  if (itemIndex < 0) {
    return { ...turn, items: [...turn.items, createItemState(nextItem)] };
  }
  const current = turn.items[itemIndex];
  const nextState = {
    ...current,
    item: nextItem.type === "commandExecution" ? { ...nextItem, aggregatedOutput: nextItem.aggregatedOutput ?? current.outputText } : nextItem,
    outputText: nextItem.type === "commandExecution" ? nextItem.aggregatedOutput ?? current.outputText : current.outputText,
  };
  return { ...turn, items: turn.items.map((entry, index) => index === itemIndex ? nextState : entry) };
}

export function createConversationFromThread(thread: Thread, options?: { hidden?: boolean; resumeState?: ConversationState["resumeState"] }): ConversationState {
  const activeFlags = thread.status.type === "active" ? thread.status.activeFlags : [];
  return { id: thread.id, title: thread.name ?? thread.preview, cwd: thread.cwd, updatedAt: toIsoFromUnixSeconds(thread.updatedAt), source: thread.source, status: thread.status.type, activeFlags, resumeState: options?.resumeState ?? "needs_resume", turns: thread.turns.map((turn) => createTurnState(turn, null)), queuedFollowUps: [], interruptRequestedTurnId: null, hidden: options?.hidden ?? false };
}

export function hydrateConversationFromThread(conversation: ConversationState, thread: Thread): ConversationState {
  return { ...createConversationFromThread(thread, { hidden: conversation.hidden, resumeState: "resumed" }), queuedFollowUps: conversation.queuedFollowUps, interruptRequestedTurnId: conversation.interruptRequestedTurnId };
}

export function touchConversation(conversation: ConversationState, updatedAt: string): ConversationState {
  return { ...conversation, updatedAt };
}

export function setConversationHidden(conversation: ConversationState, hidden: boolean): ConversationState {
  return { ...conversation, hidden };
}

export function setConversationResumeState(conversation: ConversationState, resumeState: ConversationState["resumeState"]): ConversationState {
  return { ...conversation, resumeState };
}

export function setConversationStatus(conversation: ConversationState, status: ConversationState["status"], activeFlags: ConversationState["activeFlags"]): ConversationState {
  return { ...conversation, status, activeFlags: [...activeFlags] };
}

export function addPlaceholderTurn(conversation: ConversationState, params: ConversationTurnParams): ConversationState {
  const turn: ConversationTurnState = { localId: createLocalTurnId(), turnId: null, status: "inProgress", error: null, params, items: [], turnStartedAtMs: Date.now(), planExplanation: null, planSteps: [], diff: null };
  return { ...conversation, turns: [...conversation.turns, turn], updatedAt: new Date().toISOString(), status: "active" };
}

export function syncStartedTurn(conversation: ConversationState, turn: Turn): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turn.id);
  const nextTurn = turnIndex >= 0 ? { ...turns[turnIndex], turnId: turn.id, localId: turn.id, status: turn.status, error: turn.error } : createTurnState(turn, null);
  turns[turnIndex] = nextTurn;
  return { ...conversation, turns };
}

export function syncCompletedTurn(conversation: ConversationState, turn: Turn): ConversationState {
  const nextConversation = syncStartedTurn(conversation, turn);
  return turn.status === "inProgress" ? { ...nextConversation, interruptRequestedTurnId: null } : { ...nextConversation, interruptRequestedTurnId: null, status: "idle", activeFlags: [] };
}

export function upsertConversationItem(conversation: ConversationState, turnId: string, item: ThreadItem): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  turns[turnIndex] = upsertTurnItem(turns[turnIndex], item);
  return { ...conversation, turns };
}

export function applyConversationTextDelta(conversation: ConversationState, entry: ConversationTextDelta): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, entry.turnId);
  const turn = turns[turnIndex];
  const itemIndex = turn.items.findIndex((item) => item.item.id === entry.itemId);
  const current = itemIndex >= 0 ? turn.items[itemIndex] : createItemState(createSkeletonItem(entry.itemId, entry.target, conversation.cwd));
  const item = current.item;
  let nextItem = item;
  if (item.type === "agentMessage" && entry.target.type === "agentMessage") {
    nextItem = { ...item, text: `${item.text}${entry.delta}` };
  }
  if (item.type === "plan" && entry.target.type === "plan") {
    nextItem = { ...item, text: `${item.text}${entry.delta}` };
  }
  if (item.type === "reasoning" && entry.target.type === "reasoningSummary") {
    nextItem = { ...item, summary: updateIndexedTextArray(item.summary, entry.target.summaryIndex, entry.delta) };
  }
  if (item.type === "reasoning" && entry.target.type === "reasoningContent") {
    nextItem = { ...item, content: updateIndexedTextArray(item.content, entry.target.contentIndex, entry.delta) };
  }
  const nextItemState = { ...current, item: nextItem };
  const items = itemIndex >= 0 ? turn.items.map((itemState, index) => index === itemIndex ? nextItemState : itemState) : [...turn.items, nextItemState];
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function applyConversationOutputDelta(conversation: ConversationState, entry: ConversationOutputDelta): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, entry.turnId);
  const turn = turns[turnIndex];
  const itemIndex = turn.items.findIndex((item) => item.item.id === entry.itemId);
  const current = itemIndex >= 0 ? turn.items[itemIndex] : createItemState(createSkeletonItem(entry.itemId, entry.target, conversation.cwd));
  const nextOutput = `${current.outputText}${entry.delta}`;
  const nextItem = current.item.type === "commandExecution" ? { ...current.item, aggregatedOutput: nextOutput } : current.item;
  const nextItemState = { ...current, item: nextItem, outputText: nextOutput };
  const items = itemIndex >= 0 ? turn.items.map((itemState, index) => index === itemIndex ? nextItemState : itemState) : [...turn.items, nextItemState];
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function appendConversationTerminalInteraction(conversation: ConversationState, turnId: string, itemId: string, stdin: string): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  const turn = turns[turnIndex];
  const items = turn.items.map((itemState) => itemState.item.id === itemId ? { ...itemState, terminalInteractions: [...itemState.terminalInteractions, stdin] } : itemState);
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function attachConversationRawResponse(conversation: ConversationState, turnId: string, itemId: string, rawResponse: ResponseItem): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  const turn = turns[turnIndex];
  const itemIndex = turn.items.findIndex((item) => item.item.id === itemId);
  const current = itemIndex >= 0 ? turn.items[itemIndex] : createItemState(createSkeletonItem(itemId, { type: "agentMessage" }, conversation.cwd));
  const nextItemState = { ...current, rawResponse };
  const items = itemIndex >= 0 ? turn.items.map((itemState, index) => index === itemIndex ? nextItemState : itemState) : [...turn.items, nextItemState];
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function attachApprovalRequestToConversation(conversation: ConversationState, turnId: string, itemId: string, requestId: string): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  const turn = turns[turnIndex];
  const items = turn.items.map((itemState) => itemState.item.id === itemId ? { ...itemState, approvalRequestId: requestId } : itemState);
  turns[turnIndex] = { ...turn, items };
  return { ...conversation, turns };
}

export function setConversationPlan(conversation: ConversationState, turnId: string, explanation: string | null, planSteps: ReadonlyArray<ConversationTurnState["planSteps"][number]>): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  turns[turnIndex] = { ...turns[turnIndex], planExplanation: explanation, planSteps: [...planSteps] };
  return { ...conversation, turns };
}

export function setConversationDiff(conversation: ConversationState, turnId: string, diff: string): ConversationState {
  const { turns, turnIndex } = ensureTurnState(conversation, turnId);
  turns[turnIndex] = { ...turns[turnIndex], diff };
  return { ...conversation, turns };
}
