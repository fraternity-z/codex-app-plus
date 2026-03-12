import { parseUnifiedDiff } from "./git/diffPreviewModel";

const DIFF_FILE_HEADER = "diff --git ";
const RENAME_TO_PREFIX = "rename to ";
const OLD_FILE_PREFIX = "--- ";
const NEW_FILE_PREFIX = "+++ ";
const DEV_NULL_PATH = "/dev/null";
const UNKNOWN_FILE_LABEL = "未知文件";

export interface TurnDiffFileSummary {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface TurnDiffSummary {
  readonly files: ReadonlyArray<TurnDiffFileSummary>;
  readonly additions: number;
  readonly deletions: number;
}

export function parseTurnDiffSummary(diffText: string): TurnDiffSummary {
  const files = summarizeDiffSections(splitDiffSections(diffText));
  return {
    files,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  };
}

function summarizeDiffSections(sections: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<TurnDiffFileSummary> {
  const summaries = new Map<string, TurnDiffFileSummary>();
  const order: Array<string> = [];

  for (const section of sections) {
    const path = resolveSectionPath(section);
    const metrics = parseUnifiedDiff(section.join("\n"));
    const current = summaries.get(path);
    if (current === undefined) {
      order.push(path);
      summaries.set(path, { path, additions: metrics.additions, deletions: metrics.deletions });
      continue;
    }
    summaries.set(path, {
      path,
      additions: current.additions + metrics.additions,
      deletions: current.deletions + metrics.deletions,
    });
  }

  return order.map((path) => summaries.get(path)!).filter(Boolean);
}

function splitDiffSections(diffText: string): ReadonlyArray<ReadonlyArray<string>> {
  const lines = diffText.split(/\r?\n/);
  const sections: Array<Array<string>> = [];
  let currentSection: Array<string> = [];

  for (const line of lines) {
    if (line.startsWith(DIFF_FILE_HEADER) && currentSection.length > 0) {
      sections.push(currentSection);
      currentSection = [line];
      continue;
    }
    currentSection.push(line);
  }

  if (currentSection.some((line) => line.trim().length > 0)) {
    sections.push(currentSection);
  }

  return sections.filter((section) => section.some((line) => line.trim().length > 0));
}

function resolveSectionPath(section: ReadonlyArray<string>): string {
  const renamedPath = findPrefixedValue(section, RENAME_TO_PREFIX);
  if (renamedPath !== null) {
    return renamedPath;
  }

  const newPath = findPatchPath(section, NEW_FILE_PREFIX);
  if (newPath !== null && newPath !== DEV_NULL_PATH) {
    return newPath;
  }

  const oldPath = findPatchPath(section, OLD_FILE_PREFIX);
  if (oldPath !== null && oldPath !== DEV_NULL_PATH) {
    return oldPath;
  }

  const headerPath = parseDiffHeaderPath(section[0] ?? "");
  return headerPath ?? UNKNOWN_FILE_LABEL;
}

function findPatchPath(section: ReadonlyArray<string>, prefix: string): string | null {
  const rawPath = findPrefixedValue(section, prefix);
  if (rawPath === null) {
    return null;
  }
  return normalizeDiffPath(rawPath);
}

function findPrefixedValue(section: ReadonlyArray<string>, prefix: string): string | null {
  const line = section.find((entry) => entry.startsWith(prefix));
  return line === undefined ? null : line.slice(prefix.length).trim();
}

function normalizeDiffPath(rawPath: string): string {
  const trimmed = stripWrappingQuotes(rawPath);
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

function stripWrappingQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDiffHeaderPath(headerLine: string): string | null {
  if (!headerLine.startsWith(DIFF_FILE_HEADER)) {
    return null;
  }
  const matched = /^diff --git .+ b\/(.+)$/.exec(headerLine);
  return matched?.[1] ?? null;
}
