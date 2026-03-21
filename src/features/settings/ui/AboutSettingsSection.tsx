import type { AppUpdateState } from "../../../domain/types";
import { useI18n } from "../../../i18n";
import { AppUpdateCard } from "./AppUpdateCard";

interface AboutSettingsSectionProps {
  readonly appUpdate: AppUpdateState;
  onCheckForAppUpdate: () => Promise<void>;
  onInstallAppUpdate: () => Promise<void>;
}

export function AboutSettingsSection(props: AboutSettingsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.about.title")}</h1>
        <p className="settings-subtitle">{t("settings.about.subtitle")}</p>
      </header>
      <AppUpdateCard
        appUpdate={props.appUpdate}
        onCheckForAppUpdate={props.onCheckForAppUpdate}
        onInstallAppUpdate={props.onInstallAppUpdate}
      />
    </div>
  );
}
