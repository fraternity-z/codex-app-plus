import { useCallback, useEffect, useState } from "react";
import type {
  AgentEnvironment,
  ReadProxySettingsOutput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
} from "../../../bridge/types";
import { useI18n, type MessageKey } from "../../../i18n";
import {
  buildProxySettingsInput,
  EMPTY_PROXY_SETTINGS,
  hasProxySettingsChanges,
} from "../config/proxySettings";
import { SettingsToggleButtonGroup } from "./SettingsToggleButtonGroup";

interface ProxySettingsCardProps {
  readonly agentEnvironment: AgentEnvironment;
  readonly busy: boolean;
  readonly readProxySettings: (
    input: { readonly agentEnvironment: AgentEnvironment }
  ) => Promise<ReadProxySettingsOutput>;
  readonly writeProxySettings: (
    input: UpdateProxySettingsInput
  ) => Promise<UpdateProxySettingsOutput>;
}

interface Feedback {
  readonly kind: "idle" | "error" | "success";
  readonly message: string;
}

const EMPTY_FEEDBACK: Feedback = { kind: "idle", message: "" };
type ProxyMode = "disabled" | "system";

const AGENT_ENVIRONMENT_LABEL_KEYS: Record<AgentEnvironment, MessageKey> = {
  windowsNative: "settings.general.agentEnvironment.options.windowsNative",
  wsl: "settings.general.agentEnvironment.options.wsl",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function feedbackClassName(kind: Feedback["kind"]): string {
  if (kind === "success") {
    return "settings-status-note settings-status-note-success";
  }
  if (kind === "error") {
    return "settings-status-note settings-status-note-error";
  }
  return "settings-status-note";
}

export function ProxySettingsCard(props: ProxySettingsCardProps): JSX.Element {
  const { t } = useI18n();
  const [savedSettings, setSavedSettings] = useState(EMPTY_PROXY_SETTINGS);
  const [draftSettings, setDraftSettings] = useState(EMPTY_PROXY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(EMPTY_FEEDBACK);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFeedback(EMPTY_FEEDBACK);
    void props.readProxySettings({ agentEnvironment: props.agentEnvironment })
      .then((output) => {
        if (!active) {
          return;
        }
        setSavedSettings(output.settings);
        setDraftSettings(output.settings);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setSavedSettings(EMPTY_PROXY_SETTINGS);
        setDraftSettings(EMPTY_PROXY_SETTINGS);
        setFeedback({
          kind: "error",
          message: t("settings.config.proxy.loadFailed", {
            error: toErrorMessage(error),
          }),
        });
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [props.agentEnvironment, t]);

  const dirty = hasProxySettingsChanges(savedSettings, draftSettings);
  const actionDisabled = props.busy || loading || saving || !dirty;
  const environmentLabel = t(AGENT_ENVIRONMENT_LABEL_KEYS[props.agentEnvironment]);
  const proxyMode: ProxyMode = draftSettings.enabled ? "system" : "disabled";
  const proxyModeStatusNote = draftSettings.enabled
    ? t("settings.config.proxy.systemOnNote")
    : t("settings.config.proxy.disabledNote");

  const updateDraft = useCallback(
    (patch: Partial<typeof draftSettings>) => {
      setDraftSettings((current) => ({ ...current, ...patch }));
      setFeedback(EMPTY_FEEDBACK);
    },
    [],
  );

  const updateProxyMode = useCallback(
    (mode: ProxyMode) => {
      updateDraft({
        enabled: mode === "system",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      });
    },
    [updateDraft],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setFeedback(EMPTY_FEEDBACK);
    try {
      const output = await props.writeProxySettings(
        buildProxySettingsInput(props.agentEnvironment, draftSettings),
      );
      setSavedSettings(output.settings);
      setDraftSettings(output.settings);
      setFeedback({
        kind: "success",
        message: t("settings.config.proxy.savedMessage"),
      });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [
    draftSettings,
    props.agentEnvironment,
    props.writeProxySettings,
    t,
  ]);

  return (
    <section className="settings-card settings-config-card">
      <div className="settings-section-head">
        <strong>{t("settings.config.proxy.title")}</strong>
        <button
          type="button"
          className="settings-head-action"
          disabled={actionDisabled}
          onClick={() => void handleSave()}
        >
          {saving ? t("settings.config.proxy.saving") : t("settings.config.proxy.saveAction")}
        </button>
      </div>
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.description")}</p>
      <p className="settings-note settings-note-pad">
        {t("settings.config.proxy.currentEnvironmentNote", { environment: environmentLabel })}
      </p>
      <SettingsToggleButtonGroup
        label={t("settings.config.proxy.modeLabel")}
        description={t("settings.config.proxy.modeDescription")}
        value={proxyMode}
        options={[
          { value: "disabled", label: t("settings.config.proxy.disabledOption") },
          { value: "system", label: t("settings.config.proxy.systemOption") },
        ]}
        disabled={props.busy || loading || saving}
        statusNote={proxyModeStatusNote}
        onChange={updateProxyMode}
      />
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.customProxyDeferredNote")}</p>
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.hostRuntimeNote")}</p>
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.manualRestartNote")}</p>
      {loading ? (
        <p className="settings-status-note">{t("settings.config.proxy.loading")}</p>
      ) : null}
      {feedback.kind !== "idle" ? (
        <p className={feedbackClassName(feedback.kind)}>{feedback.message}</p>
      ) : null}
    </section>
  );
}
