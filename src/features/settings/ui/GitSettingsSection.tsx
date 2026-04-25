import type { ReactNode } from "react";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { useI18n } from "../../../i18n";

interface GitSettingsSectionProps {
  readonly preferences: AppPreferencesController;
}

function SectionHeader(props: {
  readonly title: string;
}): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
    </header>
  );
}

function ToggleSwitch(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onToggle?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.disabled ? undefined : props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function GitSettingsRow(props: {
  readonly label: string;
  readonly description: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{props.label}</strong>
        <p>{props.description}</p>
      </div>
      <div className="settings-row-control">
        {props.children}
      </div>
    </div>
  );
}

function GitSegmentedControl(props: {
  readonly value: "merge" | "squash";
  readonly options: ReadonlyArray<{
    readonly value: "merge" | "squash";
    readonly label: string;
  }>;
  readonly disabled?: boolean;
}): JSX.Element {
  return (
    <div className="settings-toggle-button-group" aria-label="Git merge method">
      {props.options.map((option) => {
        const isActive = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            className={
              isActive
                ? "settings-toggle-button settings-toggle-button-active"
                : "settings-toggle-button"
            }
            aria-pressed={isActive}
            disabled={props.disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function GitInstructionsSection(props: {
  readonly title: string;
  readonly description: string;
  readonly placeholder: string;
  readonly saveLabel: string;
}): JSX.Element {
  return (
    <section className="git-settings-instructions-section">
      <div className="git-settings-instructions-head">
        <div className="git-settings-instructions-copy">
          <h2>{props.title}</h2>
          <p>{props.description}</p>
        </div>
        <button
          type="button"
          className="settings-head-action git-settings-save"
          disabled
        >
          {props.saveLabel}
        </button>
      </div>
      <textarea
        className="git-settings-instructions-textarea"
        aria-label={props.title}
        placeholder={props.placeholder}
        disabled
      />
    </section>
  );
}

export function GitSettingsSection(props: GitSettingsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group git-settings-page">
      <SectionHeader
        title={t("settings.git.title")}
      />
      <section className="settings-card">
        <GitSettingsRow
          label={t("settings.git.branchPrefixLabel")}
          description={t("settings.git.branchPrefixDescription")}
        >
          <input
            className="settings-text-input"
            aria-label={t("settings.git.branchPrefixLabel")}
            placeholder={t("settings.git.branchPrefixPlaceholder")}
            value={props.preferences.gitBranchPrefix}
            onChange={(event) => props.preferences.setGitBranchPrefix(event.currentTarget.value)}
          />
        </GitSettingsRow>
        <GitSettingsRow
          label={t("settings.git.mergeMethodLabel")}
          description={t("settings.git.mergeMethodDescription")}
        >
          <GitSegmentedControl
            value="merge"
            disabled
            options={[
              { value: "merge", label: t("settings.git.mergeMethodMerge") },
              { value: "squash", label: t("settings.git.mergeMethodSquash") },
            ]}
          />
        </GitSettingsRow>
        <GitSettingsRow
          label={t("settings.git.forceLeaseLabel")}
          description={t("settings.git.forceLeaseDescription")}
        >
          <ToggleSwitch
            label={t("settings.git.forceLeaseLabel")}
            checked={props.preferences.gitPushForceWithLease}
            onToggle={() => props.preferences.setGitPushForceWithLease(!props.preferences.gitPushForceWithLease)}
          />
        </GitSettingsRow>
        <GitSettingsRow
          label={t("settings.git.draftPullRequestLabel")}
          description={t("settings.git.draftPullRequestDescription")}
        >
          <ToggleSwitch
            label={t("settings.git.draftPullRequestLabel")}
            checked
            disabled
          />
        </GitSettingsRow>
        <GitSettingsRow
          label={t("settings.git.autoDeleteWorktreeLabel")}
          description={t("settings.git.autoDeleteWorktreeDescription")}
        >
          <ToggleSwitch
            label={t("settings.git.autoDeleteWorktreeLabel")}
            checked
            disabled
          />
        </GitSettingsRow>
        <GitSettingsRow
          label={t("settings.git.autoDeleteRetentionLabel")}
          description={t("settings.git.autoDeleteRetentionDescription")}
        >
          <input
            className="settings-text-input settings-number-input"
            aria-label={t("settings.git.autoDeleteRetentionLabel")}
            type="number"
            value={15}
            disabled
            readOnly
          />
        </GitSettingsRow>
      </section>
      <GitInstructionsSection
        title={t("settings.git.commitInstructionsTitle")}
        description={t("settings.git.commitInstructionsDescription")}
        placeholder={t("settings.git.commitInstructionsPlaceholder")}
        saveLabel={t("settings.git.save")}
      />
      <GitInstructionsSection
        title={t("settings.git.pullRequestInstructionsTitle")}
        description={t("settings.git.pullRequestInstructionsDescription")}
        placeholder={t("settings.git.pullRequestInstructionsPlaceholder")}
        saveLabel={t("settings.git.save")}
      />
    </div>
  );
}
