import type { AgentEnvironment } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import type { CodexSessionSummaryOutput } from "../../../bridge/types";
import { mapThreadListResponse } from "../../../protocol/mappers";
import type { ThreadListParams } from "../../../protocol/generated/v2/ThreadListParams";
import type { ThreadListResponse } from "../../../protocol/generated/v2/ThreadListResponse";

const THREAD_PAGE_SIZE = 100;

function hasThreadText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createSubagentFields(
  input: Pick<CodexSessionSummaryOutput, "isSubagent" | "agentNickname" | "agentRole">,
): Pick<ThreadSummary, "isSubagent" | "agentNickname" | "agentRole"> {
  const isSubagent = input.isSubagent === true || hasThreadText(input.agentNickname) || hasThreadText(input.agentRole);
  return {
    ...(isSubagent ? { isSubagent: true } : {}),
    ...(hasThreadText(input.agentNickname) ? { agentNickname: input.agentNickname } : {}),
    ...(hasThreadText(input.agentRole) ? { agentRole: input.agentRole } : {}),
  };
}

function toUpdatedAtTimestamp(updatedAt: string): number {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mergeThreadSummary(primary: ThreadSummary, secondary: ThreadSummary): ThreadSummary {
  const agentNickname = hasThreadText(primary.agentNickname) ? primary.agentNickname : secondary.agentNickname;
  const agentRole = hasThreadText(primary.agentRole) ? primary.agentRole : secondary.agentRole;
  const isSubagent = primary.isSubagent === true
    || secondary.isSubagent === true
    || hasThreadText(agentNickname)
    || hasThreadText(agentRole);
  return {
    ...primary,
    title: hasThreadText(primary.title) ? primary.title : secondary.title,
    branch: hasThreadText(primary.branch) ? primary.branch : secondary.branch,
    cwd: hasThreadText(primary.cwd) ? primary.cwd : secondary.cwd,
    updatedAt:
      toUpdatedAtTimestamp(primary.updatedAt) >= toUpdatedAtTimestamp(secondary.updatedAt)
        ? primary.updatedAt
        : secondary.updatedAt,
    ...(isSubagent ? { isSubagent: true } : {}),
    ...(hasThreadText(agentNickname) ? { agentNickname } : {}),
    ...(hasThreadText(agentRole) ? { agentRole } : {}),
  };
}

export interface ThreadCatalogRequester {
  request: (method: "thread/list", params: ThreadListParams) => Promise<unknown>;
}

function createThreadListParams(cursor: string | null, archived: boolean): ThreadListParams {
  return {
    archived,
    cursor,
    limit: THREAD_PAGE_SIZE,
    sortKey: "updated_at"
  };
}

export async function listAllThreads(
  requester: ThreadCatalogRequester,
  agentEnvironment: AgentEnvironment,
  archived = false
): Promise<ReadonlyArray<ThreadSummary>> {
  const threads: Array<ThreadSummary> = [];
  let cursor: string | null = null;

  do {
    const response = (await requester.request("thread/list", createThreadListParams(cursor, archived))) as ThreadListResponse;
    threads.push(...mapThreadListResponse(response, { archived, agentEnvironment }));
    cursor = response.nextCursor;
  } while (cursor !== null);

  return threads;
}

export async function loadThreadCatalog(
  requester: ThreadCatalogRequester,
  listCodexSessions: () => Promise<ReadonlyArray<CodexSessionSummaryOutput>>,
  agentEnvironment: AgentEnvironment,
): Promise<ReadonlyArray<ThreadSummary>> {
  const [rpcThreads, localSessions] = await Promise.all([
    listAllThreads(requester, agentEnvironment),
    listCodexSessions(),
  ]);

  return mergeThreadCatalogs(rpcThreads, mapCodexSessionsToThreads(localSessions));
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
    ...createSubagentFields(session),
    agentEnvironment: session.agentEnvironment,
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
