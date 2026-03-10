import type { ComposerAttachment, ConversationAttachment, ConversationImageAttachment } from "../domain/timeline";
import type { TextElement } from "../protocol/generated/v2/TextElement";
import type { UserInput } from "../protocol/generated/v2/UserInput";

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
const NAMELESS_PATH_LABEL = "file";
const TEXT_ELEMENTS: Array<TextElement> = [];

interface ClipboardImageReadResult {
  readonly dataUrl: string;
  readonly name: string;
}

export function buildComposerUserInputs(
  text: string,
  attachments: ReadonlyArray<ComposerAttachment>,
): Array<UserInput> {
  const inputs: Array<UserInput> = [];
  const trimmedText = text.trim();

  if (trimmedText.length > 0) {
    inputs.push({ type: "text", text: trimmedText, text_elements: TEXT_ELEMENTS });
  }

  for (const attachment of attachments) {
    if (attachment.source === "localImage") {
      inputs.push({ type: "localImage", path: attachment.value });
      continue;
    }
    if (attachment.source === "dataUrl") {
      inputs.push({ type: "image", url: attachment.value });
      continue;
    }
    inputs.push({ type: "mention", name: attachment.name, path: attachment.value });
  }

  return inputs;
}

export function createComposerAttachmentsFromPaths(paths: ReadonlyArray<string>): ReadonlyArray<ComposerAttachment> {
  return paths.map(createComposerAttachmentFromPath);
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
