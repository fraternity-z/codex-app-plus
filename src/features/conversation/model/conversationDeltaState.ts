import type {
  ConversationOutputDelta,
  ConversationState,
  ConversationTextDelta,
  ConversationTurnState,
} from "../../../domain/conversation";
import { createItemState, createSkeletonItem, updateTurn } from "./conversationState";

function updateIndexedTextArray(parts: ReadonlyArray<string>, index: number, delta: string): Array<string> {
  const next = [...parts];
  while (next.length <= index) {
    next.push("");
  }
  next[index] = `${next[index]}${delta}`;
  return next;
}

function groupEntriesByTurn<TEntry extends { readonly turnId: string | null }>(entries: ReadonlyArray<TEntry>): Map<string | null, Array<TEntry>> {
  const groupedEntries = new Map<string | null, Array<TEntry>>();
  for (const entry of entries) {
    const turnEntries = groupedEntries.get(entry.turnId);
    if (turnEntries === undefined) {
      groupedEntries.set(entry.turnId, [entry]);
      continue;
    }
    turnEntries.push(entry);
  }
  return groupedEntries;
}

function applyTurnTextDeltas(
  turn: ConversationTurnState,
  entries: ReadonlyArray<ConversationTextDelta>,
  cwd: string | null,
): ConversationTurnState {
  const itemIndexes = new Map(turn.items.map((itemState, index) => [itemState.item.id, index]));
  const items = [...turn.items];
  let changed = false;

  for (const entry of entries) {
    const itemIndex = itemIndexes.get(entry.itemId) ?? -1;
    const current = itemIndex >= 0 ? items[itemIndex] : createItemState(createSkeletonItem(entry.itemId, entry.target, cwd));
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

    if (nextItem === item && itemIndex >= 0) {
      continue;
    }

    const nextItemState = { ...current, item: nextItem };
    if (itemIndex < 0) {
      itemIndexes.set(entry.itemId, items.length);
      items.push(nextItemState);
      changed = true;
      continue;
    }
    items[itemIndex] = nextItemState;
    changed = true;
  }

  return changed ? { ...turn, items } : turn;
}

function applyTurnOutputDeltas(
  turn: ConversationTurnState,
  entries: ReadonlyArray<ConversationOutputDelta>,
  cwd: string | null,
): ConversationTurnState {
  const itemIndexes = new Map(turn.items.map((itemState, index) => [itemState.item.id, index]));
  const items = [...turn.items];
  let changed = false;

  for (const entry of entries) {
    const itemIndex = itemIndexes.get(entry.itemId) ?? -1;
    const current = itemIndex >= 0 ? items[itemIndex] : createItemState(createSkeletonItem(entry.itemId, entry.target, cwd));
    const nextOutput = `${current.outputText}${entry.delta}`;
    const nextItem = current.item.type === "commandExecution" ? { ...current.item, aggregatedOutput: nextOutput } : current.item;
    const nextItemState = { ...current, item: nextItem, outputText: nextOutput };

    if (itemIndex < 0) {
      itemIndexes.set(entry.itemId, items.length);
      items.push(nextItemState);
      changed = true;
      continue;
    }
    items[itemIndex] = nextItemState;
    changed = true;
  }

  return changed ? { ...turn, items } : turn;
}

export function applyConversationTextDeltas(conversation: ConversationState, entries: ReadonlyArray<ConversationTextDelta>): ConversationState {
  let nextConversation = conversation;
  for (const [turnId, turnEntries] of groupEntriesByTurn(entries)) {
    nextConversation = updateTurn(nextConversation, turnId, (turn) => applyTurnTextDeltas(turn, turnEntries, conversation.cwd));
  }
  return nextConversation;
}

export function applyConversationOutputDeltas(conversation: ConversationState, entries: ReadonlyArray<ConversationOutputDelta>): ConversationState {
  let nextConversation = conversation;
  for (const [turnId, turnEntries] of groupEntriesByTurn(entries)) {
    nextConversation = updateTurn(nextConversation, turnId, (turn) => applyTurnOutputDeltas(turn, turnEntries, conversation.cwd));
  }
  return nextConversation;
}
