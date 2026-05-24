import { useEffect, useMemo, useState } from "react";
import type { AgentsConfigRoleUpdateInput, AgentsConfigUpdateInput } from "../../../app/controller/appControllerTypes";
import { useI18n, type MessageKey } from "../../../i18n";
import type { TranslationParams } from "../../../i18n/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";

interface AgentsSettingsSectionProps {
  readonly busy: boolean;
  readonly embedded?: boolean;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly experimentalFeatures: ReadonlyArray<ExperimentalFeature>;
  readonly refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  readonly applyAgentsConfig: (settings: AgentsConfigUpdateInput) => Promise<void>;
}

interface Feedback {
  readonly kind: "idle" | "success" | "error";
  readonly message: string;
}

interface AgentsFormState {
  readonly maxThreads: string;
  readonly maxDepth: string;
  readonly jobMaxRuntimeSeconds: string;
  readonly roleName: string;
  readonly roleDescription: string;
  readonly roleConfigFile: string;
  readonly roleNicknames: string;
}

interface ParsedCoreAgentSettings {
  readonly maxThreads: number;
  readonly maxDepth: number;
  readonly jobMaxRuntimeSeconds: number | null;
}

interface AgentRoleSummary {
  readonly name: string;
  readonly description: string | null;
  readonly configFile: string | null;
  readonly nicknameCandidates: ReadonlyArray<string>;
}

const EMPTY_FEEDBACK: Feedback = { kind: "idle", message: "" };
const ROLE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getConfigRoot(configSnapshot: ConfigReadResponse | null): Record<string, unknown> {
  return isRecord(configSnapshot?.config) ? configSnapshot.config : {};
}

function getConfigTable(configSnapshot: ConfigReadResponse | null, key: string): Record<string, unknown> {
  const table = getConfigRoot(configSnapshot)[key];
  return isRecord(table) ? table : {};
}

function readFeatureFlag(
  experimentalFeatures: ReadonlyArray<ExperimentalFeature>,
  configSnapshot: ConfigReadResponse | null,
  name: string,
  defaultValue: boolean,
): boolean {
  const runtimeFeature = experimentalFeatures.find((feature) => feature.name === name) ?? null;
  if (runtimeFeature !== null) {
    return runtimeFeature.enabled;
  }

  const configured = getConfigTable(configSnapshot, "features")[name];
  return typeof configured === "boolean" ? configured : defaultValue;
}

function readIntegerField(
  configSnapshot: ConfigReadResponse | null,
  key: string,
  defaultValue: number,
): number {
  const value = getConfigTable(configSnapshot, "agents")[key];
  return typeof value === "number" && Number.isInteger(value) ? value : defaultValue;
}

function readOptionalIntegerField(configSnapshot: ConfigReadResponse | null, key: string): number | null {
  const value = getConfigTable(configSnapshot, "agents")[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readAgentRoles(configSnapshot: ConfigReadResponse | null): ReadonlyArray<AgentRoleSummary> {
  const agents = getConfigTable(configSnapshot, "agents");
  return Object.entries(agents)
    .filter(([name, value]) => (
      !["max_threads", "max_depth", "job_max_runtime_seconds"].includes(name) && isRecord(value)
    ))
    .map(([name, value]) => {
      const role = value as Record<string, unknown>;
      const nicknames = Array.isArray(role.nickname_candidates)
        ? role.nickname_candidates.filter((item): item is string => typeof item === "string")
        : [];
      return {
        name,
        description: typeof role.description === "string" ? role.description : null,
        configFile: typeof role.config_file === "string" ? role.config_file : null,
        nicknameCandidates: nicknames,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function createFormState(configSnapshot: ConfigReadResponse | null): AgentsFormState {
  const runtimeSeconds = readOptionalIntegerField(configSnapshot, "job_max_runtime_seconds");
  return {
    maxThreads: String(readIntegerField(configSnapshot, "max_threads", 6)),
    maxDepth: String(readIntegerField(configSnapshot, "max_depth", 1)),
    jobMaxRuntimeSeconds: runtimeSeconds === null ? "" : String(runtimeSeconds),
    roleName: "",
    roleDescription: "",
    roleConfigFile: "",
    roleNicknames: "",
  };
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseRequiredInteger(
  value: string,
  minValue: number,
  fieldLabel: string,
  t: (key: MessageKey, params?: TranslationParams) => string,
): { readonly value: number } | { readonly error: string } {
  const parsed = parseInteger(value);
  if (parsed === null || parsed < minValue) {
    return { error: t("settings.agents.invalidInteger", { field: fieldLabel, min: minValue }) };
  }
  return { value: parsed };
}

function parseOptionalInteger(
  value: string,
  minValue: number,
  fieldLabel: string,
  t: (key: MessageKey, params?: TranslationParams) => string,
): { readonly value: number | null } | { readonly error: string } {
  if (value.trim().length === 0) {
    return { value: null };
  }
  return parseRequiredInteger(value, minValue, fieldLabel, t);
}

function parseCoreAgentSettings(
  form: AgentsFormState,
  t: (key: MessageKey, params?: TranslationParams) => string,
): { readonly settings: ParsedCoreAgentSettings } | { readonly error: string } {
  const maxThreads = parseRequiredInteger(form.maxThreads, 1, t("settings.agents.maxThreads"), t);
  if ("error" in maxThreads) {
    return maxThreads;
  }

  const maxDepth = parseRequiredInteger(form.maxDepth, 0, t("settings.agents.maxDepth"), t);
  if ("error" in maxDepth) {
    return maxDepth;
  }

  const jobMaxRuntimeSeconds = parseOptionalInteger(
    form.jobMaxRuntimeSeconds,
    1,
    t("settings.agents.jobMaxRuntimeSeconds"),
    t,
  );
  if ("error" in jobMaxRuntimeSeconds) {
    return jobMaxRuntimeSeconds;
  }

  return {
    settings: {
      maxThreads: maxThreads.value,
      maxDepth: maxDepth.value,
      jobMaxRuntimeSeconds: jobMaxRuntimeSeconds.value,
    },
  };
}

function parseNicknameCandidates(
  rawValue: string,
  t: (key: MessageKey, params?: TranslationParams) => string,
): { readonly value: ReadonlyArray<string> | null } | { readonly error: string } {
  const nicknames = rawValue
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (nicknames.length === 0) {
    return { value: null };
  }
  const unique = new Set<string>();
  for (const nickname of nicknames) {
    if (!NICKNAME_PATTERN.test(nickname)) {
      return { error: t("settings.agents.invalidNickname") };
    }
    if (unique.has(nickname)) {
      return { error: t("settings.agents.duplicateNickname") };
    }
    unique.add(nickname);
  }
  return { value: nicknames };
}

function parseRoleUpdate(
  form: AgentsFormState,
  t: (key: MessageKey, params?: TranslationParams) => string,
): { readonly role: AgentsConfigRoleUpdateInput | null } | { readonly error: string } {
  const name = form.roleName.trim();
  if (name.length === 0) {
    return { role: null };
  }
  if (!ROLE_NAME_PATTERN.test(name)) {
    return { error: t("settings.agents.invalidRoleName") };
  }
  const nicknameCandidates = parseNicknameCandidates(form.roleNicknames, t);
  if ("error" in nicknameCandidates) {
    return nicknameCandidates;
  }
  return {
    role: {
      name,
      description: toNullableText(form.roleDescription),
      configFile: toNullableText(form.roleConfigFile),
      nicknameCandidates: nicknameCandidates.value,
    },
  };
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
    return <h2 className="settings-section-title">{props.title}</h2>;
  }

  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      <p className="settings-subtitle">{props.subtitle}</p>
    </header>
  );
}

function NumberField(props: {
  readonly description: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly min: number;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="settings-agents-field">
      <span>{props.label}</span>
      <small>{props.description}</small>
      <input
        type="number"
        min={props.min}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function TextField(props: {
  readonly description: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="settings-agents-field">
      <span>{props.label}</span>
      <small>{props.description}</small>
      <input
        type="text"
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function AgentsSettingsSection(props: AgentsSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<Feedback>(EMPTY_FEEDBACK);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const multiAgentEnabled = useMemo(
    () => readFeatureFlag(props.experimentalFeatures, props.configSnapshot, "multi_agent", true),
    [props.configSnapshot, props.experimentalFeatures],
  );
  const multiAgentV2Enabled = useMemo(
    () => readFeatureFlag(props.experimentalFeatures, props.configSnapshot, "multi_agent_v2", false),
    [props.configSnapshot, props.experimentalFeatures],
  );
  const roles = useMemo(() => readAgentRoles(props.configSnapshot), [props.configSnapshot]);
  const snapshotForm = useMemo(() => createFormState(props.configSnapshot), [props.configSnapshot]);
  const snapshotFormKey = JSON.stringify(snapshotForm);
  const [form, setForm] = useState<AgentsFormState>(snapshotForm);
  const disabled = props.busy || saving;
  const panelClassName = props.embedded
    ? "settings-panel-group settings-page-section"
    : "settings-panel-group";

  useEffect(() => {
    setForm(snapshotForm);
  }, [snapshotFormKey, snapshotForm]);

  const updateForm = <Key extends keyof AgentsFormState>(key: Key, value: AgentsFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySettings = async (
    nextFlags: { readonly multiAgentEnabled: boolean; readonly multiAgentV2Enabled: boolean },
    role: AgentsConfigRoleUpdateInput | null,
  ) => {
    const core = parseCoreAgentSettings(form, t);
    if ("error" in core) {
      setFeedback({ kind: "error", message: core.error });
      return;
    }

    setSaving(true);
    try {
      await props.applyAgentsConfig({
        ...nextFlags,
        ...core.settings,
        role,
      });
      await props.refreshConfigSnapshot();
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (key: "multi_agent" | "multi_agent_v2") => {
    await applySettings({
      multiAgentEnabled: key === "multi_agent" ? !multiAgentEnabled : multiAgentEnabled,
      multiAgentV2Enabled: key === "multi_agent_v2" ? !multiAgentV2Enabled : multiAgentV2Enabled,
    }, null);
  };

  const handleAdvancedApply = async () => {
    const role = parseRoleUpdate(form, t);
    if ("error" in role) {
      setFeedback({ kind: "error", message: role.error });
      return;
    }

    await applySettings({
      multiAgentEnabled,
      multiAgentV2Enabled,
    }, role.role);
  };

  return (
    <div className={panelClassName}>
      <AgentsSectionHeader
        embedded={props.embedded}
        title={t("settings.agents.title")}
        subtitle={t("settings.agents.subtitle")}
      />
      <section className="settings-card settings-config-card settings-agents-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.agents.multiAgentFlag")}</div>
            <p className="settings-row-meta">{t("settings.agents.multiAgentFlagDesc")}</p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={multiAgentEnabled}
              disabled={disabled}
              label={t("settings.agents.multiAgentFlag")}
              onToggle={() => void handleToggle("multi_agent")}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.agents.multiAgentV2Flag")}</div>
            <p className="settings-row-meta">{t("settings.agents.multiAgentV2FlagDesc")}</p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={multiAgentV2Enabled}
              disabled={disabled}
              label={t("settings.agents.multiAgentV2Flag")}
              onToggle={() => void handleToggle("multi_agent_v2")}
            />
          </div>
        </div>
        <div className="settings-agents-advanced">
          <button
            type="button"
            className="settings-agents-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span>{t("settings.agents.advancedTitle")}</span>
            <span aria-hidden="true">{advancedOpen ? "-" : "+"}</span>
          </button>
          {advancedOpen && (
            <div className="settings-agents-advanced-panel">
              <div className="settings-agents-grid">
                <NumberField
                  disabled={disabled}
                  label={t("settings.agents.maxThreads")}
                  description={t("settings.agents.maxThreadsDesc")}
                  min={1}
                  value={form.maxThreads}
                  onChange={(value) => updateForm("maxThreads", value)}
                />
                <NumberField
                  disabled={disabled}
                  label={t("settings.agents.maxDepth")}
                  description={t("settings.agents.maxDepthDesc")}
                  min={0}
                  value={form.maxDepth}
                  onChange={(value) => updateForm("maxDepth", value)}
                />
                <NumberField
                  disabled={disabled}
                  label={t("settings.agents.jobMaxRuntimeSeconds")}
                  description={t("settings.agents.jobMaxRuntimeSecondsDesc")}
                  min={1}
                  value={form.jobMaxRuntimeSeconds}
                  onChange={(value) => updateForm("jobMaxRuntimeSeconds", value)}
                />
              </div>
              <div className="settings-agents-role-editor">
                <div className="settings-agents-role-heading">
                  <strong>{t("settings.agents.roleTitle")}</strong>
                  <p>{t("settings.agents.roleDesc")}</p>
                </div>
                <div className="settings-agents-grid">
                  <TextField
                    disabled={disabled}
                    label={t("settings.agents.roleName")}
                    description={t("settings.agents.roleNameDesc")}
                    placeholder="reviewer"
                    value={form.roleName}
                    onChange={(value) => updateForm("roleName", value)}
                  />
                  <TextField
                    disabled={disabled}
                    label={t("settings.agents.roleConfigFile")}
                    description={t("settings.agents.roleConfigFileDesc")}
                    placeholder="agents/reviewer.toml"
                    value={form.roleConfigFile}
                    onChange={(value) => updateForm("roleConfigFile", value)}
                  />
                  <TextField
                    disabled={disabled}
                    label={t("settings.agents.nicknameCandidates")}
                    description={t("settings.agents.nicknameCandidatesDesc")}
                    placeholder="Atlas, Delta, Echo"
                    value={form.roleNicknames}
                    onChange={(value) => updateForm("roleNicknames", value)}
                  />
                </div>
                <label className="settings-agents-field settings-agents-field-wide">
                  <span>{t("settings.agents.roleDescription")}</span>
                  <small>{t("settings.agents.roleDescriptionDesc")}</small>
                  <textarea
                    value={form.roleDescription}
                    disabled={disabled}
                    placeholder={t("settings.agents.descriptionPlaceholder")}
                    onChange={(event) => updateForm("roleDescription", event.currentTarget.value)}
                  />
                </label>
              </div>
              {roles.length > 0 && (
                <div className="settings-agents-role-list">
                  <strong>{t("settings.agents.configuredRoles")}</strong>
                  <div>
                    {roles.map((role) => (
                      <span key={role.name} className="settings-agents-role-chip" title={role.configFile ?? role.description ?? role.name}>
                        {role.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="settings-save-row settings-agents-save-row">
                <button
                  type="button"
                  className="settings-save-btn"
                  disabled={disabled}
                  onClick={() => void handleAdvancedApply()}
                >
                  {saving ? t("settings.agents.applying") : t("settings.agents.apply")}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      <StatusNote feedback={feedback} />
    </div>
  );
}
