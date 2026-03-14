import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { useI18n } from "../../../i18n";

interface GitSettingsSectionProps {
  readonly preferences: AppPreferencesController;
}

function SectionHeader(props: {
  readonly title: string;
  readonly subtitle: string;
}): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      <p className="settings-subtitle">{props.subtitle}</p>
    </header>
  );
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      onClick={props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function getBranchPreview(prefix: string): string {
  const normalizedPrefix = prefix.trim();
  return normalizedPrefix.length === 0
    ? "feature/login"
    : `${normalizedPrefix}feature/login`;
}

export function GitSettingsSection(props: GitSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const branchPreview = getBranchPreview(props.preferences.gitBranchPrefix);

  return (
    <div className="settings-panel-group">
      <SectionHeader
        title={t("settings.git.title")}
        subtitle={t("settings.git.subtitle")}
      />
      <section className="settings-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("settings.git.branchPrefixLabel")}</strong>
            <p>{t("settings.git.branchPrefixDescription")}</p>
            <p className="settings-row-note">
              {t("settings.git.branchPrefixPreview", { preview: branchPreview })}
            </p>
          </div>
          <div className="settings-row-control">
            <input
              className="settings-text-input"
              aria-label={t("settings.git.branchPrefixLabel")}
              placeholder={t("settings.git.branchPrefixPlaceholder")}
              value={props.preferences.gitBranchPrefix}
              onChange={(event) => props.preferences.setGitBranchPrefix(event.currentTarget.value)}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("settings.git.forceLeaseLabel")}</strong>
            <p>{t("settings.git.forceLeaseDescription")}</p>
            <p className="settings-row-note">
              {props.preferences.gitPushForceWithLease
                ? t("settings.git.forceLeaseEnabledNote")
                : t("settings.git.forceLeaseDisabledNote")}
            </p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={props.preferences.gitPushForceWithLease}
              onToggle={() => props.preferences.setGitPushForceWithLease(!props.preferences.gitPushForceWithLease)}
            />
          </div>
        </div>
      </section>
      <p className="settings-note settings-note-pad">{t("settings.git.appScopeNote")}</p>
    </div>
  );
}
