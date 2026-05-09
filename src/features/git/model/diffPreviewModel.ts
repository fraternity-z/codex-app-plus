const HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;
const VISIBLE_CONTEXT_LINES = 3;
const PARSED_DIFF_CACHE_LIMIT = 200;
const parsedDiffCache = new Map<string, ParsedDiffFile>();

type DiffLineKind = "add" | "context" | "delete" | "meta";
type PlainTextDiffKind = "add" | "delete";

export interface ParsedDiffLine {
  readonly kind: DiffLineKind;
  readonly content: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export interface ParsedDiffHunk {
  readonly header: string;
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly sectionTitle: string;
  readonly lines: ReadonlyArray<ParsedDiffLine>;
}

export interface ParsedDiffFile {
  readonly hunks: ReadonlyArray<ParsedDiffHunk>;
  readonly additions: number;
  readonly deletions: number;
  readonly raw: string;
}

export interface CollapsedDiffRow {
  readonly kind: "collapsed";
  readonly count: number;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export type DiffDisplayRow = ParsedDiffLine | CollapsedDiffRow;

interface HunkHeader {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly sectionTitle: string;
}

interface LineCursor {
  readonly oldLine: number;
  readonly newLine: number;
}

function parseHunkHeader(line: string): HunkHeader | null {
  const match = HUNK_HEADER_PATTERN.exec(line);
  if (match === null) {
    return null;
  }
  return {
    oldStart: Number.parseInt(match[1] ?? "0", 10),
    oldCount: Number.parseInt(match[2] ?? "1", 10),
    newStart: Number.parseInt(match[3] ?? "0", 10),
    newCount: Number.parseInt(match[4] ?? "1", 10),
    sectionTitle: match[5] ?? "",
  };
}

function createDiffLine(
  kind: DiffLineKind,
  content: string,
  oldLine: number | null,
  newLine: number | null,
): ParsedDiffLine {
  return { kind, content, oldLine, newLine };
}

function splitRawLines(raw: string): ReadonlyArray<string> {
  const splitLines = raw.split(/\r?\n/);
  return raw.endsWith("\n") ? splitLines.slice(0, -1) : splitLines;
}

function parseDiffLine(
  line: string,
  cursor: LineCursor,
): { readonly nextCursor: LineCursor; readonly parsed: ParsedDiffLine } {
  if (line.startsWith("\\ ")) {
    return { nextCursor: cursor, parsed: createDiffLine("meta", line, null, null) };
  }
  const prefix = line[0] ?? "";
  const content = line.slice(1);
  if (prefix === "+") {
    return {
      nextCursor: { oldLine: cursor.oldLine, newLine: cursor.newLine + 1 },
      parsed: createDiffLine("add", content, null, cursor.newLine),
    };
  }
  if (prefix === "-") {
    return {
      nextCursor: { oldLine: cursor.oldLine + 1, newLine: cursor.newLine },
      parsed: createDiffLine("delete", content, cursor.oldLine, null),
    };
  }
  return {
    nextCursor: { oldLine: cursor.oldLine + 1, newLine: cursor.newLine + 1 },
    parsed: createDiffLine("context", prefix === " " ? content : line, cursor.oldLine, cursor.newLine),
  };
}

function pushCurrentHunk(
  hunks: ParsedDiffHunk[],
  header: string | null,
  parsedHeader: HunkHeader | null,
  lines: ParsedDiffLine[],
): void {
  if (header === null || parsedHeader === null) {
    return;
  }
  hunks.push({
    header,
    oldStart: parsedHeader.oldStart,
    oldCount: parsedHeader.oldCount,
    newStart: parsedHeader.newStart,
    newCount: parsedHeader.newCount,
    sectionTitle: parsedHeader.sectionTitle,
    lines: [...lines],
  });
}

function trimParsedDiffCache(): void {
  if (parsedDiffCache.size <= PARSED_DIFF_CACHE_LIMIT) {
    return;
  }
  const oldestKey = parsedDiffCache.keys().next().value;
  if (typeof oldestKey === "string") {
    parsedDiffCache.delete(oldestKey);
  }
}

export function parseUnifiedDiff(raw: string): ParsedDiffFile {
  const lines = splitRawLines(raw);
  const hunks: ParsedDiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  let currentHeader: string | null = null;
  let currentParsedHeader: HunkHeader | null = null;
  let currentLines: ParsedDiffLine[] = [];
  let cursor: LineCursor = { oldLine: 1, newLine: 1 };

  for (const line of lines) {
    if (line.startsWith("@@ ")) {
      pushCurrentHunk(hunks, currentHeader, currentParsedHeader, currentLines);
      currentHeader = line;
      currentParsedHeader = parseHunkHeader(line);
      currentLines = [];
      cursor = {
        oldLine: currentParsedHeader?.oldStart ?? 1,
        newLine: currentParsedHeader?.newStart ?? 1,
      };
      continue;
    }
    if (currentHeader === null) {
      continue;
    }
    const nextLine = parseDiffLine(line, cursor);
    cursor = nextLine.nextCursor;
    currentLines.push(nextLine.parsed);
    additions += nextLine.parsed.kind === "add" ? 1 : 0;
    deletions += nextLine.parsed.kind === "delete" ? 1 : 0;
  }

  pushCurrentHunk(hunks, currentHeader, currentParsedHeader, currentLines);
  return { hunks, additions, deletions, raw };
}

export function parsePlainTextFileDiff(raw: string, kind: PlainTextDiffKind): ParsedDiffFile {
  const lines = splitRawLines(raw);
  const additions = kind === "add" ? lines.length : 0;
  const deletions = kind === "delete" ? lines.length : 0;
  const oldStart = kind === "delete" ? 1 : 0;
  const oldCount = kind === "delete" ? lines.length : 0;
  const newStart = kind === "add" ? 1 : 0;
  const newCount = kind === "add" ? lines.length : 0;
  const parsedLines = lines.map((line, index) => kind === "add"
    ? createDiffLine("add", line, null, index + 1)
    : createDiffLine("delete", line, index + 1, null));
  return {
    hunks: [{
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      oldStart,
      oldCount,
      newStart,
      newCount,
      sectionTitle: "",
      lines: parsedLines,
    }],
    additions,
    deletions,
    raw,
  };
}

export function parseUnifiedDiffCached(raw: string): ParsedDiffFile {
  const cached = parsedDiffCache.get(raw);
  if (cached !== undefined) {
    parsedDiffCache.delete(raw);
    parsedDiffCache.set(raw, cached);
    return cached;
  }
  const parsed = parseUnifiedDiff(raw);
  parsedDiffCache.set(raw, parsed);
  trimParsedDiffCache();
  return parsed;
}

function createCollapsedRow(lines: ReadonlyArray<ParsedDiffLine>): CollapsedDiffRow {
  const anchor = lines[0] ?? null;
  return {
    kind: "collapsed",
    count: lines.length,
    oldLine: anchor?.oldLine ?? null,
    newLine: anchor?.newLine ?? null,
  };
}

function collapseContextSegment(
  rows: ReadonlyArray<ParsedDiffLine>,
  isLeading: boolean,
  isTrailing: boolean,
): ReadonlyArray<DiffDisplayRow> {
  if (rows.length <= VISIBLE_CONTEXT_LINES * 2) {
    return rows;
  }
  if (isLeading) {
    return [createCollapsedRow(rows.slice(0, -VISIBLE_CONTEXT_LINES)), ...rows.slice(-VISIBLE_CONTEXT_LINES)];
  }
  if (isTrailing) {
    return [...rows.slice(0, VISIBLE_CONTEXT_LINES), createCollapsedRow(rows.slice(VISIBLE_CONTEXT_LINES))];
  }
  return [
    ...rows.slice(0, VISIBLE_CONTEXT_LINES),
    createCollapsedRow(rows.slice(VISIBLE_CONTEXT_LINES, -VISIBLE_CONTEXT_LINES)),
    ...rows.slice(-VISIBLE_CONTEXT_LINES),
  ];
}

function findContextSegmentEnd(rows: ReadonlyArray<ParsedDiffLine>, startIndex: number): number {
  let index = startIndex;
  while (rows[index]?.kind === "context") {
    index += 1;
  }
  return index;
}

export function collapseDiffRows(rows: ReadonlyArray<ParsedDiffLine>): ReadonlyArray<DiffDisplayRow> {
  const collapsed: DiffDisplayRow[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (row?.kind !== "context") {
      if (row !== undefined) {
        collapsed.push(row);
      }
      index += 1;
      continue;
    }
    const segmentEnd = findContextSegmentEnd(rows, index);
    const contextRows = rows.slice(index, segmentEnd);
    collapsed.push(...collapseContextSegment(contextRows, index === 0, segmentEnd === rows.length));
    index = segmentEnd;
  }
  return collapsed;
}
