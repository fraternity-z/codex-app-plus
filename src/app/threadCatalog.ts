import type { ThreadSummary } from "../domain/types";
import type { CodexSessionSummaryOutput } from "../bridge/types";
import { mapThreadListResponse } from "../protocol/mappers";
import type { ThreadListParams } from "../protocol/generated/v2/ThreadListParams";
import type { ThreadListResponse } from "../protocol/generated/v2/ThreadListResponse";

const THREAD_PAGE_SIZE = 100;

function hasThreadText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toUpdatedAtTimestamp(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeThreadSummary(primary: ThreadSummary, secondary: ThreadSummary): ThreadSummary {
  return {
    ...primary,
    title: hasThreadText(primary.title) ? primary.title : secondary.title,
    branch: hasThreadText(primary.branch) ? primary.branch : secondary.branch,
    cwd: hasThreadText(primary.cwd) ? primary.cwd : secondary.cwd,
    updatedAt:
      toUpdatedAtTimestamp(primary.updatedAt) >= toUpdatedAtTimestamp(secondary.updatedAt)
        ? primary.updatedAt
        : secondary.updatedAt
  };
}

export interface ThreadCatalogRequester {
  request: (method: "thread/list", params: ThreadListParams) => Promise<unknown>;
}

function createThreadListParams(cursor: string | null): ThreadListParams {
  return {
    archived: false,
    cursor,
    limit: THREAD_PAGE_SIZE,
    sortKey: "updated_at"
  };
}

export async function listAllThreads(requester: ThreadCatalogRequester): Promise<ReadonlyArray<ThreadSummary>> {
  const threads: Array<ThreadSummary> = [];
  let cursor: string | null = null;

  do {
    const response = (await requester.request("thread/list", createThreadListParams(cursor))) as ThreadListResponse;
    threads.push(...mapThreadListResponse(response));
    cursor = response.nextCursor;
  } while (cursor !== null);

  return threads;
}

export function mapCodexSessionsToThreads(sessions: ReadonlyArray<CodexSessionSummaryOutput>): ReadonlyArray<ThreadSummary> {
  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    branch: null,
    cwd: session.cwd,
    archived: false,
    updatedAt: session.updatedAt,
    source: "codexData",
    status: "notLoaded",
    activeFlags: [],
    queuedCount: 0
  }));
}

export function mergeThreadCatalogs(
  primary: ReadonlyArray<ThreadSummary>,
  secondary: ReadonlyArray<ThreadSummary>
): ReadonlyArray<ThreadSummary> {
  const merged = new Map<string, ThreadSummary>();
  for (const thread of [...primary, ...secondary]) {
    const existing = merged.get(thread.id);
    if (existing === undefined) {
      merged.set(thread.id, thread);
      continue;
    }
    merged.set(thread.id, mergeThreadSummary(existing, thread));
  }
  return [...merged.values()];
}
