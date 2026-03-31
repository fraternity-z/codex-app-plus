import type { AgentEnvironment } from "../../../bridge/types";
import type { ComposerAttachment, ConversationAttachment, ConversationImageAttachment } from "../../../domain/timeline";
import type { TextElement } from "../../../protocol/generated/v2/TextElement";
import type { UserInput } from "../../../protocol/generated/v2/UserInput";
import {
  expandComposerFileReferenceDraft,
  getComposerFileReferenceLabel,
  parseComposerFileReferenceDraft,
} from "./composerFileReferences";
import { resolveAgentWorkspacePath } from "../../workspace/model/workspacePath";

const CLIPBOARD_IMAGE_BASENAME = "image";
const DEFAULT_CLIPBOARD_EXTENSION = "png";
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "tif",
  "tiff",
  "ico",
  "avif",
  "heic",
  "heif",
]);
const WINDOWS_SEPARATOR = /\\/g;
const NAMELESS_PATH_LABEL = "file";
const TEXT_ELEMENTS: Array<TextElement> = [];
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const UNC_ABSOLUTE_PATH = /^(?:\\\\|\/\/)/;

interface ClipboardImageReadResult {
  readonly dataUrl: string;
  readonly name: string;
}

interface ComposerPathPartition {
  readonly imagePaths: ReadonlyArray<string>;
  readonly filePaths: ReadonlyArray<string>;
}

interface MentionedSkillInput {
  readonly name: string;
  readonly path: string;
}

export function buildComposerUserInputs(
  text: string,
  attachments: ReadonlyArray<ComposerAttachment>,
  agentEnvironment: AgentEnvironment,
  mentionedSkills: ReadonlyArray<MentionedSkillInput> = [],
): Array<UserInput> {
  const inputs: Array<UserInput> = [];
  const fileReferenceDraft = parseComposerFileReferenceDraft(text);
  const trimmedText = expandComposerFileReferenceDraft(text).trim();
  const mentionPaths = new Set<string>();

  if (trimmedText.length > 0) {
    inputs.push({ type: "text", text: trimmedText, text_elements: TEXT_ELEMENTS });
  }

  for (const attachment of attachments) {
    if (attachment.source === "localImage") {
      inputs.push({ type: "localImage", path: resolveAttachmentInputPath(attachment.value, agentEnvironment) });
      continue;
    }
    if (attachment.source === "dataUrl") {
      inputs.push({ type: "image", url: attachment.value });
      continue;
    }
    const attachmentPath = resolveAttachmentInputPath(attachment.value, agentEnvironment);
    if (mentionPaths.has(attachmentPath)) {
      continue;
    }
    mentionPaths.add(attachmentPath);
    inputs.push({
      type: "mention",
      name: attachment.name,
      path: attachmentPath,
    });
  }

  for (const filePath of fileReferenceDraft.filePaths) {
    if (mentionPaths.has(filePath)) {
      continue;
    }
    mentionPaths.add(filePath);
    inputs.push({
      type: "mention",
      name: getComposerFileReferenceLabel(filePath),
      path: filePath,
    });
  }

  const skillPaths = new Set<string>();
  for (const skill of mentionedSkills) {
    if (skillPaths.has(skill.path)) {
      continue;
    }
    skillPaths.add(skill.path);
    inputs.push({
      type: "skill",
      name: skill.name,
      path: skill.path,
    });
  }

  return inputs;
}

export function createComposerAttachmentsFromPaths(paths: ReadonlyArray<string>): ReadonlyArray<ComposerAttachment> {
  return paths.map(createComposerAttachmentFromPath);
}

export function partitionComposerPaths(paths: ReadonlyArray<string>): ComposerPathPartition {
  const imagePaths: Array<string> = [];
  const filePaths: Array<string> = [];

  for (const path of paths) {
    if (isImagePath(path)) {
      imagePaths.push(path);
      continue;
    }
    filePaths.push(path);
  }

  return { imagePaths, filePaths };
}

export function createConversationFileAttachment(name: string, path: string): ConversationAttachment {
  return { kind: "file", source: "mention", name, value: path };
}

export function createConversationImageAttachment(
  source: ConversationImageAttachment["source"],
  value: string,
): ConversationImageAttachment {
  return { kind: "image", source, value };
}

export function resolveMentionAttachmentPath(root: string, path: string): string {
  const normalizedPath = normalizeAttachmentPath(path);
  if (normalizedPath.length === 0) {
    throw new Error("文件提及路径为空");
  }
  if (isAbsoluteAttachmentPath(normalizedPath)) {
    return normalizedPath;
  }

  const normalizedRoot = trimTrailingPathSeparators(normalizeAttachmentPath(root));
  if (normalizedRoot.length === 0) {
    throw new Error(`文件提及根路径为空: ${path}`);
  }
  return `${normalizedRoot}/${trimLeadingPathSeparators(normalizedPath)}`;
}

export function getAttachmentLabel(
  attachment: Pick<ComposerAttachment, "kind" | "name"> | Pick<ConversationAttachment, "kind"> & { readonly name?: string },
): string {
  if (attachment.kind === "image") {
    return attachment.name ?? CLIPBOARD_IMAGE_BASENAME;
  }
  return attachment.name ?? NAMELESS_PATH_LABEL;
}

export async function readClipboardImageAttachment(file: File, index: number): Promise<ComposerAttachment> {
  const result = await readClipboardImage(file, index);
  return {
    id: createComposerAttachmentId(),
    kind: "image",
    source: "dataUrl",
    value: result.dataUrl,
    name: result.name,
  };
}

function createComposerAttachmentFromPath(path: string): ComposerAttachment {
  const name = getBaseName(path);
  if (isImagePath(path)) {
    return { id: createComposerAttachmentId(), kind: "image", source: "localImage", value: path, name };
  }
  return { id: createComposerAttachmentId(), kind: "file", source: "mention", value: path, name };
}

function createComposerAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBaseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? NAMELESS_PATH_LABEL;
}

function getExtension(value: string): string {
  const baseName = getBaseName(value);
  const extension = baseName.split(".").at(-1) ?? "";
  return extension.toLowerCase();
}

function resolveAttachmentInputPath(path: string, agentEnvironment: AgentEnvironment): string {
  return resolveAgentWorkspacePath(path, agentEnvironment);
}

function inferClipboardImageName(file: File, index: number): string {
  if (file.name.trim().length > 0) {
    return file.name;
  }

  if (index === 0) {
    return `${CLIPBOARD_IMAGE_BASENAME}.${DEFAULT_CLIPBOARD_EXTENSION}`;
  }
  return `${CLIPBOARD_IMAGE_BASENAME}-${index + 1}.${DEFAULT_CLIPBOARD_EXTENSION}`;
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path));
}

function isAbsoluteAttachmentPath(path: string): boolean {
  return path.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(path) || UNC_ABSOLUTE_PATH.test(path);
}

function normalizeAttachmentPath(path: string): string {
  return path.trim().replace(WINDOWS_SEPARATOR, "/");
}

function trimLeadingPathSeparators(path: string): string {
  return path.replace(/^\/+/, "");
}

function trimTrailingPathSeparators(path: string): string {
  if (path === "/") {
    return path;
  }
  return path.replace(/\/+$/, "");
}

function readClipboardImage(file: File, index: number): Promise<ClipboardImageReadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("读取剪贴板图片失败"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("剪贴板图片结果无效"));
        return;
      }
      resolve({ dataUrl: reader.result, name: inferClipboardImageName(file, index) });
    };

    reader.readAsDataURL(file);
  });
}
