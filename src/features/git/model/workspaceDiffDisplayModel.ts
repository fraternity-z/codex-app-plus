import type { GitWorkspaceDiffSection } from "../../../bridge/types";
import { parsePlainTextFileDiff, parseUnifiedDiffCached, type ParsedDiffFile } from "./diffPreviewModel";

const RAW_DIFF_FALLBACK_MESSAGES = new Set([
  "当前没有可显示的差异。",
  "空文件暂时没有可显示的差异。",
  "目录变更暂不支持内联预览。",
  "该文件不是 UTF-8 文本，无法显示预览。",
]);

const DIFF_METADATA_PATTERN = /^(diff --git|index )/m;

function looksLikeUntrackedFileContent(diff: string): boolean {
  const trimmed = diff.trim();
  return trimmed.length > 0
    && !RAW_DIFF_FALLBACK_MESSAGES.has(trimmed)
    && !DIFF_METADATA_PATTERN.test(trimmed);
}

function shouldParseAsUntrackedContent(diff: string, section: GitWorkspaceDiffSection): boolean {
  return section === "untracked" && looksLikeUntrackedFileContent(diff);
}

export function parseWorkspaceDiffText(diff: string, section: GitWorkspaceDiffSection): ParsedDiffFile {
  const parsed = parseUnifiedDiffCached(diff);
  if (parsed.hunks.length > 0 || !shouldParseAsUntrackedContent(diff, section)) {
    return parsed;
  }
  return parsePlainTextFileDiff(diff, "add");
}

export function countWorkspaceDiffStats(
  diff: string,
  section: GitWorkspaceDiffSection,
): Pick<ParsedDiffFile, "additions" | "deletions"> {
  const parsed = parseWorkspaceDiffText(diff, section);
  return { additions: parsed.additions, deletions: parsed.deletions };
}
