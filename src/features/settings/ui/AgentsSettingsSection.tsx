import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";
import { selectMultiAgentFeatureState } from "../config/experimentalFeatures";

interface AgentsSettingsSectionProps {
  readonly busy: boolean;
  readonly embedded?: boolean;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly experimentalFeatures: ReadonlyArray<ExperimentalFeature>;
  readonly refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  readonly setMultiAgentEnabled: (enabled: boolean) => Promise<void>;
}

interface Feedback {
  readonly kind: "idle" | "success" | "error";
  readonly message: string;
}

const EMPTY_FEEDBACK: Feedback = { kind: "idle", message: "" };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StatusNote(props: { readonly feedback: Feedback }): JSX.Element | null {
  if (props.feedback.kind === "success") {
    return <p className="settings-status-note settings-status-note-success">{props.feedback.message}</p>;
  }
  if (props.feedback.kind === "error") {
    return <p className="settings-status-note settings-status-note-error">{props.feedback.message}</p>;
  }
  return null;
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly disabled?: boolean;
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
      onClick={props.disabled === true ? undefined : props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function AgentsSectionHeader(props: {
  readonly embedded?: boolean;
  readonly title: string;
  readonly subtitle: string;
}): JSX.Element {
  if (props.embedded) {
    return (
      <section className="settings-card settings-config-card">
        <div className="settings-section-head">
          <strong>{props.title}</strong>
        </div>
        <p className="settings-note settings-note-pad">{props.subtitle}</p>
      </section>
    );
  }

  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      <p className="settings-subtitle">{props.subtitle}</p>
    </header>
  );
}

export function AgentsSettingsSection(props: AgentsSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<Feedback>(EMPTY_FEEDBACK);
  const [saving, setSaving] = useState(false);
  const multiAgentFeatureState = useMemo(
    () => selectMultiAgentFeatureState(props.experimentalFeatures, props.configSnapshot),
    [props.configSnapshot, props.experimentalFeatures],
  );

  const handleFeatureToggle = async () => {
    setSaving(true);
    try {
      await props.setMultiAgentEnabled(!multiAgentFeatureState.enabled);
      await props.refreshConfigSnapshot();
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel-group">
      <AgentsSectionHeader
        embedded={props.embedded}
        title={t("settings.agents.title")}
        subtitle={t("settings.agents.subtitle")}
      />
      <section className="settings-card settings-config-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.agents.enable")}</div>
            <p className="settings-row-meta">{t("settings.agents.enableDesc")}</p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={multiAgentFeatureState.enabled}
              disabled={props.busy || saving}
              label={t("settings.agents.enable")}
              onToggle={() => void handleFeatureToggle()}
            />
          </div>
        </div>
      </section>
      <StatusNote feedback={feedback} />
    </div>
  );
}
