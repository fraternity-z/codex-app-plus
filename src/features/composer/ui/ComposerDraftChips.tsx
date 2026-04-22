import { convertFileSrc } from "@tauri-apps/api/core";
import type { ComposerAttachment } from "../../../domain/timeline";
import { useI18n } from "../../../i18n/useI18n";
import { getAttachmentLabel } from "../model/composerAttachments";
import { getComposerFileReferenceLabel } from "../model/composerFileReferences";
import { AttachmentClip } from "./AttachmentClip";

interface ComposerDraftChipsProps {
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly filePaths: ReadonlyArray<string>;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onRemoveFilePath: (path: string) => void;
}

export function ComposerDraftChips(props: ComposerDraftChipsProps): JSX.Element | null {
  const { t } = useI18n();

  if (props.attachments.length === 0 && props.filePaths.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachment-draft" aria-label="Attached files and images">
      {props.attachments.map((attachment) => (
        <AttachmentClip
          key={attachment.id}
          label={getAttachmentLabel(attachment)}
          tone={attachment.kind}
          previewImageSrc={resolveAttachmentPreviewSource(attachment)}
          previewDialogLabel={t("home.conversation.generatedImage.previewDialog")}
          previewAlt={t("home.conversation.generatedImage.alt")}
          onRemove={() => props.onRemoveAttachment(attachment.id)}
        />
      ))}
      {props.filePaths.map((path) => (
        <AttachmentClip
          key={path}
          label={getComposerFileReferenceLabel(path)}
          title={path}
          tone="file"
          onRemove={() => props.onRemoveFilePath(path)}
        />
      ))}
    </div>
  );
}

function resolveAttachmentPreviewSource(attachment: ComposerAttachment): string | undefined {
  if (attachment.kind !== "image") {
    return undefined;
  }

  if (attachment.source === "localImage") {
    return convertFileSrc(attachment.value);
  }

  return attachment.value;
}
