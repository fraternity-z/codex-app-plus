import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";

const FILE_REFERENCE_MARKER_PREFIX = "<!--codex-file-ref:";
const FILE_REFERENCE_MARKER_SUFFIX = "-->";
const WINDOWS_SEPARATOR = /\\/g;

export interface ComposerFileReferenceDraft {
  readonly bodyText: string;
  readonly filePaths: ReadonlyArray<string>;
}

export function parseComposerFileReferenceDraft(inputText: string): ComposerFileReferenceDraft {
  const bodyLines: Array<string> = [];
  const filePaths: Array<string> = [];

  for (const line of inputText.split("\n")) {
    const filePath = decodeComposerFileReferenceMarker(line);
    if (filePath === null) {
      bodyLines.push(line);
      continue;
    }
    filePaths.push(filePath);
  }

  return {
    bodyText: trimTrailingBlankLines(bodyLines).join("\n"),
    filePaths: uniqueFilePaths(filePaths),
  };
}

export function serializeComposerFileReferenceDraft(
  bodyText: string,
  filePaths: ReadonlyArray<string>,
): string {
  const trimmedBodyText = bodyText.trimEnd();
  const serializedMarkers = uniqueFilePaths(filePaths).map(encodeComposerFileReferenceMarker);
  if (serializedMarkers.length === 0) {
    return trimmedBodyText;
  }
  if (trimmedBodyText.length === 0) {
    return serializedMarkers.join("\n");
  }
  return `${trimmedBodyText}\n${serializedMarkers.join("\n")}`;
}

export function expandComposerFileReferenceDraft(inputText: string): string {
  const draft = parseComposerFileReferenceDraft(inputText);
  if (draft.filePaths.length === 0) {
    return draft.bodyText;
  }
  if (draft.bodyText.length === 0) {
    return draft.filePaths.join("\n");
  }
  return `${draft.bodyText}\n\n${draft.filePaths.join("\n")}`;
}

export function appendComposerFileReferencePaths(
  inputText: string,
  filePaths: ReadonlyArray<string>,
): string {
  const draft = parseComposerFileReferenceDraft(inputText);
  return serializeComposerFileReferenceDraft(
    draft.bodyText,
    [...draft.filePaths, ...filePaths],
  );
}

export function removeComposerFileReferencePath(inputText: string, filePath: string): string {
  const draft = parseComposerFileReferenceDraft(inputText);
  return serializeComposerFileReferenceDraft(
    draft.bodyText,
    draft.filePaths.filter((currentPath) => currentPath !== filePath),
  );
}

export function getComposerFileReferenceLabel(path: string): string {
  const normalizedPath = normalizeReferencePath(path);
  const parts = normalizedPath.split("/").filter((part) => part.length > 0);
  return parts.at(-1) ?? normalizedPath;
}

export function toComposerFileReferencePath(path: string, selectedRootPath: string | null): string {
  const resolvedPath = normalizeReferencePath(resolveAgentWorkspacePath(path, "windowsNative"));
  if (selectedRootPath === null) {
    return resolvedPath;
  }

  const resolvedRootPath = normalizeReferencePath(resolveAgentWorkspacePath(selectedRootPath, "windowsNative"));
  const normalizedRootPath = normalizeReferencePathForComparison(resolvedRootPath);
  const normalizedPath = normalizeReferencePathForComparison(resolvedPath);
  const rootPrefix = `${normalizedRootPath}/`;

  if (normalizedPath === normalizedRootPath) {
    return getComposerFileReferenceLabel(resolvedPath);
  }
  if (normalizedPath.startsWith(rootPrefix)) {
    return resolvedPath.slice(resolvedRootPath.length + 1);
  }
  return resolvedPath;
}

function encodeComposerFileReferenceMarker(path: string): string {
  return `${FILE_REFERENCE_MARKER_PREFIX}${encodeTextAsBase64(path)}${FILE_REFERENCE_MARKER_SUFFIX}`;
}

function decodeComposerFileReferenceMarker(line: string): string | null {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith(FILE_REFERENCE_MARKER_PREFIX) || !trimmedLine.endsWith(FILE_REFERENCE_MARKER_SUFFIX)) {
    return null;
  }

  const encodedPath = trimmedLine.slice(
    FILE_REFERENCE_MARKER_PREFIX.length,
    trimmedLine.length - FILE_REFERENCE_MARKER_SUFFIX.length,
  );
  return decodeTextFromBase64(encodedPath);
}

function encodeTextAsBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeTextFromBase64(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function trimTrailingBlankLines(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  const nextLines = [...lines];
  while (nextLines.length > 0 && nextLines[nextLines.length - 1]?.trim().length === 0) {
    nextLines.pop();
  }
  return nextLines;
}

function uniqueFilePaths(filePaths: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(filePaths.map((path) => path.trim()).filter((path) => path.length > 0))];
}

function normalizeReferencePath(path: string): string {
  return path.trim().replace(WINDOWS_SEPARATOR, "/");
}

function normalizeReferencePathForComparison(path: string): string {
  return normalizeReferencePath(path).toLowerCase();
}
