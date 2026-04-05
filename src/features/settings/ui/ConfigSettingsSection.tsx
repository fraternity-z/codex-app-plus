import { useCallback, useEffect, useState } from "react";
import type {
  AgentEnvironment,
  CodexAuthModeStateOutput,
  CodexAuthSwitchResult,
  ReadProxySettingsOutput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import { CodexAuthModeCard } from "./CodexAuthModeCard";
import { CodexProviderRecommendationCard } from "./CodexProviderRecommendationCard";
import { ProxySettingsCard } from "./ProxySettingsCard";
import { writeForcedLoginMethod } from "./configAuthMode";

interface ConfigSettingsSectionProps {
  readonly agentEnvironment: AgentEnvironment;
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  onOpenConfigToml: () => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  refreshConfigSnapshot: () => Promise<unknown>;
  refreshAuthState: () => Promise<void>;
  login: () => Promise<void>;
  readProxySettings: (
    input: { readonly agentEnvironment: AgentEnvironment }
  ) => Promise<ReadProxySettingsOutput>;
  getCodexAuthModeState: () => Promise<CodexAuthModeStateOutput>;
  activateCodexChatgpt: () => Promise<CodexAuthSwitchResult>;
  writeProxySettings: (input: UpdateProxySettingsInput) => Promise<UpdateProxySettingsOutput>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<unknown>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<unknown>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useConfigSettingsSectionController(
  props: ConfigSettingsSectionProps,
  t: ReturnType<typeof useI18n>["t"],
) {
  const [authModeState, setAuthModeState] = useState<CodexAuthModeStateOutput | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [authActionPending, setAuthActionPending] = useState<"chatgpt" | "login" | null>(null);

  const loadAuthModeState = useCallback(async () => {
    setAuthLoading(true);
    try {
      setAuthModeState(await props.getCodexAuthModeState());
    } finally {
      setAuthLoading(false);
    }
  }, [props.getCodexAuthModeState]);

  const refreshSection = useCallback(async () => {
    await Promise.all([
      loadAuthModeState(),
      props.refreshConfigSnapshot(),
      props.refreshAuthState(),
    ]);
  }, [loadAuthModeState, props.refreshAuthState, props.refreshConfigSnapshot]);

  useEffect(() => {
    void (async () => {
      setErrorMessage(null);
      try {
        await loadAuthModeState();
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
    })();
  }, [loadAuthModeState]);

  const handleActivateChatgpt = useCallback(async () => {
    setAuthActionPending("chatgpt");
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const result = await props.activateCodexChatgpt();
      await writeForcedLoginMethod(props.writeConfigValue, props.configSnapshot, "chatgpt");
      await refreshSection();
      const key = result.restoredFromSnapshot
        ? "settings.config.auth.switchedMessage"
        : "settings.config.auth.switchedNeedsLoginMessage";
      setNoticeMessage(t(key));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setAuthActionPending(null);
    }
  }, [props.activateCodexChatgpt, props.configSnapshot, props.writeConfigValue, refreshSection, t]);

  const handleChatgptLogin = useCallback(async () => {
    setAuthActionPending("login");
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      await props.login();
      await Promise.all([props.refreshAuthState(), loadAuthModeState()]);
      setNoticeMessage(t("settings.config.auth.loginStartedMessage"));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setAuthActionPending(null);
    }
  }, [loadAuthModeState, props.login, props.refreshAuthState, t]);

  return {
    authActionPending,
    authLoading,
    authModeState,
    errorMessage,
    handleActivateChatgpt,
    handleChatgptLogin,
    noticeMessage,
  };
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const controller = useConfigSettingsSectionController(props, t);

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
      <CodexAuthModeCard
        busy={props.busy}
        authLoading={controller.authLoading}
        authModeState={controller.authModeState}
        authActionPending={controller.authActionPending}
        onActivateChatgpt={controller.handleActivateChatgpt}
        onLogin={controller.handleChatgptLogin}
      />
      <CodexProviderRecommendationCard onOpenExternal={props.onOpenExternal} />
      {controller.errorMessage ? (
        <div className="settings-notice settings-notice-error">
          {controller.errorMessage}
        </div>
      ) : null}
      {controller.noticeMessage ? (
        <div className="settings-notice settings-notice-success">
          {controller.noticeMessage}
        </div>
      ) : null}
    </div>
  );
}
