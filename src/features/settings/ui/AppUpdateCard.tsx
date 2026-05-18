import type { AppUpdateState } from "../../../domain/types";
import { useI18n } from "../../../i18n";

const BYTES_PER_KIB = 1_024;
const BYTES_PER_MIB = 1_048_576;

interface AppUpdateCardProps {
  readonly appUpdate: AppUpdateState;
  onCheckForAppUpdate: () => Promise<void>;
  onInstallAppUpdate: () => Promise<void>;
}

function formatBytes(value: number): string {
  if (value >= BYTES_PER_MIB) {
    return `${(value / BYTES_PER_MIB).toFixed(1)} MB`;
  }
  if (value >= BYTES_PER_KIB) {
    return `${Math.round(value / BYTES_PER_KIB)} KB`;
  }
  return `${value} B`;
}

function formatCheckedAt(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createStatusDescription(appUpdate: AppUpdateState, t: ReturnType<typeof useI18n>["t"]): string {
  if (appUpdate.status === "checking") {
    return t("settings.general.appUpdate.statusChecking");
  }
  if (appUpdate.status === "downloading" && appUpdate.nextVersion !== null) {
    return t("settings.general.appUpdate.statusDownloading", { version: appUpdate.nextVersion });
  }
  if (appUpdate.status === "downloaded" && appUpdate.nextVersion !== null) {
    return t("settings.general.appUpdate.statusDownloaded", { version: appUpdate.nextVersion });
  }
  if (appUpdate.status === "installing") {
    return t("settings.general.appUpdate.statusInstalling");
  }
  if (appUpdate.status === "disabled") {
    return t("settings.general.appUpdate.statusDisabled");
  }
  if (appUpdate.status === "upToDate") {
    return t("settings.general.appUpdate.statusUpToDate");
  }
  if (appUpdate.status === "error") {
    return t("settings.general.appUpdate.statusError");
  }
  return t("settings.general.appUpdate.statusIdle");
}

function createProgressLabel(appUpdate: AppUpdateState, t: ReturnType<typeof useI18n>["t"]): string | null {
  if (appUpdate.status !== "downloading") {
    return null;
  }
  if (appUpdate.totalBytes === null) {
    return t("settings.general.appUpdate.progressUnknown", {
      downloaded: formatBytes(appUpdate.downloadedBytes),
    });
  }
  return t("settings.general.appUpdate.progressKnown", {
    downloaded: formatBytes(appUpdate.downloadedBytes),
    total: formatBytes(appUpdate.totalBytes),
  });
}

function StatusActions(props: AppUpdateCardProps): JSX.Element {
  const { t } = useI18n();
  const checkBusy = props.appUpdate.status === "checking" || props.appUpdate.status === "downloading" || props.appUpdate.status === "installing";
  const updateDisabled = props.appUpdate.status === "disabled";
  const installVisible = props.appUpdate.status === "downloaded";
  return (
    <div className="app-update-actions">
      <button
        type="button"
        className="settings-action-btn"
        disabled={checkBusy || updateDisabled}
        onClick={() => void props.onCheckForAppUpdate()}
      >
        {updateDisabled
          ? t("settings.general.appUpdate.disabledAction")
          : checkBusy
            ? t("settings.general.appUpdate.checkingAction")
            : t("settings.general.appUpdate.checkAction")}
      </button>
      {installVisible ? (
        <button
          type="button"
          className="settings-action-btn settings-action-btn-primary"
          onClick={() => void props.onInstallAppUpdate()}
        >
          {t("settings.general.appUpdate.installAction")}
        </button>
      ) : null}
    </div>
  );
}

export function AppUpdateCard(props: AppUpdateCardProps): JSX.Element {
  const { t } = useI18n();
  const checkedAt = formatCheckedAt(props.appUpdate.lastCheckedAt);
  const progressLabel = createProgressLabel(props.appUpdate, t);
  const progressPercent = props.appUpdate.progressPercent === null ? null : Math.round(props.appUpdate.progressPercent * 100);

  return (
    <section className="settings-card app-update-card">
      <div className="settings-section-head app-update-head">
        <div className="app-update-head-copy">
          <strong>{t("settings.general.appUpdate.title")}</strong>
          <p>{t("settings.general.appUpdate.description")}</p>
        </div>
        <span className="settings-chip app-update-version-chip">
          {t("settings.general.appUpdate.currentVersion", {
            version: props.appUpdate.currentVersion ?? t("settings.general.appUpdate.currentVersionUnknown"),
          })}
        </span>
      </div>
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>{t("settings.general.appUpdate.statusLabel")}</strong>
          <p>{createStatusDescription(props.appUpdate, t)}</p>
          {checkedAt !== null ? (
            <p className="settings-row-note">{t("settings.general.appUpdate.lastCheckedAt", { time: checkedAt })}</p>
          ) : null}
          {props.appUpdate.error !== null ? (
            <p className="settings-status-note settings-status-note-error">
              {t("settings.general.appUpdate.errorMessage", { message: props.appUpdate.error })}
            </p>
          ) : null}
        </div>
        <div className="settings-row-control">
          <StatusActions {...props} />
        </div>
      </div>
      {progressLabel !== null ? (
        <div className="app-update-progress-wrap">
          <div className="app-update-progress-meta">
            <span>{progressLabel}</span>
            <span>{progressPercent === null ? "..." : `${progressPercent}%`}</span>
          </div>
          <div className="app-update-progress-bar" aria-hidden="true">
            <span
              className="app-update-progress-fill"
              style={{ width: progressPercent === null ? "16%" : `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      {props.appUpdate.notes !== null && props.appUpdate.notes.trim().length > 0 ? (
        <div className="app-update-notes">
          <strong>{t("settings.general.appUpdate.notesLabel")}</strong>
          <pre>{props.appUpdate.notes}</pre>
        </div>
      ) : null}
    </section>
  );
}
