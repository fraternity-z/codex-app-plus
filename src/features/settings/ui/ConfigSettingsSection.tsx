import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { useI18n } from "../../../i18n";
import { ComposerPermissionDefaultsCard } from "./ComposerPermissionDefaultsCard";

interface ConfigSettingsSectionProps {
  readonly preferences: AppPreferencesController;
  onOpenConfigToml: () => Promise<void>;
  onOpenConfigDocs: () => Promise<void>;
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group settings-config-page">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.config.title")}</h1>
        <p className="settings-subtitle">
          {t("settings.config.subtitle")}
          {" "}
          <a
            className="settings-config-learn-more"
            href="https://developers.openai.com/codex/config-basic"
            onClick={(event) => {
              event.preventDefault();
              void props.onOpenConfigDocs();
            }}
            rel="noreferrer"
            target="_blank"
          >
            {t("settings.config.learnMore")}
          </a>
        </p>
      </header>
      <ComposerPermissionDefaultsCard
        preferences={props.preferences}
        onOpenConfigToml={props.onOpenConfigToml}
      />
    </div>
  );
}
