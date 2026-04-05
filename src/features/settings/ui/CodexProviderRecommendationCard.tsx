import { useI18n } from "../../../i18n";

interface CodexProviderRecommendationCardProps {
  onOpenExternal: (url: string) => Promise<void>;
}

export function CodexProviderRecommendationCard(props: CodexProviderRecommendationCardProps): JSX.Element {
  const { t } = useI18n();

  const handleOpenDownload = async () => {
    await props.onOpenExternal("https://github.com/farion1231/cc-switch");
  };

  const handleOpenDocs = async () => {
    await props.onOpenExternal("https://docs.newapi.ai/en/docs/apps/cc-switch");
  };

  return (
    <section className="settings-card settings-config-card">
      <div className="settings-section-head">
        <strong>{t("settings.config.providerRecommendation.title")}</strong>
      </div>
      <p className="settings-note settings-note-pad">
        {t("settings.config.providerRecommendation.description")}
      </p>
      <p className="settings-note settings-note-pad">
        {t("settings.config.providerRecommendation.ccSwitchIntro")}
      </p>
      <div className="settings-row">
        <div className="codex-provider-actions">
          <button
            type="button"
            className="settings-action-btn settings-action-btn-sm settings-action-btn-primary"
            onClick={() => void handleOpenDownload()}
          >
            {t("settings.config.providerRecommendation.downloadCcSwitch")}
          </button>
          <button
            type="button"
            className="settings-action-btn settings-action-btn-sm"
            onClick={() => void handleOpenDocs()}
          >
            {t("settings.config.providerRecommendation.viewDocs")}
          </button>
        </div>
      </div>
      <div className="settings-note settings-note-pad">
        <p>{t("settings.config.providerRecommendation.manualConfigTitle")}</p>
        <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
          <li>
            <code>{t("settings.config.providerRecommendation.authJsonPath")}</code>
          </li>
          <li>
            <code>{t("settings.config.providerRecommendation.configTomlPath")}</code>
          </li>
        </ul>
      </div>
    </section>
  );
}
