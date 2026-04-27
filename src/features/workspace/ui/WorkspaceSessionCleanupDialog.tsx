import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n/useI18n";

interface WorkspaceSessionCleanupDialogProps {
  readonly rootName: string;
  readonly retentionDays: number | null;
  readonly retentionInput: string;
  readonly candidateCount: number;
  readonly error: string | null;
  readonly pending: boolean;
  readonly onChangeRetentionInput: (value: string) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void | Promise<void>;
}

export function WorkspaceSessionCleanupDialog(props: WorkspaceSessionCleanupDialogProps): JSX.Element {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = props.error === null && props.candidateCount > 0 && !props.pending;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const dialog = (
    <div className="git-dialog-backdrop workspace-session-cleanup-backdrop" role="presentation" onClick={props.pending ? undefined : props.onClose}>
      <section className="git-push-confirm-dialog workspace-session-cleanup-dialog" role="dialog" aria-modal="true" aria-label={t("home.workspaceSection.cleanupSessionsTitle")} onClick={(event) => event.stopPropagation()}>
        <header className="git-push-confirm-header">
          <div />
          <button type="button" className="git-dialog-close" onClick={props.onClose} aria-label={t("home.workspaceSection.cleanupSessionsClose")} disabled={props.pending}>×</button>
        </header>
        <form
          className="git-push-confirm-body workspace-session-cleanup-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              void props.onConfirm();
            }
          }}
        >
          <h2 className="git-push-confirm-title">{t("home.workspaceSection.cleanupSessionsTitle")}</h2>
          <p className="git-push-confirm-text">{t("home.workspaceSection.cleanupSessionsDescription", { name: props.rootName })}</p>
          <label className="workspace-session-cleanup-field">
            <span>{t("home.workspaceSection.cleanupSessionsRetentionLabel")}</span>
            <input
              ref={inputRef}
              className="git-input workspace-session-cleanup-input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={props.retentionInput}
              onChange={(event) => props.onChangeRetentionInput(event.currentTarget.value)}
              disabled={props.pending}
            />
          </label>
          {props.error !== null ? (
            <div className="workspace-session-cleanup-message workspace-session-cleanup-error" role="alert">
              {props.error}
            </div>
          ) : props.candidateCount === 0 ? (
            <div className="workspace-session-cleanup-message">{t("home.workspaceSection.cleanupSessionsEmpty")}</div>
          ) : (
            <div className="workspace-session-cleanup-message workspace-session-cleanup-warning">
              {t("home.workspaceSection.cleanupSessionsPreview", {
                count: props.candidateCount,
                days: props.retentionDays ?? 0,
              })}
            </div>
          )}
          <div className="git-commit-dialog-actions">
            <button type="button" className="git-inline-btn" onClick={props.onClose} disabled={props.pending}>{t("home.workspaceSection.cleanupSessionsCancel")}</button>
            <button type="submit" className="git-primary-btn workspace-session-cleanup-submit" disabled={!canSubmit}>
              {props.pending
                ? t("home.workspaceSection.cleaningSessions")
                : t("home.workspaceSection.cleanupSessionsConfirmAction", { count: props.candidateCount })}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
