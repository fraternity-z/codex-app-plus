import type {
  AgentEnvironment,
  ReadProxySettingsOutput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import { CodexProviderRecommendationCard } from "./CodexProviderRecommendationCard";
import { ProxySettingsCard } from "./ProxySettingsCard";

interface ConfigSettingsSectionProps {
  readonly agentEnvironment: AgentEnvironment;
  readonly busy: boolean;
  onOpenConfigToml: () => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  readProxySettings: (
    input: { readonly agentEnvironment: AgentEnvironment }
  ) => Promise<ReadProxySettingsOutput>;
  writeProxySettings: (input: UpdateProxySettingsInput) => Promise<UpdateProxySettingsOutput>;
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.config.title")}</h1>
        <p className="settings-subtitle">{t("settings.config.subtitle")}</p>
      </header>
      <section className="settings-card settings-config-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.config.userConfig.label")}</div>
            <p className="settings-row-meta">{t("settings.config.userConfig.description")}</p>
          </div>
          <button
            type="button"
            className="settings-action-btn"
            onClick={() => void props.onOpenConfigToml()}
          >
            {t("settings.config.userConfig.action")}
          </button>
        </div>
      </section>
      <ProxySettingsCard
        agentEnvironment={props.agentEnvironment}
        busy={props.busy}
        readProxySettings={props.readProxySettings}
        writeProxySettings={props.writeProxySettings}
      />
      <CodexProviderRecommendationCard onOpenExternal={props.onOpenExternal} />
    </div>
  );
}
