import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentEnvironment,
  ProxyMode,
  ProxySettings,
  ReadProxySettingsOutput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import {
  buildProxySettingsInput,
  EMPTY_PROXY_SETTINGS,
  hasProxySettingsChanges,
  validateProxySettings,
} from "../config/proxySettings";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

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
  readonly kind: "idle" | "error";
  readonly message: string;
}

const EMPTY_FEEDBACK: Feedback = { kind: "idle", message: "" };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  const validation = validateProxySettings(draftSettings);
  const title = t("settings.config.proxy.title");

  const modeOptions = useMemo<ReadonlyArray<SettingsSelectOption<ProxyMode>>>(
    () => [
      { value: "disabled", label: t("settings.config.proxy.disabledOption") },
      { value: "system", label: t("settings.config.proxy.systemOption") },
      { value: "custom", label: t("settings.config.proxy.customOption") },
    ],
    [t],
  );

  const persist = useCallback(
    async (next: ProxySettings) => {
      setSaving(true);
      setFeedback(EMPTY_FEEDBACK);
      try {
        const output = await props.writeProxySettings(
          buildProxySettingsInput(props.agentEnvironment, next),
        );
        setSavedSettings(output.settings);
        setDraftSettings(output.settings);
      } catch (error) {
        setFeedback({ kind: "error", message: toErrorMessage(error) });
      } finally {
        setSaving(false);
      }
    },
    [props.agentEnvironment, props.writeProxySettings],
  );

  const commitIfReady = useCallback(
    (next: ProxySettings) => {
      if (validateProxySettings(next).kind !== "valid") {
        return;
      }
      if (!hasProxySettingsChanges(savedSettings, next)) {
        return;
      }
      void persist(next);
    },
    [persist, savedSettings],
  );

  const updateProxyMode = useCallback(
    (mode: ProxyMode) => {
      const next: ProxySettings =
        mode === "custom"
          ? {
              mode: "custom",
              httpProxy:
                savedSettings.mode === "custom" ? savedSettings.httpProxy : "",
              httpsProxy:
                savedSettings.mode === "custom" ? savedSettings.httpsProxy : "",
              noProxy:
                savedSettings.mode === "custom" ? savedSettings.noProxy : "",
            }
          : { mode, httpProxy: "", httpsProxy: "", noProxy: "" };
      setDraftSettings(next);
      setFeedback(EMPTY_FEEDBACK);
      commitIfReady(next);
    },
    [commitIfReady, savedSettings],
  );

  const updateCustomField = useCallback((patch: Partial<ProxySettings>) => {
    setDraftSettings((current) => ({ ...current, ...patch }));
    setFeedback(EMPTY_FEEDBACK);
  }, []);

  const commitCustomField = useCallback(() => {
    commitIfReady(draftSettings);
  }, [commitIfReady, draftSettings]);

  const inputsDisabled = props.busy || loading || saving;

  return (
    <section className="settings-card settings-config-card">
      <div className="settings-section-head">
        <strong>{title}</strong>
        <SettingsSelectRow
          layout="inline"
          label={title}
          value={draftSettings.mode}
          options={modeOptions}
          disabled={inputsDisabled}
          onChange={updateProxyMode}
        />
      </div>
      {draftSettings.mode === "custom" ? (
        <div className="settings-custom-proxy-fields">
          <label className="settings-field">
            <span className="settings-field-label">
              {t("settings.config.proxy.customHttpLabel")}
            </span>
            <input
              className="settings-text-input"
              type="text"
              value={draftSettings.httpProxy}
              placeholder={t("settings.config.proxy.customHttpPlaceholder")}
              disabled={inputsDisabled}
              onChange={(event) =>
                updateCustomField({ httpProxy: event.currentTarget.value })
              }
              onBlur={commitCustomField}
              aria-label={t("settings.config.proxy.customHttpLabel")}
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">
              {t("settings.config.proxy.customHttpsLabel")}
            </span>
            <input
              className="settings-text-input"
              type="text"
              value={draftSettings.httpsProxy}
              placeholder={t("settings.config.proxy.customHttpsPlaceholder")}
              disabled={inputsDisabled}
              onChange={(event) =>
                updateCustomField({ httpsProxy: event.currentTarget.value })
              }
              onBlur={commitCustomField}
              aria-label={t("settings.config.proxy.customHttpsLabel")}
            />
          </label>
          <label className="settings-field">
            <span className="settings-field-label">
              {t("settings.config.proxy.customNoProxyLabel")}
            </span>
            <input
              className="settings-text-input"
              type="text"
              value={draftSettings.noProxy}
              placeholder={t("settings.config.proxy.customNoProxyPlaceholder")}
              disabled={inputsDisabled}
              onChange={(event) =>
                updateCustomField({ noProxy: event.currentTarget.value })
              }
              onBlur={commitCustomField}
              aria-label={t("settings.config.proxy.customNoProxyLabel")}
            />
          </label>
          {validation.kind === "empty" ? (
            <p className="settings-status-note settings-status-note-error">
              {t("settings.config.proxy.customEmptyError")}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.hostRuntimeNote")}</p>
      <p className="settings-note settings-note-pad">{t("settings.config.proxy.manualRestartNote")}</p>
      {loading ? (
        <p className="settings-status-note">{t("settings.config.proxy.loading")}</p>
      ) : null}
      {saving ? (
        <p className="settings-status-note">{t("settings.config.proxy.applying")}</p>
      ) : null}
      {feedback.kind === "error" ? (
        <p className="settings-status-note settings-status-note-error">{feedback.message}</p>
      ) : null}
    </section>
  );
}
