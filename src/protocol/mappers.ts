import type { ThreadSummary } from "../domain/types";
import type { ModelListResponse } from "./generated/v2/ModelListResponse";
import type { ThreadListResponse } from "./generated/v2/ThreadListResponse";

function toIsoFromUnixSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

export function mapThreadListResponse(response: ThreadListResponse): ReadonlyArray<ThreadSummary> {
  return response.data.map((thread) => ({
    id: thread.id,
    title: thread.name ?? thread.preview,
    cwd: thread.cwd,
    archived: false,
    updatedAt: toIsoFromUnixSeconds(thread.updatedAt)
  }));
}

export function mapModelListResponse(response: ModelListResponse): ReadonlyArray<string> {
  return response.data.map((model) => model.id);
}
