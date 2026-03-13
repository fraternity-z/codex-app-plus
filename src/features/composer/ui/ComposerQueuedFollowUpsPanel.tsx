import { getAttachmentLabel } from "../model/composerAttachments";
import type { QueuedFollowUp } from "../../../domain/timeline";
import { AttachmentClip } from "./AttachmentClip";

interface ComposerQueuedFollowUpsPanelProps {
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

export function ComposerQueuedFollowUpsPanel(props: ComposerQueuedFollowUpsPanelProps): JSX.Element | null {
  if (props.queuedFollowUps.length === 0) {
    return null;
  }

  return (
    <section className="composer-queue-panel">
      <header className="composer-queue-header">
        <strong>Queued follow-ups</strong>
        <button type="button" className="composer-queue-clear" onClick={props.onClearQueuedFollowUps}>
          清空
        </button>
      </header>
      <ul className="composer-queue-list">
        {props.queuedFollowUps.map((followUp) => (
          <li key={followUp.id} className="composer-queue-item">
            <div>
              <strong>{followUp.mode}</strong>
              {followUp.text.trim().length === 0 ? null : <p>{followUp.text}</p>}
              {followUp.attachments.length === 0 ? null : (
                <div className="composer-queue-attachments">
                  {followUp.attachments.map((attachment) => (
                    <AttachmentClip key={attachment.id} label={getAttachmentLabel(attachment)} tone={attachment.kind} />
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="composer-queue-remove" onClick={() => props.onRemoveQueuedFollowUp(followUp.id)}>
              移除
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
