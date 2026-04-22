import { useEffect, useMemo, useState } from "react";
import type {
  AgentsSettingsOutput,
  CreateAgentInput,
  DeleteAgentInput,
  UpdateAgentInput,
} from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigMutationResult } from "../config/configOperations";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";

interface AgentsSettingsSectionProps {
  readonly busy: boolean;
  readonly embedded?: boolean;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly experimentalFeatures: ReadonlyArray<ExperimentalFeature>;
  readonly onOpenConfigToml: () => Promise<void>;
  readonly refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  readonly getAgentsSettings: () => Promise<AgentsSettingsOutput>;
  readonly createAgent: (input: CreateAgentInput) => Promise<AgentsSettingsOutput>;
  readonly updateAgent: (input: UpdateAgentInput) => Promise<AgentsSettingsOutput>;
  readonly deleteAgent: (input: DeleteAgentInput) => Promise<AgentsSettingsOutput>;
  readonly readAgentConfig: (name: string) => Promise<{ readonly content: string }>;
  readonly writeAgentConfig: (name: string, content: string) => Promise<{ readonly content: string }>;
  readonly batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
}

interface Feedback {
  readonly kind: "idle" | "success" | "error";
  readonly message: string;
}

const EMPTY_FEEDBACK: Feedback = { kind: "idle", message: "" };
const MIN_THREADS = 1;
const MAX_THREADS = 12;
const MIN_DEPTH = 1;
const MAX_DEPTH = 4;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readLimitsFromSnapshot(snapshot: unknown): { readonly maxThreads: number; readonly maxDepth: number } {
  const config = (snapshot as { config?: Record<string, unknown> } | null)?.config;
  const agents = config && typeof config === "object" ? (config.agents as Record<string, unknown> | undefined) : undefined;
  const maxThreads = typeof agents?.max_threads === "number" ? agents.max_threads : 6;
  const maxDepth = typeof agents?.max_depth === "number" ? agents.max_depth : 1;
  return { maxThreads, maxDepth };
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
  const [settings, setSettings] = useState<AgentsSettingsOutput | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(EMPTY_FEEDBACK);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [configAgentName, setConfigAgentName] = useState<string | null>(null);
  const [configContent, setConfigContent] = useState("");
  const [configDirty, setConfigDirty] = useState(false);

  const snapshotLimits = useMemo(() => readLimitsFromSnapshot(props.configSnapshot), [props.configSnapshot]);
  const currentThreads = settings?.maxThreads ?? snapshotLimits.maxThreads;
  const currentDepth = settings?.maxDepth ?? snapshotLimits.maxDepth;

  const reload = async () => {
    setLoading(true);
    try {
      setSettings(await props.getAgentsSettings());
      setFeedback(EMPTY_FEEDBACK);
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const writeLimits = async (nextThreads: number, nextDepth: number) => {
    const writeTarget = readUserConfigWriteTarget(props.configSnapshot);
    await props.batchWriteConfig({
      edits: [
        { keyPath: "agents.max_threads", value: nextThreads, mergeStrategy: "upsert" },
        { keyPath: "agents.max_depth", value: nextDepth, mergeStrategy: "upsert" },
      ],
      filePath: writeTarget.filePath,
      expectedVersion: writeTarget.expectedVersion,
    });
    await props.refreshConfigSnapshot();
    await reload();
  };

  const handleThreadsStep = async (delta: number) => {
    const nextValue = Math.max(MIN_THREADS, Math.min(MAX_THREADS, currentThreads + delta));
    if (nextValue === currentThreads) {
      return;
    }
    try {
      await writeLimits(nextValue, currentDepth);
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  const handleDepthStep = async (delta: number) => {
    const nextValue = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, currentDepth + delta));
    if (nextValue === currentDepth) {
      return;
    }
    try {
      await writeLimits(currentThreads, nextValue);
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  const handleCreateOrUpdate = async () => {
    try {
      if (editingName === null) {
        setSettings(await props.createAgent({ name: nameDraft, description: descriptionDraft || null }));
      } else {
        setSettings(await props.updateAgent({
          originalName: editingName,
          name: nameDraft,
          description: descriptionDraft || null,
        }));
      }
      setEditingName(null);
      setNameDraft("");
      setDescriptionDraft("");
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  const handleDelete = async (name: string) => {
    try {
      setSettings(await props.deleteAgent({ name }));
      if (configAgentName === name) {
        setConfigAgentName(null);
        setConfigContent("");
        setConfigDirty(false);
      }
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  const openConfigEditor = async (name: string) => {
    try {
      const result = await props.readAgentConfig(name);
      setConfigAgentName(name);
      setConfigContent(result.content);
      setConfigDirty(false);
      setFeedback(EMPTY_FEEDBACK);
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  const saveConfig = async () => {
    if (configAgentName === null) {
      return;
    }
    try {
      const result = await props.writeAgentConfig(configAgentName, configContent);
      setConfigContent(result.content);
      setConfigDirty(false);
      await reload();
      setFeedback({ kind: "success", message: t("settings.agents.saved") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
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
            <div className="settings-row-heading">{t("settings.agents.configFile")}</div>
            <p className="settings-row-meta">{settings?.configPath ?? "~/.codex/config.toml"}</p>
          </div>
          <button type="button" className="settings-action-btn" onClick={() => void props.onOpenConfigToml()}>
            {t("settings.agents.openConfig")}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.agents.maxThreads")}</div>
            <p className="settings-row-meta">{t("settings.agents.maxThreadsDesc")}</p>
          </div>
          <div className="settings-row-control">
            <div className="settings-stepper">
              <button type="button" className="settings-stepper-btn" onClick={() => void handleThreadsStep(-1)} disabled={currentThreads <= MIN_THREADS} aria-label="-">−</button>
              <span className="settings-stepper-value">{currentThreads}</span>
              <button type="button" className="settings-stepper-btn" onClick={() => void handleThreadsStep(1)} disabled={currentThreads >= MAX_THREADS} aria-label="+">+</button>
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.agents.maxDepth")}</div>
            <p className="settings-row-meta">{t("settings.agents.maxDepthDesc")}</p>
          </div>
          <div className="settings-row-control">
            <div className="settings-stepper">
              <button type="button" className="settings-stepper-btn" onClick={() => void handleDepthStep(-1)} disabled={currentDepth <= MIN_DEPTH} aria-label="-">−</button>
              <span className="settings-stepper-value">{currentDepth}</span>
              <button type="button" className="settings-stepper-btn" onClick={() => void handleDepthStep(1)} disabled={currentDepth >= MAX_DEPTH} aria-label="+">+</button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-section-head">
          <strong>{editingName === null ? t("settings.agents.create") : t("settings.agents.edit")}</strong>
          <button type="button" className="settings-head-action" onClick={() => void handleCreateOrUpdate()} disabled={!nameDraft.trim()}>
            {t("settings.agents.save")}
          </button>
        </div>
        <p className="settings-note settings-note-pad">{t("settings.agents.roleDesc")}</p>
        <input className="settings-text-input" style={{ width: "calc(100% - 36px)", margin: "0 18px 12px" }} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="researcher" />
        <textarea className="settings-textarea settings-textarea-sm" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder={t("settings.agents.descriptionPlaceholder")} />
      </section>

      <section className="settings-card">
        <div className="settings-section-head">
          <strong>{t("settings.agents.configured")}</strong>
          <button type="button" className="settings-head-action" onClick={() => void reload()} disabled={loading}>
            {t("settings.agents.refresh")}
          </button>
        </div>
        {settings?.agents.length ? settings.agents.map((agent) => (
          <div className="settings-row" key={agent.name}>
            <div className="settings-row-copy">
              <div className="settings-row-heading">{agent.name}</div>
              <p className="settings-row-meta">{agent.description ?? t("settings.agents.noDescription")}</p>
              <p className="settings-row-meta">{agent.configFile || t("settings.agents.noConfigFile")}</p>
            </div>
            <div className="settings-row-control">
              <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => { setEditingName(agent.name); setNameDraft(agent.name); setDescriptionDraft(agent.description ?? ""); }}>{t("settings.agents.editAction")}</button>
              <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => void openConfigEditor(agent.name)}>{t("settings.agents.editConfig")}</button>
              <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => void handleDelete(agent.name)}>{t("settings.agents.deleteAction")}</button>
            </div>
          </div>
        )) : <p className="settings-note">{t("settings.agents.empty")}</p>}
      </section>

      {configAgentName !== null && (
        <section className="settings-card">
          <div className="settings-section-head">
            <strong>{t("settings.agents.editConfigTitle", { name: configAgentName })}</strong>
            <button type="button" className="settings-head-action" onClick={() => void saveConfig()} disabled={!configDirty}>{t("settings.agents.save")}</button>
          </div>
          <textarea
            className="settings-textarea"
            value={configContent}
            onChange={(event) => {
              setConfigContent(event.target.value);
              setConfigDirty(true);
            }}
          />
        </section>
      )}

      <StatusNote feedback={feedback} />
    </div>
  );
}
