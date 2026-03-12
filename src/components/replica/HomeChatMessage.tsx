import { convertFileSrc } from "@tauri-apps/api/core";
import type { ConversationAttachment, ConversationImageAttachment, ConversationMessage } from "../../domain/timeline";
import { AttachmentClip } from "./AttachmentClip";
import { ConversationMessageContent } from "./ConversationMessageContent";

interface HomeChatMessageProps {
  readonly message: ConversationMessage;
}

export function HomeChatMessage(props: HomeChatMessageProps): JSX.Element {
  const assistant = props.message.role === "assistant";
  const className = assistant ? "home-chat-message home-chat-message-assistant" : "home-chat-message home-chat-message-user";
  const stackClassName = assistant
    ? "home-chat-message-stack home-chat-message-stack-assistant"
    : "home-chat-message-stack home-chat-message-stack-user";
  const contentClassName = assistant ? "home-chat-message-body" : "home-chat-bubble";
  const markdownClassName = assistant ? "home-chat-markdown home-chat-markdown-assistant" : "home-chat-markdown home-chat-markdown-user";
  const attachments = props.message.attachments ?? [];
  const hasText = props.message.text.trim().length > 0;
  const hasContent = attachments.length > 0 || hasText;

  return (
    <article className={className} data-status={props.message.status}>
      {hasContent ? (
        <div className={stackClassName}>
          {attachments.length > 0 ? <MessageAttachmentStrip attachments={attachments} /> : null}
          {hasText ? (
            <div className={contentClassName}>
              <ConversationMessageContent className={markdownClassName} message={props.message} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MessageAttachmentStrip(props: { readonly attachments: ReadonlyArray<ConversationAttachment> }): JSX.Element {
  return (
    <div className="home-chat-attachments" aria-label="消息附件预览">
      {props.attachments.map((attachment, index) => {
        if (attachment.kind === "image") {
          return (
            <img
              key={`${attachment.source}-${index}`}
              className="home-chat-attachment-image"
              src={resolveAttachmentSource(attachment)}
              alt="用户发送的图片"
            />
          );
        }

        return (
          <AttachmentClip
            key={`${attachment.source}-${attachment.value}-${index}`}
            className="home-chat-attachment-chip"
            label={attachment.name}
            tone="file"
          />
        );
      })}
    </div>
  );
}

function resolveAttachmentSource(attachment: ConversationImageAttachment): string {
  return attachment.source === "localPath" ? convertFileSrc(attachment.value) : attachment.value;
}
