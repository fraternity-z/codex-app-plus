import type { ConversationOutputDelta, ConversationTextDelta } from "../domain/conversation";
import type { AppState } from "../domain/types";
import {
  applyConversationOutputDeltas,
  applyConversationTextDeltas,
} from "../features/conversation/model/conversationDeltaState";

type ConversationDeltaEntry = ConversationTextDelta | ConversationOutputDelta;

function groupEntriesByConversation<TEntry extends ConversationDeltaEntry>(entries: ReadonlyArray<TEntry>): Map<string, Array<TEntry>> {
  const groupedEntries = new Map<string, Array<TEntry>>();
  for (const entry of entries) {
    const conversationEntries = groupedEntries.get(entry.conversationId);
    if (conversationEntries === undefined) {
      groupedEntries.set(entry.conversationId, [entry]);
      continue;
    }
    conversationEntries.push(entry);
  }
  return groupedEntries;
}

function applyConversationEntryGroups<TEntry extends ConversationDeltaEntry>(
  state: AppState,
  entries: ReadonlyArray<TEntry>,
  applyEntries: (conversation: AppState["conversationsById"][string], groupedEntries: ReadonlyArray<TEntry>) => AppState["conversationsById"][string],
): AppState {
  let nextConversationsById = state.conversationsById;
  let changed = false;

  for (const [conversationId, groupedEntries] of groupEntriesByConversation(entries)) {
    const currentConversation = state.conversationsById[conversationId];
    if (currentConversation === undefined) {
      continue;
    }
    const nextConversation = applyEntries(currentConversation, groupedEntries);
    if (nextConversation === currentConversation) {
      continue;
    }
    if (!changed) {
      nextConversationsById = { ...state.conversationsById };
      changed = true;
    }
    nextConversationsById[conversationId] = nextConversation;
  }

  return changed ? { ...state, conversationsById: nextConversationsById } : state;
}

export function flushConversationTextDeltas(state: AppState, entries: ReadonlyArray<ConversationTextDelta>): AppState {
  return applyConversationEntryGroups(state, entries, applyConversationTextDeltas);
}

export function flushConversationOutputDeltas(state: AppState, entries: ReadonlyArray<ConversationOutputDelta>): AppState {
  return applyConversationEntryGroups(state, entries, applyConversationOutputDeltas);
}
