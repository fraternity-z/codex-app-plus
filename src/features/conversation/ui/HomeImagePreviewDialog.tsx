import { useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

interface HomeImagePreviewDialogProps {
  readonly src: string;
  readonly alt: string;
  readonly dialogLabel: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly onContextMenu?: (event: ReactMouseEvent) => void;
}

export function HomeImagePreviewDialog(props: HomeImagePreviewDialogProps): JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  return createPortal(
    <div className="home-assistant-transcript-image-dialog-backdrop" role="presentation" onClick={props.onClose}>
      <section className="home-assistant-transcript-image-dialog" role="dialog" aria-modal="true" aria-label={props.dialogLabel}>
        <button type="button" className="home-assistant-transcript-image-dialog-close" onClick={props.onClose} aria-label={props.closeLabel}>×</button>
        <img
          className="home-assistant-transcript-image-dialog-img"
          src={props.src}
          alt={props.alt}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={props.onContextMenu}
        />
      </section>
    </div>,
    document.body,
  );
}
