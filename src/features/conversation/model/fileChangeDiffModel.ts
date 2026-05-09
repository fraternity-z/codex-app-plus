import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import { parsePlainTextFileDiff, parseUnifiedDiffCached, type ParsedDiffFile } from "../../git/model/diffPreviewModel";

type PlainTextDiffKind = "add" | "delete";

const RAW_DIFF_FALLBACK_MESSAGES = new Set([
  "当前没有可显示的差异。",
  "空文件暂时没有可显示的差异。",
  "目录变更暂不支持内联预览。",
  "该文件不是 UTF-8 文本，无法显示预览。",
]);

const DIFF_METADATA_PATTERN = /^(diff --git|index )/m;

function getPlainTextDiffKind(change: FileUpdateChange): PlainTextDiffKind | null {
  if (change.kind.type === "add") {
    return looksLikeDirectFileContent(change.diff) ? "add" : null;
  }
  if (change.kind.type === "delete") {
    return looksLikeDirectFileContent(change.diff) ? "delete" : null;
  }
  return null;
}

function looksLikeDirectFileContent(diff: string): boolean {
  const trimmed = diff.trim();
  return trimmed.length > 0
    && !RAW_DIFF_FALLBACK_MESSAGES.has(trimmed)
    && !DIFF_METADATA_PATTERN.test(trimmed);
}

export function parseFileUpdateChangeDiff(change: FileUpdateChange): ParsedDiffFile | null {
  if (change.diff.trim().length === 0) {
    return null;
  }
  const parsed = parseUnifiedDiffCached(change.diff);
  if (parsed.hunks.length > 0) {
    return parsed;
  }
  const plainTextKind = getPlainTextDiffKind(change);
  return plainTextKind === null ? parsed : parsePlainTextFileDiff(change.diff, plainTextKind);
}
