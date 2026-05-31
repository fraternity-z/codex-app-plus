import type { GoalSubmissionHistoryEntry } from "../../../domain/conversation";
import type { UserInput } from "../../../protocol/generated/v2/UserInput";

export const GOAL_SUBMISSION_HISTORY_STORAGE_KEY = "codex.goalSubmissionHistory.v1";

const MAX_ENTRIES_PER_THREAD = 100;

type GoalSubmissionHistoryStore = Record<string, Array<GoalSubmissionHistoryEntry>>;

function getDefaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isUserInput(value: unknown): value is UserInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const input = value as Record<string, unknown>;
  if (input.type === "text") {
    return typeof input.text === "string" && Array.isArray(input.text_elements);
  }
  if (input.type === "image") {
    return typeof input.url === "string";
  }
  if (input.type === "localImage") {
    return typeof input.path === "string";
  }
  if (input.type === "skill" || input.type === "mention") {
    return typeof input.name === "string" && typeof input.path === "string";
  }
  return false;
}

function isHistoryInput(value: unknown): value is ReadonlyArray<UserInput> {
  return Array.isArray(value) && value.every(isUserInput);
}

function isHistoryEntry(value: unknown): value is GoalSubmissionHistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string"
    && typeof entry.threadId === "string"
    && typeof entry.objective === "string"
    && (entry.input === undefined || isHistoryInput(entry.input))
    && typeof entry.createdAtMs === "number"
    && Number.isFinite(entry.createdAtMs);
}

function readStore(storage: Storage | null): GoalSubmissionHistoryStore {
  if (storage === null) {
    return {};
  }
  let raw: string | null = null;
  try {
    raw = storage.getItem(GOAL_SUBMISSION_HISTORY_STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === null) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([threadId, entries]) => [
          threadId,
          Array.isArray(entries) ? entries.filter(isHistoryEntry) : [],
        ])
        .filter(([, entries]) => entries.length > 0),
    );
  } catch {
    return {};
  }
}

function writeStore(storage: Storage | null, store: GoalSubmissionHistoryStore): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(GOAL_SUBMISSION_HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Losing this UI-only cache should not fail a goal update.
  }
}

function createSubmissionId(threadId: string, createdAtMs: number): string {
  return `goal-${threadId}-${createdAtMs}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGoalSubmissionHistoryEntry(
  threadId: string,
  objective: string,
  createdAtMs = Date.now(),
  input?: ReadonlyArray<UserInput>,
): GoalSubmissionHistoryEntry {
  return {
    id: createSubmissionId(threadId, createdAtMs),
    threadId,
    objective,
    ...(input === undefined || input.length === 0 ? {} : { input: [...input] }),
    createdAtMs,
  };
}

export function readGoalSubmissionHistory(
  threadId: string,
  storage: Storage | null = getDefaultStorage(),
): ReadonlyArray<GoalSubmissionHistoryEntry> {
  return [...(readStore(storage)[threadId] ?? [])].sort((left, right) => left.createdAtMs - right.createdAtMs);
}

export function saveGoalSubmissionHistoryEntry(
  entry: GoalSubmissionHistoryEntry,
  storage: Storage | null = getDefaultStorage(),
): void {
  const objective = entry.objective.trim();
  if (objective.length === 0) {
    return;
  }
  const store = readStore(storage);
  const currentEntries = store[entry.threadId] ?? [];
  const nextEntries = [
    ...currentEntries.filter((current) => current.id !== entry.id),
    {
      ...entry,
      objective,
      ...(entry.input === undefined || entry.input.length === 0 ? {} : { input: [...entry.input] }),
    },
  ]
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(-MAX_ENTRIES_PER_THREAD);
  writeStore(storage, { ...store, [entry.threadId]: nextEntries });
}
