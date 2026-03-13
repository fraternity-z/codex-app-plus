import type { TimelineEntry } from "../../../domain/timeline";

export interface ConnectionRetryInfo {
  readonly attempt: number;
  readonly total: number;
  readonly sourceEntryId: string;
  readonly text: string;
}

interface RetryLineInfo {
  readonly attempt: number;
  readonly total: number;
  readonly text: string;
}

interface ExtractConnectionRetryResult {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly retryInfo: ConnectionRetryInfo | null;
}

const RETRY_LINE_PATTERN = /^\s*reconnecting[-\s.:()\[\]\u2026\u3002\uFF0C\uFF1A]*([0-9]+)\s*[\/\\\uFF0F]\s*([0-9]+)\s*$/i;

export function extractConnectionRetryInfo(activities: ReadonlyArray<TimelineEntry>): ExtractConnectionRetryResult {
  const filtered: TimelineEntry[] = [];
  let latestInfo: ConnectionRetryInfo | null = null;

  for (const entry of activities) {
    if (entry.kind === "agentMessage") {
      const retryText = extractRetryText(entry.text);
      if (retryText.info !== null) {
        latestInfo = { ...retryText.info, sourceEntryId: entry.id };
      }
      if (retryText.text.length === 0 && retryText.info !== null) {
        continue;
      }
      if (retryText.text !== entry.text) {
        filtered.push({ ...entry, text: retryText.text });
        continue;
      }
    }
    filtered.push(entry);
  }

  return { activities: filtered, retryInfo: latestInfo };
}

export function stripConnectionRetryLines(text: string): string {
  return extractRetryText(text).text;
}

function extractRetryText(text: string): { readonly text: string; readonly info: RetryLineInfo | null } {
  const keptLines: string[] = [];
  let latestInfo: RetryLineInfo | null = null;

  for (const line of text.split(/\r?\n/)) {
    const info = parseRetryLine(line);
    if (info === null) {
      keptLines.push(line);
      continue;
    }
    latestInfo = info;
  }

  return {
    text: normalizeRetainedText(keptLines),
    info: latestInfo,
  };
}

function parseRetryLine(line: string): RetryLineInfo | null {
  const match = line.match(RETRY_LINE_PATTERN);
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
    text: line.trim(),
  };
}

function normalizeRetainedText(lines: ReadonlyArray<string>): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
