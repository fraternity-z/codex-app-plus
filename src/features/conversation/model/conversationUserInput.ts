import type { ConversationAttachment, ConversationImageAttachment } from "../../../domain/timeline";
import type { UserInput } from "../../../protocol/generated/v2/UserInput";
import {
  createConversationFileAttachment,
  createConversationImageAttachment,
} from "../../composer/model/composerAttachments";
import {
  getComposerFileReferenceLabel,
  parseComposerFileReferenceDraft,
} from "../../composer/model/composerFileReferences";

const EMPTY_TEXT = "";
const IMAGE_DATA_URL_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
const MULTI_BREAK_PATTERN = /\n{3,}/g;
const SPACE_BEFORE_BREAK_PATTERN = /[ \t]+\n/g;

interface TextWithAttachments {
  readonly text: string;
  readonly attachments: ReadonlyArray<ConversationAttachment>;
}

export function summarizeUserInputs(content: ReadonlyArray<UserInput>): TextWithAttachments {
  const attachments: Array<ConversationAttachment> = [];
  const textParts: Array<string> = [];
  const explicitFilePaths = collectExplicitFilePaths(content);

  for (const input of content) {
    if (input.type === "text") {
      const summary = extractEmbeddedUserAttachmentsFromText(input.text, explicitFilePaths);
      attachments.push(...summary.attachments);
      if (summary.text.length > 0) {
        textParts.push(summary.text);
      }
      continue;
    }
    if (input.type === "image") {
      attachments.push(createConversationImageAttachment(isImageDataUrl(input.url) ? "dataUrl" : "url", input.url));
      continue;
    }
    if (input.type === "localImage") {
      attachments.push(createConversationImageAttachment("localPath", input.path));
      continue;
    }
    if (input.type === "mention") {
      attachments.push(createConversationFileAttachment(input.name, input.path));
    }
  }

  return { text: compactUserText(textParts.join("\n")), attachments };
}

export function extractImageAttachmentsFromText(text: string): TextWithAttachments {
  const attachments: Array<ConversationImageAttachment> = [];
  const nextText = text.replace(IMAGE_DATA_URL_PATTERN, (match) => {
    attachments.push(createConversationImageAttachment("dataUrl", match));
    return EMPTY_TEXT;
  });
  return { text: compactUserText(nextText), attachments };
}

export function extractEmbeddedUserAttachmentsFromText(
  text: string,
  explicitFilePaths: ReadonlyArray<string> = [],
): TextWithAttachments {
  const draft = parseComposerFileReferenceDraft(text);
  const fileAttachments = draft.filePaths.map((path) =>
    createConversationFileAttachment(getComposerFileReferenceLabel(path), path),
  );
  const imageSummary = extractImageAttachmentsFromText(draft.bodyText);
  const cleanedText = stripExplicitFilePathLines(imageSummary.text, [...explicitFilePaths, ...draft.filePaths]);

  return {
    text: cleanedText,
    attachments: [...fileAttachments, ...imageSummary.attachments],
  };
}

function compactUserText(text: string): string {
  return text.replace(SPACE_BEFORE_BREAK_PATTERN, "\n").replace(MULTI_BREAK_PATTERN, "\n\n").trim();
}

function isImageDataUrl(value: string): boolean {
  return value.startsWith("data:image/");
}

function collectExplicitFilePaths(content: ReadonlyArray<UserInput>): ReadonlyArray<string> {
  return content.flatMap((input) => input.type === "mention" ? [input.path] : []);
}

function stripExplicitFilePathLines(text: string, filePaths: ReadonlyArray<string>): string {
  if (filePaths.length === 0) {
    return compactUserText(text);
  }

  const normalizedPaths = new Set(filePaths.map((path) => normalizeFileReferenceLine(path)));
  const retainedLines = text
    .split("\n")
    .filter((line) => !normalizedPaths.has(normalizeFileReferenceLine(line)));

  return compactUserText(retainedLines.join("\n"));
}

function normalizeFileReferenceLine(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) {
    return trimmedValue.slice(1, -1).trim();
  }
  return trimmedValue;
}
