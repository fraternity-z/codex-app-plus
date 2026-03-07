import { convertFileSrc } from "@tauri-apps/api/core";
import type { ConversationImageAttachment, ConversationMessage } from "../../domain/timeline";
import { ConversationMessageContent } from "./ConversationMessageContent";

const THINKING_LABEL = "正在思考";

interface HomeChatMessageProps {
  readonly message: ConversationMessage;
  readonly showThinkingIndicator?: boolean;
}

export function HomeChatMessage(props: HomeChatMessageProps): JSX.Element {
  const assistant = props.message.role === "assistant";
  const className = assistant ? "home-chat-message home-chat-message-assistant" : "home-chat-message home-chat-message-user";
  const contentClassName = assistant ? "home-chat-message-body" : "home-chat-bubble";
  const markdownClassName = assistant ? "home-chat-markdown home-chat-markdown-assistant" : "home-chat-markdown home-chat-markdown-user";
  const attachments = props.message.attachments ?? [];
  const hasText = props.message.text.trim().length > 0;
  const showThinkingIndicator = assistant && props.showThinkingIndicator === true;

  return (
    <article className={className} data-status={props.message.status}>
      {attachments.length > 0 ? <MessageAttachmentStrip attachments={attachments} /> : null}
      {hasText ? (
        <div className={contentClassName}>
          <ConversationMessageContent className={markdownClassName} message={props.message} />
        </div>
      ) : null}
      {showThinkingIndicator ? <AssistantThinkingIndicator /> : null}
    </article>
  );
}

function AssistantThinkingIndicator(): JSX.Element {
  return (
    <div className="home-chat-thinking-footer" aria-label={THINKING_LABEL}>
      <span className="home-chat-thinking-label">{THINKING_LABEL}</span>
      <span className="home-chat-thinking-shimmer" aria-hidden="true" />
    </div>
  );
}

function MessageAttachmentStrip(props: { readonly attachments: ReadonlyArray<ConversationImageAttachment> }): JSX.Element {
  return (
    <div className="home-chat-attachments" aria-label="消息附件预览">
      {props.attachments.map((attachment, index) => (
        <img
          key={`${attachment.source}-${index}`}
          className="home-chat-attachment-image"
          src={resolveAttachmentSource(attachment)}
          alt="用户发送的图片"
        />
      ))}
    </div>
  );
}

function resolveAttachmentSource(attachment: ConversationImageAttachment): string {
  return attachment.source === "localPath" ? convertFileSrc(attachment.value) : attachment.value;
}
