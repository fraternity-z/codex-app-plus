import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { ComposerApprovalPolicy } from "../../composer/model/composerPermission";
import { useI18n, type MessageKey } from "../../../i18n";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

type Translator = (key: MessageKey) => string;

function createComposerApprovalPolicyOptions(
  t: Translator
): ReadonlyArray<SettingsSelectOption<ComposerApprovalPolicy>> {
  return [
    { value: "untrusted", label: t("settings.config.composer.approvalPolicy.options.untrusted") },
    { value: "on-failure", label: t("settings.config.composer.approvalPolicy.options.onFailure") },
    { value: "on-request", label: t("settings.config.composer.approvalPolicy.options.onRequest") },
    { value: "never", label: t("settings.config.composer.approvalPolicy.options.never") },
  ];
}

function createSandboxModeOptions(t: Translator): ReadonlyArray<SettingsSelectOption<SandboxMode>> {
  return [
    { value: "read-only", label: t("settings.config.composer.sandboxMode.options.readOnly") },
    { value: "workspace-write", label: t("settings.config.composer.sandboxMode.options.workspaceWrite") },
    { value: "danger-full-access", label: t("settings.config.composer.sandboxMode.options.dangerFullAccess") },
  ];
}

export function ComposerPermissionDefaultsCard(props: {
  readonly preferences: AppPreferencesController;
  onOpenConfigToml: () => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const composerApprovalOptions = createComposerApprovalPolicyOptions(t);
  const sandboxModeOptions = createSandboxModeOptions(t);

  return (
    <section className="settings-page-section settings-config-composer-section">
      <h2 className="settings-section-title">{t("settings.config.composer.title")}</h2>
      <div className="settings-config-source-row">
        <button
          type="button"
          className="settings-config-source-trigger"
          disabled
          aria-label={t("settings.config.composer.sourceUserConfig")}
        >
          <span>{t("settings.config.composer.sourceUserConfig")}</span>
          <OfficialChevronRightIcon className="settings-config-source-caret" />
        </button>
        <button
          type="button"
          className="settings-config-open-link"
          onClick={() => void props.onOpenConfigToml()}
        >
          {t("settings.config.composer.openConfigToml")}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <section className="settings-card settings-config-preferences-card">
        <SettingsSelectRow
          label={t("settings.config.composer.approvalPolicy.label")}
          description={t("settings.config.composer.approvalPolicy.description")}
          value={props.preferences.composerDefaultApprovalPolicy}
          options={composerApprovalOptions}
          onChange={props.preferences.setComposerDefaultApprovalPolicy}
        />
        <SettingsSelectRow
          label={t("settings.config.composer.sandboxMode.label")}
          description={t("settings.config.composer.sandboxMode.description")}
          value={props.preferences.composerDefaultSandboxMode}
          options={sandboxModeOptions}
          onChange={props.preferences.setComposerDefaultSandboxMode}
        />
      </section>
    </section>
  );
}
