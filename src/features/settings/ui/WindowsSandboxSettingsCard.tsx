import { useMemo } from "react";
import { readWindowsSandboxConfigView } from "../sandbox/windowsSandboxConfig";
import type { WindowsSandboxSetupState } from "../../../domain/types";
import { useI18n, type MessageKey } from "../../../i18n";
import type { AgentEnvironment } from "../../../bridge/types";

interface WindowsSandboxSettingsCardProps {
  readonly agentEnvironment: AgentEnvironment;
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  readonly setupState: WindowsSandboxSetupState;
  readonly onToggle: (enabled: boolean) => Promise<unknown>;
}

const MODE_LABEL_KEYS: Record<"disabled" | "enabled", MessageKey> = {
  disabled: "settings.windowsSandbox.disabledMode",
  enabled: "settings.windowsSandbox.enabledMode"
};

function modeLabel(
  mode: "disabled" | "enabled",
  t: (key: MessageKey) => string
): string {
  return t(MODE_LABEL_KEYS[mode]);
}

function resultMessage(
  state: WindowsSandboxSetupState,
  t: (key: MessageKey, params?: Record<string, string>) => string
): string | null {
  if (state.pending) {
    return t("settings.windowsSandbox.pendingMessage");
  }
  if (state.success === true) {
    return t("settings.windowsSandbox.successMessage");
  }
  if (state.success === false) {
    return state.error ?? t("settings.windowsSandbox.failureMessage");
  }
  return null;
}

function environmentMessageKey(agentEnvironment: AgentEnvironment): MessageKey {
  return agentEnvironment === "windowsNative"
    ? "settings.windowsSandbox.autoEnabledNote"
    : "settings.windowsSandbox.waitingForWindowsNativeNote";
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

export function WindowsSandboxSettingsCard(props: WindowsSandboxSettingsCardProps): JSX.Element {
  const { t } = useI18n();
  const view = useMemo(() => readWindowsSandboxConfigView(props.configSnapshot), [props.configSnapshot]);
  const result = resultMessage(props.setupState, t);
  const actionDisabled = props.busy || props.setupState.pending;
  const statusLabel = view.enabled ? modeLabel("enabled", t) : modeLabel("disabled", t);
  const resultClass = props.setupState.success === false
    ? "settings-status-note settings-status-note-error windows-sandbox-status"
    : props.setupState.pending
      ? "settings-status-note windows-sandbox-status"
      : "settings-status-note settings-status-note-success windows-sandbox-status";

  return (
    <section className="settings-card windows-sandbox-card">
      <div className="windows-sandbox-row">
        <div className="windows-sandbox-head-main">
          <strong>{t("settings.windowsSandbox.title")}</strong>
          <p className="windows-sandbox-summary-copy">
            {t("settings.windowsSandbox.summary")}
          </p>
        </div>
        <div className="settings-row-control">
          <ToggleSwitch
            checked={view.enabled}
            disabled={actionDisabled}
            label={t("settings.windowsSandbox.title")}
            onToggle={() => void props.onToggle(!view.enabled)}
          />
        </div>
      </div>

      <div className="windows-sandbox-meta">
        <span className="windows-sandbox-meta-label">{t("settings.windowsSandbox.currentStatusLabel")}</span>
        <strong>{statusLabel}</strong>
        <p>{view.source ?? t("settings.windowsSandbox.noSource")}</p>
      </div>

      {view.isLegacy ? <p className="settings-status-note windows-sandbox-status">{t("settings.windowsSandbox.legacyNote")}</p> : null}
      <p className="settings-status-note windows-sandbox-status">{t(environmentMessageKey(props.agentEnvironment))}</p>
      {result ? <p className={resultClass}>{result}</p> : null}
    </section>
  );
}
