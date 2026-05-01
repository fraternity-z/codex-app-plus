import { useI18n } from "../../../i18n";

export function SettingsLoadingFallback(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-loading-layout">
      <main className="settings-loading-main">
        <div className="settings-loading-panel-group">
          <section className="settings-loading-card">
            <div className="settings-loading-empty">{t("app.settings.loading")}</div>
          </section>
        </div>
      </main>
    </div>
  );
}
