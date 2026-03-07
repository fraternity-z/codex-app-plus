import type { ConversationImageAttachment } from "../domain/timeline";
import type { UserInput } from "../protocol/generated/v2/UserInput";

const EMPTY_TEXT = "";
const IMAGE_DATA_URL_PATTERN = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
const MULTI_BREAK_PATTERN = /\n{3,}/g;
const SPACE_BEFORE_BREAK_PATTERN = /[ \t]+\n/g;

interface TextWithAttachments {
  readonly text: string;
  readonly attachments: ReadonlyArray<ConversationImageAttachment>;
}

export function summarizeUserInputs(content: ReadonlyArray<UserInput>): TextWithAttachments {
  const attachments: Array<ConversationImageAttachment> = [];
  const textParts: Array<string> = [];

  for (const input of content) {
    if (input.type === "text") {
      const summary = extractImageAttachmentsFromText(input.text);
      attachments.push(...summary.attachments);
      if (summary.text.length > 0) {
        textParts.push(summary.text);
      }
      continue;
    }
    if (input.type === "image") {
      attachments.push({ kind: "image", source: isImageDataUrl(input.url) ? "dataUrl" : "url", value: input.url });
      continue;
    }
    if (input.type === "localImage") {
      attachments.push({ kind: "image", source: "localPath", value: input.path });
    }
  }

  return { text: compactUserText(textParts.join("\n")), attachments };
}

export function extractImageAttachmentsFromText(text: string): TextWithAttachments {
  const attachments: Array<ConversationImageAttachment> = [];
  const nextText = text.replace(IMAGE_DATA_URL_PATTERN, (match) => {
    attachments.push({ kind: "image", source: "dataUrl", value: match });
    return EMPTY_TEXT;
  });
  return { text: compactUserText(nextText), attachments };
}

function compactUserText(text: string): string {
  return text.replace(SPACE_BEFORE_BREAK_PATTERN, "\n").replace(MULTI_BREAK_PATTERN, "\n\n").trim();
}

function isImageDataUrl(value: string): boolean {
  return value.startsWith("data:image/");
}
