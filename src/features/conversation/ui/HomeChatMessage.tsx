import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ConversationAttachment, ConversationImageAttachment, ConversationMessage } from "../../../domain/timeline";
import { useI18n } from "../../../i18n";
import { AttachmentClip } from "../../composer/ui/AttachmentClip";
import { ConversationMessageContent } from "./ConversationMessageContent";
import { HomeImagePreviewDialog } from "./HomeImagePreviewDialog";

interface HomeChatMessageProps {
  readonly message: ConversationMessage;
  readonly copied?: boolean;
  readonly canEdit?: boolean;
  readonly onCopyMessage?: (message: ConversationMessage) => void;
  readonly onEditUserMessage?: (message: ConversationMessage, text: string) => Promise<void>;
}

export function HomeChatMessage(props: HomeChatMessageProps): JSX.Element {
  const { t } = useI18n();
  const assistant = props.message.role === "assistant";
  const className = assistant ? "home-chat-message home-chat-message-assistant" : "home-chat-message home-chat-message-user";
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(props.message.text);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canEdit = !assistant && props.canEdit === true && props.message.turnId !== null && props.onEditUserMessage !== undefined;
  const stackClassName = [
    "home-chat-message-stack",
    assistant ? "home-chat-message-stack-assistant" : "home-chat-message-stack-user",
    editing ? "home-chat-message-stack-editing" : "",
  ].filter(Boolean).join(" ");
  const contentClassName = assistant ? "home-chat-message-body" : "home-chat-bubble";
  const markdownClassName = assistant ? "home-chat-markdown home-chat-markdown-assistant" : "home-chat-markdown home-chat-markdown-user";
  const attachments = props.message.attachments ?? [];
  const hasText = props.message.text.trim().length > 0;
  const hasContent = attachments.length > 0 || hasText;
  const canSubmitEdit = draftText.trim().length > 0 || attachments.length > 0;

  useEffect(() => {
    setEditing(false);
    setSubmitting(false);
    setDraftText(props.message.text);
  }, [props.message.id, props.message.text]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  const submitEdit = async () => {
    if (!canEdit || !canSubmitEdit || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await props.onEditUserMessage?.(props.message, draftText);
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className={className} data-status={props.message.status}>
      {hasContent ? (
        <div className={stackClassName}>
          {attachments.length > 0 ? <MessageAttachmentStrip attachments={attachments} /> : null}
          {editing ? (
            <div className="home-chat-message-editor">
              <textarea
                ref={textareaRef}
                className="home-chat-message-editor-input"
                value={draftText}
                rows={3}
                onChange={(event) => setDraftText(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submitEdit();
                  }
                }}
              />
              <div className="home-chat-message-editor-actions">
                <button type="button" className="home-chat-message-editor-button" disabled={submitting} onClick={() => setEditing(false)}>
                  {t("app.conversation.cancelEdit")}
                </button>
                <button type="button" className="home-chat-message-editor-button home-chat-message-editor-button-primary" disabled={!canSubmitEdit || submitting} onClick={() => void submitEdit()}>
                  {t("app.conversation.sendEdit")}
                </button>
              </div>
            </div>
          ) : <>
            {hasText ? (
              <div className={contentClassName}>
                <ConversationMessageContent className={markdownClassName} message={props.message} />
              </div>
            ) : null}
            <HomeChatMessageActions
              assistant={assistant}
              copied={props.copied === true}
              canEdit={canEdit}
              labels={{
                copy: t("app.conversation.copyMessage"),
                copied: t("app.conversation.messageCopied"),
                edit: t("app.conversation.editMessage"),
              }}
              onCopy={props.onCopyMessage === undefined ? undefined : () => props.onCopyMessage?.(props.message)}
              onEdit={canEdit ? () => setEditing(true) : undefined}
            />
          </>}
        </div>
      ) : null}
    </article>
  );
}

export function HomeChatMessageActions(props: {
  readonly assistant: boolean;
  readonly copied: boolean;
  readonly canEdit: boolean;
  readonly labels: {
    readonly copy: string;
    readonly copied: string;
    readonly edit: string;
  };
  readonly onCopy?: () => void;
  readonly onEdit?: () => void;
}): JSX.Element | null {
  if (props.onCopy === undefined && !props.canEdit) {
    return null;
  }

  return (
    <div className="home-chat-message-actions">
      {props.onCopy === undefined ? null : (
        <button
          type="button"
          className={`home-chat-message-action${props.copied ? " is-copied" : ""}`}
          onClick={props.onCopy}
          aria-label={props.copied ? props.labels.copied : props.labels.copy}
          title={props.copied ? props.labels.copied : props.labels.copy}
        >
          <CopyActionIcon />
        </button>
      )}
      {!props.assistant && props.canEdit && props.onEdit !== undefined ? (
        <button
          type="button"
          className="home-chat-message-action"
          onClick={props.onEdit}
          aria-label={props.labels.edit}
          title={props.labels.edit}
        >
          <EditActionIcon />
        </button>
      ) : null}
    </div>
  );
}

function CopyActionIcon(): JSX.Element {
  return <span className="home-chat-message-action-icon home-chat-message-action-icon-copy" aria-hidden="true" />;
}

function EditActionIcon(): JSX.Element {
  return (
    <svg className="home-chat-message-action-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M5 14.8 5.7 11.6 12.9 4.4a2 2 0 0 1 2.8 2.8L8.5 14.4 5 14.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M11.7 5.6 14.5 8.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MessageAttachmentStrip(props: { readonly attachments: ReadonlyArray<ConversationAttachment> }): JSX.Element {
  const { t } = useI18n();
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  return (
    <>
      <div className="home-chat-attachments" aria-label={t("home.conversation.userImage.attachmentsLabel")}>
        {props.attachments.map((attachment, index) => {
          if (attachment.kind === "image") {
            const imageSrc = resolveAttachmentSource(attachment);
            return (
              <button
                key={`${attachment.source}-${index}`}
                type="button"
                className="home-chat-attachment-image-button"
                aria-label={t("home.conversation.userImage.openPreview")}
                onClick={() => setPreviewImageSrc(imageSrc)}
              >
                <img
                  className="home-chat-attachment-image"
                  src={imageSrc}
                  alt={t("home.conversation.userImage.alt")}
                />
              </button>
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
      {previewImageSrc === null ? null : (
        <HomeImagePreviewDialog
          src={previewImageSrc}
          alt={t("home.conversation.userImage.alt")}
          dialogLabel={t("home.conversation.userImage.previewDialog")}
          closeLabel={t("home.conversation.userImage.closePreview")}
          onClose={() => setPreviewImageSrc(null)}
        />
      )}
    </>
  );
}

function resolveAttachmentSource(attachment: ConversationImageAttachment): string {
  return attachment.source === "localPath" ? convertFileSrc(attachment.value) : attachment.value;
}
