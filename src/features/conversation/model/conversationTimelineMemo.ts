import type { ConversationState, ConversationTurnState } from "../../../domain/conversation";
import type { ReceivedServerRequest } from "../../../domain/serverRequests";
import type { TimelineEntry } from "../../../domain/timeline";
import type { FuzzySearchSessionState, RealtimeState } from "../../../domain/types";
import {
  mapConversationTurnToTimelineEntries,
  mapFuzzyEntries,
  mapRealtimeEntries,
  mapRequestEntry,
} from "./conversationTimeline";

interface TimelineExtras {
  readonly realtime: RealtimeState | null;
  readonly fuzzySessions: ReadonlyArray<FuzzySearchSessionState>;
}

const EMPTY_ENTRIES: ReadonlyArray<TimelineEntry> = [];
const EMPTY_REQUESTS: ReadonlyArray<ReceivedServerRequest> = [];
const EMPTY_FUZZY_SESSIONS: ReadonlyArray<FuzzySearchSessionState> = [];

function areArraysShallowEqual<T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function flattenEntryGroups(groups: ReadonlyArray<ReadonlyArray<TimelineEntry>>): ReadonlyArray<TimelineEntry> {
  if (groups.length === 0) {
    return EMPTY_ENTRIES;
  }

  const nextEntries: Array<TimelineEntry> = [];
  groups.forEach((group) => nextEntries.push(...group));
  return nextEntries;
}

function mapRequestEntries(requests: ReadonlyArray<ReceivedServerRequest>): ReadonlyArray<TimelineEntry> {
  const nextEntries = requests.map(mapRequestEntry).filter((entry): entry is TimelineEntry => entry !== null);
  return nextEntries.length === 0 ? EMPTY_ENTRIES : nextEntries;
}

function combineTimelineEntries(groups: ReadonlyArray<ReadonlyArray<TimelineEntry>>): ReadonlyArray<TimelineEntry> {
  const nonEmptyGroups = groups.filter((group) => group.length > 0);
  return nonEmptyGroups.length === 0 ? EMPTY_ENTRIES : flattenEntryGroups(nonEmptyGroups);
}

export function createConversationTimelineMemo(): (
  conversation: ConversationState | null,
  requests: ReadonlyArray<ReceivedServerRequest>,
  extras?: Partial<TimelineExtras>,
) => ReadonlyArray<TimelineEntry> {
  let previousConversationId: string | null = null;
  let previousTurnRefs: ReadonlyArray<ConversationTurnState> = [];
  let previousTurnEntries: ReadonlyArray<ReadonlyArray<TimelineEntry>> = [];
  let previousConversationEntries = EMPTY_ENTRIES;
  let previousRequests = EMPTY_REQUESTS;
  let previousRequestEntries = EMPTY_ENTRIES;
  let previousRealtimeConversationId: string | null = null;
  let previousRealtime: RealtimeState | null = null;
  let previousRealtimeEntries = EMPTY_ENTRIES;
  let previousFuzzySessions = EMPTY_FUZZY_SESSIONS;
  let previousFuzzyEntries = EMPTY_ENTRIES;
  let previousGroups: ReadonlyArray<ReadonlyArray<TimelineEntry>> = [];
  let previousOutput = EMPTY_ENTRIES;

  return (conversation, requests, extras) => {
    const fuzzySessions = extras?.fuzzySessions ?? EMPTY_FUZZY_SESSIONS;
    const realtime = extras?.realtime ?? null;

    if (conversation === null) {
      previousConversationId = null;
      previousTurnRefs = [];
      previousTurnEntries = [];
      previousConversationEntries = EMPTY_ENTRIES;
    }

    if (previousRequests !== requests) {
      previousRequests = requests;
      previousRequestEntries = mapRequestEntries(requests);
    }

    if (previousFuzzySessions !== fuzzySessions) {
      previousFuzzySessions = fuzzySessions;
      previousFuzzyEntries = mapFuzzyEntries(fuzzySessions);
    }

    if (conversation === null) {
      const nextGroups = [previousRequestEntries, previousFuzzyEntries];
      if (areArraysShallowEqual(previousGroups, nextGroups)) {
        return previousOutput;
      }
      previousGroups = nextGroups;
      previousOutput = combineTimelineEntries(nextGroups);
      return previousOutput;
    }

    if (previousConversationId !== conversation.id) {
      previousConversationId = conversation.id;
      previousTurnRefs = [];
      previousTurnEntries = [];
      previousConversationEntries = EMPTY_ENTRIES;
    }

    const nextTurnEntries = conversation.turns.map((turn, index) => (
      previousTurnRefs[index] === turn
        ? previousTurnEntries[index]
        : mapConversationTurnToTimelineEntries(conversation, turn)
    ));

    previousTurnRefs = conversation.turns;
    if (areArraysShallowEqual(previousTurnEntries, nextTurnEntries) === false) {
      previousTurnEntries = nextTurnEntries;
      previousConversationEntries = flattenEntryGroups(nextTurnEntries);
    }

    if (previousRealtimeConversationId !== conversation.id || previousRealtime !== realtime) {
      previousRealtimeConversationId = conversation.id;
      previousRealtime = realtime;
      previousRealtimeEntries = mapRealtimeEntries(conversation.id, realtime);
    }

    const nextGroups = [previousConversationEntries, previousRequestEntries, previousRealtimeEntries, previousFuzzyEntries];
    if (areArraysShallowEqual(previousGroups, nextGroups)) {
      return previousOutput;
    }

    previousGroups = nextGroups;
    previousOutput = combineTimelineEntries(nextGroups);
    return previousOutput;
  };
}
