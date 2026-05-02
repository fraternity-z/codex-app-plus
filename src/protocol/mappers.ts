import type { AgentEnvironment } from "../bridge/types";
import type { ThreadSummary } from "../domain/types";
import type { Thread } from "./generated/v2/Thread";
import type { ModelListResponse } from "./generated/v2/ModelListResponse";
import type { ThreadListResponse } from "./generated/v2/ThreadListResponse";

interface ThreadSummaryMappingOptions {
  readonly archived: boolean;
  readonly agentEnvironment: AgentEnvironment;
}

function toIsoFromUnixSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isThreadSourceSubagent(source: Thread["source"]): boolean {
  return typeof source === "object" && source !== null && "subAgent" in source;
}

export function mapThreadListResponse(
  response: ThreadListResponse,
  options: ThreadSummaryMappingOptions
): ReadonlyArray<ThreadSummary> {
  return response.data.map((thread) => mapThreadToSummary(thread, options));
}

export function mapThreadToSummary(thread: Thread, options: ThreadSummaryMappingOptions): ThreadSummary {
  const activeFlags = thread.status.type === "active" ? thread.status.activeFlags : [];
  const isSubagent = isThreadSourceSubagent(thread.source) || hasText(thread.agentNickname) || hasText(thread.agentRole);
  const summary: ThreadSummary = {
    id: thread.id,
    title: thread.name ?? thread.preview,
    branch: thread.gitInfo?.branch ?? null,
    cwd: thread.cwd,
    archived: options.archived,
    updatedAt: toIsoFromUnixSeconds(thread.updatedAt),
    source: "rpc",
    agentEnvironment: options.agentEnvironment,
    status: thread.status.type,
    activeFlags,
    queuedCount: 0
  };
  return {
    ...summary,
    ...(isSubagent ? { isSubagent: true } : {}),
    ...(hasText(thread.agentNickname) ? { agentNickname: thread.agentNickname } : {}),
    ...(hasText(thread.agentRole) ? { agentRole: thread.agentRole } : {}),
  };
}

export function mapModelListResponse(response: ModelListResponse): ReadonlyArray<string> {
  return response.data.map((model) => model.id);
}
