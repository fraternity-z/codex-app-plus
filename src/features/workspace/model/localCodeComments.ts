import type { ComposerAttachment } from "../../../domain/timeline";
import { readStoredJson, writeStoredJson } from "../../shared/utils/storageJson";

export const LOCAL_CODE_COMMENTS_STORAGE_KEY = "codex-app-plus.local-code-comments";

export interface LocalCodeComment {
  readonly id: string;
  readonly rootPath: string | null;
  readonly filePath: string;
  readonly line: number;
  readonly lineText: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface CreateLocalCodeCommentInput {
  readonly rootPath: string | null;
  readonly filePath: string;
  readonly line: number;
  readonly lineText: string;
  readonly text: string;
}

const WINDOWS_SEPARATOR = /\\/g;

export function normalizeLocalCodeCommentPath(path: string): string {
  return path.trim().replace(WINDOWS_SEPARATOR, "/").toLowerCase();
}

export function createLocalCodeComment(input: CreateLocalCodeCommentInput): LocalCodeComment {
  return {
    id: `local-comment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    rootPath: input.rootPath,
    filePath: input.filePath,
    line: input.line,
    lineText: input.lineText,
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function createLocalCodeCommentAttachment(comment: LocalCodeComment): ComposerAttachment {
  return {
    id: comment.id,
    kind: "localComment",
    source: "localCodeComment",
    value: comment.filePath,
    name: getLocalCodeCommentAttachmentLabel(1),
    line: comment.line,
    comment: comment.text,
    lineText: comment.lineText,
  };
}

export function getLocalCodeCommentAttachmentLabel(count: number): string {
  return `${count} 个评论`;
}

export function readLocalCodeComments(): ReadonlyArray<LocalCodeComment> {
  if (typeof window === "undefined") {
    return [];
  }
  return readStoredJson(LOCAL_CODE_COMMENTS_STORAGE_KEY, sanitizeLocalCodeComments, []);
}

export function writeLocalCodeComments(comments: ReadonlyArray<LocalCodeComment>): void {
  if (typeof window === "undefined") {
    return;
  }
  writeStoredJson(LOCAL_CODE_COMMENTS_STORAGE_KEY, comments);
}

function sanitizeLocalCodeComments(value: unknown): ReadonlyArray<LocalCodeComment> {
  if (!Array.isArray(value)) {
    return [];
  }
  const comments: Array<LocalCodeComment> = [];
  const seenIds = new Set<string>();
  for (const item of value) {
    const comment = sanitizeLocalCodeComment(item);
    if (comment === null || seenIds.has(comment.id)) {
      continue;
    }
    seenIds.add(comment.id);
    comments.push(comment);
  }
  return comments;
}

function sanitizeLocalCodeComment(value: unknown): LocalCodeComment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Partial<Record<keyof LocalCodeComment, unknown>>;
  if (
    typeof record.id !== "string"
    || record.id.length === 0
    || !(record.rootPath === null || typeof record.rootPath === "string")
    || typeof record.filePath !== "string"
    || record.filePath.length === 0
    || typeof record.line !== "number"
    || !Number.isInteger(record.line)
    || record.line < 1
    || typeof record.lineText !== "string"
    || typeof record.text !== "string"
    || record.text.trim().length === 0
    || typeof record.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    rootPath: record.rootPath,
    filePath: record.filePath,
    line: record.line,
    lineText: record.lineText,
    text: record.text.trim(),
    createdAt: record.createdAt,
  };
}
