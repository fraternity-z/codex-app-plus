import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AttachmentClipProps {
  readonly label: string;
  readonly tone: "image" | "file";
  readonly className?: string;
  readonly title?: string;
  readonly previewImageSrc?: string;
  readonly previewDialogLabel?: string;
  readonly previewAlt?: string;
  readonly onRemove?: () => void;
}

export function AttachmentClip(props: AttachmentClipProps): JSX.Element {
  const className = props.className === undefined
    ? `attachment-clip attachment-clip-${props.tone}`
    : `attachment-clip attachment-clip-${props.tone} ${props.className}`;
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = props.previewImageSrc !== undefined;

  useEffect(() => {
    if (!previewOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  return (
    <>
      <span className={className} title={props.title}>
        {canPreview ? (
          <button
            type="button"
            className="attachment-clip-main"
            aria-label={props.previewDialogLabel ?? props.label}
            onClick={() => setPreviewOpen(true)}
          >
            <img className="attachment-clip-thumb" src={props.previewImageSrc} alt={props.previewAlt ?? props.label} />
            <span className="attachment-clip-label">{props.label}</span>
          </button>
        ) : <span className="attachment-clip-label">{props.label}</span>}
        {props.onRemove === undefined ? null : (
          <button type="button" className="attachment-clip-remove" aria-label={`Remove ${props.label}`} onClick={props.onRemove}>
            ×
          </button>
        )}
      </span>
      {previewOpen && props.previewImageSrc !== undefined ? createPortal(
        <div className="home-assistant-transcript-image-dialog-backdrop" role="presentation" onClick={() => setPreviewOpen(false)}>
          <section
            className="home-assistant-transcript-image-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={props.previewDialogLabel ?? props.label}
          >
            <img
              className="home-assistant-transcript-image-dialog-img"
              src={props.previewImageSrc}
              alt={props.previewAlt ?? props.label}
              onClick={(event) => event.stopPropagation()}
            />
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
