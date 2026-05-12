import { parseFileLocation, parseFileUrlLocation } from "../../../utils/fileLinks";

export type QuickPreviewFileKind = "document" | "image";

export type QuickPreviewTarget =
  | {
    readonly kind: "website";
    readonly url: string;
  }
  | {
    readonly kind: "file";
    readonly fileKind: QuickPreviewFileKind;
    readonly path: string;
    readonly name: string;
    readonly extension: string;
  };

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "md",
  "markdown",
  "odp",
  "ods",
  "odt",
  "pdf",
  "ppt",
  "pptx",
  "rtf",
  "txt",
  "xls",
  "xlsx",
]);
const TEXT_DOCUMENT_EXTENSIONS = new Set(["csv", "md", "markdown", "txt"]);
const MARKDOWN_DOCUMENT_EXTENSIONS = new Set(["md", "markdown"]);
const DOCX_DOCUMENT_EXTENSIONS = new Set(["docx"]);
const EMBEDDABLE_DOCUMENT_EXTENSIONS = new Set(["pdf"]);
const PREVIEW_EXTENSION_SOURCE = [
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
].sort((left, right) => right.length - left.length).join("|");
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const FILE_URL_PATTERN = /file:\/\/[^\s<>"'`]+/giu;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/giu;
const FILE_PATH_PATTERN = new RegExp(
  `(^|[\\s\\("'“‘：:])([^\\s\\(\\)\\[\\]\\{\\}<>"'“”‘’=]+?\\.(${PREVIEW_EXTENSION_SOURCE}))(?=$|[\\s\\)\\]\\}>,，。；;！!？?])`,
  "giu",
);
const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const TRAILING_PUNCTUATION_PATTERN = /[),，。；;！!？?\]}>]+$/u;
const LEADING_PUNCTUATION_PATTERN = /^[([{<"'“‘]+/u;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function stripFencedCodeBlocks(text: string): string {
  return text.replace(FENCED_CODE_BLOCK_PATTERN, " ");
}

function normalizeUrlCandidate(value: string): string {
  return value.trim().replace(TRAILING_PUNCTUATION_PATTERN, "");
}

function normalizeFileCandidate(value: string): string {
  let normalized = value
    .trim()
    .replace(LEADING_PUNCTUATION_PATTERN, "")
    .replace(TRAILING_PUNCTUATION_PATTERN, "");
  if (!normalized.toLowerCase().startsWith("file://") && !/^[A-Za-z]:[/\\]/.test(normalized)) {
    const colonIndex = Math.max(normalized.lastIndexOf("："), normalized.lastIndexOf(":"));
    const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    if (colonIndex > slashIndex) {
      normalized = normalized
        .slice(colonIndex + 1)
        .trim()
        .replace(LEADING_PUNCTUATION_PATTERN, "")
        .replace(TRAILING_PUNCTUATION_PATTERN, "");
    }
  }
  return normalized;
}

function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    path.startsWith("//") ||
    /^[A-Za-z]:[/\\]/.test(path)
  );
}

function joinPath(base: string, relative: string): string {
  const normalizedBase = base.replace(/[\\/]+$/, "");
  const normalizedRelative = relative.replace(/^[\\/]+/, "");
  return normalizedRelative ? `${normalizedBase}/${normalizedRelative}` : normalizedBase;
}

export function getPathExtension(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? path;
  const baseName = getPathBaseName(cleanPath);
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return "";
  }
  return baseName.slice(dotIndex + 1).toLowerCase();
}

export function getPathBaseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function getQuickPreviewFileKind(path: string): QuickPreviewFileKind | null {
  const extension = getPathExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return null;
}

export function isTextDocumentPreview(extension: string): boolean {
  return TEXT_DOCUMENT_EXTENSIONS.has(extension.toLowerCase());
}

export function isMarkdownDocumentPreview(extension: string): boolean {
  return MARKDOWN_DOCUMENT_EXTENSIONS.has(extension.toLowerCase());
}

export function isDocxDocumentPreview(extension: string): boolean {
  return DOCX_DOCUMENT_EXTENSIONS.has(extension.toLowerCase());
}

export function isEmbeddableDocumentPreview(extension: string): boolean {
  return EMBEDDABLE_DOCUMENT_EXTENSIONS.has(extension.toLowerCase());
}

export function isLocalPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return LOCAL_HOSTNAMES.has(hostname) || hostname.startsWith("127.");
  } catch {
    return false;
  }
}

export function resolveQuickPreviewFilePath(rawPath: string, workspacePath: string | null): string {
  const fileUrlLocation = parseFileUrlLocation(rawPath);
  const parsedPath = fileUrlLocation?.path ?? parseFileLocation(rawPath).path;
  const trimmedPath = parsedPath.trim();
  if (workspacePath === null || isAbsolutePath(trimmedPath)) {
    return trimmedPath;
  }
  return joinPath(workspacePath, trimmedPath);
}

function createFileTarget(rawPath: string, workspacePath: string | null): QuickPreviewTarget | null {
  const path = resolveQuickPreviewFilePath(rawPath, workspacePath);
  const fileKind = getQuickPreviewFileKind(path);
  if (fileKind === null) {
    return null;
  }
  return {
    kind: "file",
    fileKind,
    path,
    name: getPathBaseName(path),
    extension: getPathExtension(path).toUpperCase(),
  };
}

function createWebsiteTarget(rawUrl: string): QuickPreviewTarget | null {
  const url = normalizeUrlCandidate(rawUrl);
  if (!isLocalPreviewUrl(url)) {
    return null;
  }
  return { kind: "website", url };
}

function getTargetKey(target: QuickPreviewTarget): string {
  return target.kind === "website"
    ? `website:${target.url.toLowerCase()}`
    : `file:${target.path.replace(/\\/g, "/").toLowerCase()}`;
}

function pushUniqueTarget(
  targets: QuickPreviewTarget[],
  seen: Set<string>,
  target: QuickPreviewTarget | null,
  maxTargets: number,
): void {
  if (target === null || targets.length >= maxTargets) {
    return;
  }
  const key = getTargetKey(target);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  targets.push(target);
}

export function extractQuickPreviewTargets(
  text: string,
  workspacePath: string | null,
  maxTargets = 3,
): ReadonlyArray<QuickPreviewTarget> {
  const searchableText = stripFencedCodeBlocks(text);
  const targets: QuickPreviewTarget[] = [];
  const seen = new Set<string>();

  for (const match of searchableText.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = normalizeFileCandidate(match[1] ?? "");
    pushUniqueTarget(targets, seen, createWebsiteTarget(href), maxTargets);
    pushUniqueTarget(targets, seen, createFileTarget(href, workspacePath), maxTargets);
  }

  for (const match of searchableText.matchAll(URL_PATTERN)) {
    pushUniqueTarget(targets, seen, createWebsiteTarget(match[0]), maxTargets);
  }

  for (const match of searchableText.matchAll(FILE_URL_PATTERN)) {
    pushUniqueTarget(targets, seen, createFileTarget(match[0], workspacePath), maxTargets);
  }

  for (const match of searchableText.matchAll(FILE_PATH_PATTERN)) {
    pushUniqueTarget(targets, seen, createFileTarget(normalizeFileCandidate(match[2] ?? ""), workspacePath), maxTargets);
  }

  return targets;
}
