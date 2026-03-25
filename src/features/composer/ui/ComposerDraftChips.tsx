import type { ComposerAttachment } from "../../../domain/timeline";
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
