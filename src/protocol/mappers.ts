import type { ThreadSummary } from "../domain/types";
import type { Thread } from "./generated/v2/Thread";
import type { ModelListResponse } from "./generated/v2/ModelListResponse";
import type { ThreadListResponse } from "./generated/v2/ThreadListResponse";

function toIsoFromUnixSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export function mapThreadListResponse(response: ThreadListResponse): ReadonlyArray<ThreadSummary> {
  return response.data.map(mapThreadToSummary);
}

export function mapThreadToSummary(thread: Thread): ThreadSummary {
  const activeFlags = thread.status.type === "active" ? thread.status.activeFlags : [];
  return {
    id: thread.id,
    title: thread.name ?? thread.preview,
    cwd: thread.cwd,
    archived: false,
    updatedAt: toIsoFromUnixSeconds(thread.updatedAt),
    source: "rpc",
    status: thread.status.type,
    activeFlags,
    queuedCount: 0
  };
}

export function mapModelListResponse(response: ModelListResponse): ReadonlyArray<string> {
  return response.data.map((model) => model.id);
}
