import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { ComposerApprovalPolicy } from "../../composer/model/composerPermission";
import { useI18n, type MessageKey } from "../../../i18n";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

type Translator = (key: MessageKey) => string;

function createComposerApprovalPolicyOptions(
  t: Translator
): ReadonlyArray<SettingsSelectOption<ComposerApprovalPolicy>> {
  return [
    { value: "untrusted", label: t("settings.general.approvalPolicy.options.untrusted") },
    { value: "on-failure", label: t("settings.general.approvalPolicy.options.onFailure") },
    { value: "on-request", label: t("settings.general.approvalPolicy.options.onRequest") },
    { value: "never", label: t("settings.general.approvalPolicy.options.never") },
  ];
}

function createSandboxModeOptions(t: Translator): ReadonlyArray<SettingsSelectOption<SandboxMode>> {
  return [
    { value: "read-only", label: t("settings.general.sandboxMode.options.readOnly") },
    { value: "workspace-write", label: t("settings.general.sandboxMode.options.workspaceWrite") },
    { value: "danger-full-access", label: t("settings.general.sandboxMode.options.dangerFullAccess") },
  ];
}

export function ComposerPermissionDefaultsCard(props: {
  readonly preferences: AppPreferencesController;
}): JSX.Element {
  const { t } = useI18n();
  const composerApprovalOptions = createComposerApprovalPolicyOptions(t);
  const sandboxModeOptions = createSandboxModeOptions(t);

  return (
    <section className="settings-page-section">
      <h2 className="settings-section-title">{t("settings.general.permissionSettings.title")}</h2>
      <section className="settings-card">
        <SettingsSelectRow
          label={t("settings.general.composerDefaultApprovalPolicy.label")}
          description={t("settings.general.composerDefaultApprovalPolicy.description")}
          value={props.preferences.composerDefaultApprovalPolicy}
          options={composerApprovalOptions}
          onChange={props.preferences.setComposerDefaultApprovalPolicy}
        />
        <SettingsSelectRow
          label={t("settings.general.composerDefaultSandboxMode.label")}
          description={t("settings.general.composerDefaultSandboxMode.description")}
          value={props.preferences.composerDefaultSandboxMode}
          options={sandboxModeOptions}
          onChange={props.preferences.setComposerDefaultSandboxMode}
        />
        <SettingsSelectRow
          label={t("settings.general.composerFullApprovalPolicy.label")}
          description={t("settings.general.composerFullApprovalPolicy.description")}
          value={props.preferences.composerFullApprovalPolicy}
          options={composerApprovalOptions}
          onChange={props.preferences.setComposerFullApprovalPolicy}
        />
        <SettingsSelectRow
          label={t("settings.general.composerFullSandboxMode.label")}
          description={t("settings.general.composerFullSandboxMode.description")}
          value={props.preferences.composerFullSandboxMode}
          options={sandboxModeOptions}
          onChange={props.preferences.setComposerFullSandboxMode}
        />
      </section>
    </section>
  );
}
