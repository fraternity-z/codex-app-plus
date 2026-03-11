import type { TimelineEntry } from "../../domain/timeline";

export interface ConnectionRetryInfo {
  readonly attempt: number;
  readonly total: number;
  readonly sourceEntryId: string;
  readonly text: string;
}

interface ExtractConnectionRetryResult {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly retryInfo: ConnectionRetryInfo | null;
}

const RETRY_PATTERN = /reconnecting[-\s.:()\[\]\u2026\u3002\uFF0C\uFF1A]*([0-9]+)\s*[\/\\\uFF0F]\s*([0-9]+)/i;

export function extractConnectionRetryInfo(activities: ReadonlyArray<TimelineEntry>): ExtractConnectionRetryResult {
  const filtered: TimelineEntry[] = [];
  let latestInfo: ConnectionRetryInfo | null = null;

  for (const entry of activities) {
    if (entry.kind === "agentMessage") {
      const info = parseRetryInfo(entry);
      if (info !== null) {
        latestInfo = info;
        continue;
      }
    }
    filtered.push(entry);
  }

  return { activities: filtered, retryInfo: latestInfo };
}

function parseRetryInfo(entry: Extract<TimelineEntry, { kind: "agentMessage" }>): ConnectionRetryInfo | null {
  const match = entry.text.match(RETRY_PATTERN);
  if (match === null) {
    return null;
  }

  const attempt = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(attempt) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return {
    attempt: Math.max(0, attempt),
    total,
    sourceEntryId: entry.id,
    text: entry.text.trim(),
  };
}
