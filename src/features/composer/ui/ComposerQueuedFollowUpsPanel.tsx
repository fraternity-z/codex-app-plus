import { useEffect, useRef, useState } from "react";
import type { QueuedFollowUp } from "../../../domain/timeline";
import { useI18n } from "../../../i18n/useI18n";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { getAttachmentLabel } from "../model/composerAttachments";
import { AttachmentClip } from "./AttachmentClip";

interface ComposerQueuedFollowUpsPanelProps {
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly interruptPending: boolean;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => void;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

export function ComposerQueuedFollowUpsPanel(props: ComposerQueuedFollowUpsPanelProps): JSX.Element | null {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const previousCountRef = useRef(props.queuedFollowUps.length);

  useEffect(() => {
    const previousCount = previousCountRef.current;
    const nextCount = props.queuedFollowUps.length;

    if (nextCount === 0 || previousCount === 0) {
      setCollapsed(false);
    }

    previousCountRef.current = nextCount;
  }, [props.queuedFollowUps.length]);

  if (props.queuedFollowUps.length === 0) {
    return null;
  }

  const queueTitle = t("home.composer.followUpQueue.title");

  return (
    <section className="home-turn-plan-drawer composer-queue-drawer" aria-label={queueTitle}>
      <button
        type="button"
        className="home-turn-plan-handle"
        data-expanded={collapsed ? undefined : "true"}
        onClick={() => setCollapsed((current) => !current)}
      >
        <div className="home-turn-plan-handle-info">
          <span className="home-turn-plan-title">{queueTitle}</span>
          <span className="home-turn-plan-progress">
            {t("home.composer.followUpQueue.count", { count: props.queuedFollowUps.length })}
          </span>
        </div>
        <OfficialChevronRightIcon className="home-turn-plan-handle-icon" />
      </button>
      {collapsed ? null : (
        <div className="home-turn-plan-card composer-queue-card">
          <div className="home-turn-plan-summary composer-queue-summary">
            <span>{t("home.composer.followUpQueue.autoContinue")}</span>
            <button type="button" className="composer-queue-clear" onClick={props.onClearQueuedFollowUps}>
              {t("home.composer.followUpQueue.clear")}
            </button>
          </div>
          <ol className="home-turn-plan-list">
            {props.queuedFollowUps.map((followUp, index) => (
              <li key={followUp.id} className="home-turn-plan-item composer-queue-item">
                <span className="home-turn-plan-index">{index + 1}</span>
                <div className="composer-queue-body">
                  <p className="home-turn-plan-text composer-queue-text">{getFollowUpPreview(followUp, t)}</p>
                  {followUp.attachments.length === 0 ? null : (
                    <div className="composer-queue-attachments">
                      {followUp.attachments.map((attachment) => (
                        <AttachmentClip key={attachment.id} label={getAttachmentLabel(attachment)} tone={attachment.kind} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="composer-queue-actions">
                  <button
                    type="button"
                    className="home-turn-plan-status composer-queue-promote"
                    disabled={props.interruptPending && index === 0}
                    onClick={() => props.onPromoteQueuedFollowUp(followUp.id)}
                  >
                    {t("home.composer.followUpQueue.promote")}
                  </button>
                  <button
                    type="button"
                    className="composer-queue-remove"
                    onClick={() => props.onRemoveQueuedFollowUp(followUp.id)}
                  >
                    {t("home.composer.followUpQueue.remove")}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function getFollowUpPreview(
  followUp: QueuedFollowUp,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const text = followUp.text.trim();
  if (text.length > 0) {
    return text;
  }

  const count = followUp.attachments.length;
  if (count === 1) {
    return t("home.composer.followUpQueue.includesOneAttachment");
  }
  return t("home.composer.followUpQueue.includesAttachments", { count });
}
