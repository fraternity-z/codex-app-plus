import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  GlobalAgentInstructionsOutput,
  ManagedPromptOutput,
  UpdateGlobalAgentInstructionsInput,
} from "../../../bridge/types";
import { useI18n, type MessageKey } from "../../../i18n";
import type { Personality } from "../../../protocol/generated/Personality";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import { readPersonalizationConfigView } from "../config/personalizationConfig";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import {
  SettingsSelectRow,
  type SettingsSelectOption,
} from "./SettingsSelectRow";

interface PersonalizationSettingsSectionProps {
  readonly configSnapshot: unknown;
  readonly busy: boolean;
  readonly writeConfigValue: (params: ConfigValueWriteParams) => Promise<unknown>;
  readonly readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
  readonly listManagedPrompts: () => Promise<ReadonlyArray<ManagedPromptOutput>>;
  readonly upsertManagedPrompt: (input: {
    readonly previousName?: string | null;
    readonly name: string;
    readonly content: string;
  }) => Promise<ManagedPromptOutput>;
  readonly deleteManagedPrompt: (name: string) => Promise<void>;
  readonly setUserModelInstructionsFile: (path: string | null) => Promise<void>;
  readonly refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  readonly writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
}

interface SaveFeedback {
  readonly kind: "idle" | "success" | "error";
  readonly message: string;
}

interface GlobalInstructionsState {
  readonly path: string;
  readonly loaded: boolean;
  readonly savedContent: string;
  readonly draftContent: string;
}

interface ManagedPromptEditorState {
  readonly loaded: boolean;
  readonly prompts: ReadonlyArray<ManagedPromptOutput>;
  readonly appliedPath: string | null;
  readonly lastPromptPath: string | null;
  readonly dialog: ManagedPromptDialogState | null;
}

interface ManagedPromptDialogState {
  readonly mode: "create" | "edit";
  readonly previousName: string | null;
  readonly draftName: string;
  readonly draftContent: string;
}

type Translator = ReturnType<typeof useI18n>["t"];
type PromptActionState = "idle" | "loading" | "saving" | "applying" | "deleting" | "disabling";

const GLOBAL_AGENTS_FALLBACK_PATH = "~/.codex/AGENTS.md";
const MANAGED_PROMPTS_DIR = "~/.codex/prompts/codex-app-plus";
const DEFAULT_PROMPT_NAME = "system-prompt";
const EMPTY_FEEDBACK: SaveFeedback = { kind: "idle", message: "" };

const INITIAL_INSTRUCTIONS_STATE: GlobalInstructionsState = {
  path: GLOBAL_AGENTS_FALLBACK_PATH,
  loaded: false,
  savedContent: "",
  draftContent: "",
};

const INITIAL_MANAGED_PROMPT_STATE: ManagedPromptEditorState = {
  loaded: false,
  prompts: [],
  appliedPath: null,
  lastPromptPath: null,
  dialog: null,
};

const PERSONALITY_MESSAGE_KEYS: Record<Personality, {
  readonly label: MessageKey;
  readonly description: MessageKey;
}> = {
  none: {
    label: "settings.personalization.none.label",
    description: "settings.personalization.none.description",
  },
  friendly: {
    label: "settings.personalization.friendly.label",
    description: "settings.personalization.friendly.description",
  },
  pragmatic: {
    label: "settings.personalization.pragmatic.label",
    description: "settings.personalization.pragmatic.description",
  },
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizePromptPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") {
    return null;
  }
  const normalized = path.trim().replace(/\\/g, "/").toLowerCase();
  return normalized.length === 0 ? null : normalized;
}

function toPromptStem(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().endsWith(".md")) {
    return trimmed.slice(0, -3).trim();
  }
  return trimmed;
}

function buildManagedPromptDisplayPath(name: string): string {
  const stem = toPromptStem(name);
  if (stem.length === 0) {
    return `${MANAGED_PROMPTS_DIR}/`;
  }
  return `${MANAGED_PROMPTS_DIR}/${stem}.md`;
}

function createNewPromptName(prompts: ReadonlyArray<ManagedPromptOutput>): string {
  const names = new Set(prompts.map((item) => item.name.toLowerCase()));
  if (!names.has(DEFAULT_PROMPT_NAME)) {
    return DEFAULT_PROMPT_NAME;
  }
  let index = 2;
  while (names.has(`${DEFAULT_PROMPT_NAME}-${index}`.toLowerCase())) {
    index += 1;
  }
  return `${DEFAULT_PROMPT_NAME}-${index}`;
}

function createPromptDialogState(
  mode: ManagedPromptDialogState["mode"],
  prompt: ManagedPromptOutput | null,
  prompts: ReadonlyArray<ManagedPromptOutput>,
): ManagedPromptDialogState {
  if (prompt === null) {
    return {
      mode,
      previousName: null,
      draftName: createNewPromptName(prompts),
      draftContent: "",
    };
  }
  return {
    mode,
    previousName: prompt.name,
    draftName: prompt.name,
    draftContent: prompt.content,
  };
}

function findPromptByPath(
  prompts: ReadonlyArray<ManagedPromptOutput>,
  path: string | null,
): ManagedPromptOutput | null {
  const normalizedPath = normalizePromptPath(path);
  if (normalizedPath === null) {
    return null;
  }
  return prompts.find((item) => normalizePromptPath(item.path) === normalizedPath) ?? null;
}

function findPromptForEnable(
  prompts: ReadonlyArray<ManagedPromptOutput>,
  lastPromptPath: string | null,
): ManagedPromptOutput | null {
  return findPromptByPath(prompts, lastPromptPath) ?? prompts[0] ?? null;
}

function StatusNote(props: {
  readonly feedback: SaveFeedback;
  readonly pendingMessage?: string;
}): JSX.Element | null {
  if (props.pendingMessage) {
    return <p className="settings-status-note">{props.pendingMessage}</p>;
  }
  if (props.feedback.kind === "success") {
    return <p className="settings-status-note settings-status-note-success">{props.feedback.message}</p>;
  }
  if (props.feedback.kind === "error") {
    return <p className="settings-status-note settings-status-note-error">{props.feedback.message}</p>;
  }
  return null;
}

function createPersonalityOptions(
  t: Translator,
): ReadonlyArray<SettingsSelectOption<Personality>> {
  return [
    { value: "none", label: t(PERSONALITY_MESSAGE_KEYS.none.label) },
    { value: "friendly", label: t(PERSONALITY_MESSAGE_KEYS.friendly.label) },
    { value: "pragmatic", label: t(PERSONALITY_MESSAGE_KEYS.pragmatic.label) },
  ];
}

async function writePersonalityConfigValue(
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<unknown>,
  configSnapshot: unknown,
  personality: Personality,
): Promise<void> {
  const writeTarget = readUserConfigWriteTarget(configSnapshot);
  await writeConfigValue({
    keyPath: "personality",
    value: personality,
    mergeStrategy: "replace",
    filePath: writeTarget.filePath,
    expectedVersion: writeTarget.expectedVersion,
  });
}

async function applyManagedPromptConfigValues(
  setUserModelInstructionsFile: (path: string | null) => Promise<void>,
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>,
  promptPath: string,
): Promise<void> {
  await setUserModelInstructionsFile(promptPath);
  await refreshConfigSnapshot();
}

async function removeManagedPromptConfigValues(
  setUserModelInstructionsFile: (path: string | null) => Promise<void>,
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>,
): Promise<void> {
  await setUserModelInstructionsFile(null);
  await refreshConfigSnapshot();
}

function PersonalizationStyleCard(props: {
  readonly title: string;
  readonly description: string;
  readonly value: Personality;
  readonly options: ReadonlyArray<SettingsSelectOption<Personality>>;
  readonly disabled: boolean;
  readonly saving: boolean;
  readonly feedback: SaveFeedback;
  readonly savingLabel: string;
  onChange: (value: Personality) => Promise<void>;
}): JSX.Element {
  return (
    <section className="settings-card">
      <SettingsSelectRow
        label={props.title}
        description={props.description}
        value={props.value}
        options={props.options}
        disabled={props.disabled}
        onChange={(value) => void props.onChange(value)}
      />
      <StatusNote
        feedback={props.feedback}
        pendingMessage={props.saving ? props.savingLabel : undefined}
      />
    </section>
  );
}

function InstructionsCard(props: {
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly title: string;
  readonly description: string;
  readonly ariaLabel: string;
  readonly saveLabel: string;
  readonly savingLabel: string;
  readonly value: string;
  readonly feedback: SaveFeedback;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
}): JSX.Element {
  return (
    <section className="settings-card">
      <div className="settings-section-head">
        <strong>{props.title}</strong>
        <button
          type="button"
          className="settings-head-action"
          onClick={() => void props.onSave()}
          disabled={props.busy || !props.dirty}
        >
          {props.busy ? props.savingLabel : props.saveLabel}
        </button>
      </div>
      <p className="settings-note settings-note-pad">{props.description}</p>
      <textarea
        className="settings-textarea"
        aria-label={props.ariaLabel}
        value={props.value}
        disabled={props.busy}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <StatusNote feedback={props.feedback} />
    </section>
  );
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-label={props.label}
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function ManagedPromptDialog(props: {
  readonly dialog: ManagedPromptDialogState | null;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly createTitle: string;
  readonly editTitle: string;
  readonly closeLabel: string;
  readonly cancelLabel: string;
  readonly saveLabel: string;
  readonly savingLabel: string;
  readonly nameLabel: string;
  readonly contentLabel: string;
  readonly pathPreviewLabel: string;
  onCancel: () => void;
  onSave: () => Promise<void>;
  onChangeName: (value: string) => void;
  onChangeContent: (value: string) => void;
}): JSX.Element | null {
  const dialog = props.dialog;
  if (dialog === null) {
    return null;
  }
  const title = dialog.mode === "create" ? props.createTitle : props.editTitle;
  const disableSave = props.busy || dialog.draftName.trim().length === 0 || !props.dirty;
  const currentPath = buildManagedPromptDisplayPath(dialog.draftName);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void props.onSave();
  };

  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={props.onCancel}>
      <section
        className="settings-dialog settings-prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <strong>{title}</strong>
          <button type="button" className="settings-dialog-close" onClick={props.onCancel} aria-label={props.closeLabel}>×</button>
        </header>
        <form className="settings-dialog-body settings-prompt-dialog-body" onSubmit={handleSubmit}>
          <label className="settings-prompt-field">
            <span className="settings-prompt-field-label">{props.nameLabel}</span>
            <div className="settings-prompt-name-row">
              <input
                className="settings-text-input settings-prompt-name-input"
                aria-label={props.nameLabel}
                value={dialog.draftName}
                disabled={props.busy}
                onChange={(event) => props.onChangeName(event.target.value)}
              />
              <span className="settings-prompt-name-suffix">.md</span>
            </div>
          </label>
          <p className="settings-note settings-prompt-path-preview">
            {props.pathPreviewLabel.replace("{path}", currentPath)}
          </p>
          <label className="settings-prompt-field">
            <span className="settings-prompt-field-label">{props.contentLabel}</span>
            <textarea
              className="settings-textarea settings-prompt-textarea"
              aria-label={props.contentLabel}
              value={dialog.draftContent}
              disabled={props.busy}
              onChange={(event) => props.onChangeContent(event.target.value)}
            />
          </label>
          <div className="settings-prompt-actions">
            <button type="button" className="settings-action-btn" onClick={props.onCancel} disabled={props.busy}>
              {props.cancelLabel}
            </button>
            <button type="submit" className="settings-action-btn settings-action-btn-primary" disabled={disableSave}>
              {props.busy ? props.savingLabel : props.saveLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ManagedPromptManagerCard(props: {
  readonly busy: boolean;
  readonly loaded: boolean;
  readonly prompts: ReadonlyArray<ManagedPromptOutput>;
  readonly modelInstructionsFile: string | null;
  readonly enabled: boolean;
  readonly dialog: ManagedPromptDialogState | null;
  readonly dialogDirty: boolean;
  readonly title: string;
  readonly description: string;
  readonly enabledSummary: string;
  readonly disabledSummary: string;
  readonly switchLabel: string;
  readonly emptyLabel: string;
  readonly listAriaLabel: string;
  readonly nameLabel: string;
  readonly contentLabel: string;
  readonly pathPreviewLabel: string;
  readonly activeBadge: string;
  readonly newLabel: string;
  readonly saveLabel: string;
  readonly cancelLabel: string;
  readonly closeLabel: string;
  readonly editLabel: string;
  readonly applyLabel: string;
  readonly deleteLabel: string;
  readonly dialogCreateTitle: string;
  readonly dialogEditTitle: string;
  readonly savingLabel: string;
  readonly feedback: SaveFeedback;
  readonly actionState: PromptActionState;
  onCreatePrompt: () => void;
  onEditPrompt: (name: string) => void;
  onSavePrompt: () => Promise<void>;
  onApplyPrompt: (name: string) => Promise<void>;
  onDeletePrompt: (name: string) => Promise<void>;
  onToggleEnabled: () => Promise<void>;
  onCancelDialog: () => void;
  onChangeName: (value: string) => void;
  onChangeContent: (value: string) => void;
}): JSX.Element {
  const disabled = props.busy || !props.loaded;
  const summary = props.enabled ? props.enabledSummary : props.disabledSummary;

  return (
    <section className="settings-card">
      <div className="settings-section-head settings-prompt-head">
        <strong>{props.title}</strong>
        <div className="settings-prompt-head-actions">
          <span className="settings-prompt-switch-label">{props.switchLabel}</span>
          <ToggleSwitch
            checked={props.enabled}
            disabled={disabled || props.actionState !== "idle"}
            label={props.switchLabel}
            onClick={() => void props.onToggleEnabled()}
          />
          <button
            type="button"
            className="settings-head-action"
            onClick={props.onCreatePrompt}
            disabled={disabled || props.actionState !== "idle"}
          >
            {props.newLabel}
          </button>
        </div>
      </div>
      <p className="settings-note">{props.description}</p>
      <p className="settings-note settings-prompt-summary">{summary}</p>
      <div className="settings-prompt-manager">
        <div className="settings-prompt-list" aria-label={props.listAriaLabel}>
          {props.prompts.length === 0 ? (
            <p className="settings-prompt-empty">{props.emptyLabel}</p>
          ) : props.prompts.map((prompt) => {
            const applied = normalizePromptPath(prompt.path) === normalizePromptPath(props.modelInstructionsFile);
            return (
              <div
                key={prompt.name}
                className={[
                  "settings-prompt-row",
                  applied ? "settings-prompt-row-active" : "",
                ].filter(Boolean).join(" ")}
              >
                <div className="settings-prompt-row-main">
                  <div className="settings-prompt-row-title">
                    <strong>{prompt.name}</strong>
                    {applied ? <span className="settings-prompt-item-badge">{props.activeBadge}</span> : null}
                  </div>
                  <span className="settings-prompt-item-path">{prompt.path}</span>
                </div>
                <div className="settings-prompt-row-actions">
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn-sm"
                    aria-label={`${props.applyLabel} ${prompt.name}`}
                    disabled={disabled || props.actionState !== "idle"}
                    onClick={() => void props.onApplyPrompt(prompt.name)}
                  >
                    {props.applyLabel}
                  </button>
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn-sm"
                    aria-label={`${props.editLabel} ${prompt.name}`}
                    disabled={disabled || props.actionState !== "idle"}
                    onClick={() => props.onEditPrompt(prompt.name)}
                  >
                    {props.editLabel}
                  </button>
                  <button
                    type="button"
                    className="settings-action-btn settings-action-btn-sm settings-prompt-danger-btn"
                    aria-label={`${props.deleteLabel} ${prompt.name}`}
                    disabled={disabled || props.actionState !== "idle"}
                    onClick={() => void props.onDeletePrompt(prompt.name)}
                  >
                    {props.deleteLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <StatusNote feedback={props.feedback} />
      <ManagedPromptDialog
        dialog={props.dialog}
        busy={props.busy || props.actionState === "saving"}
        dirty={props.dialogDirty}
        createTitle={props.dialogCreateTitle}
        editTitle={props.dialogEditTitle}
        closeLabel={props.closeLabel}
        cancelLabel={props.cancelLabel}
        saveLabel={props.saveLabel}
        savingLabel={props.savingLabel}
        nameLabel={props.nameLabel}
        contentLabel={props.contentLabel}
        pathPreviewLabel={props.pathPreviewLabel}
        onCancel={props.onCancelDialog}
        onSave={props.onSavePrompt}
        onChangeName={props.onChangeName}
        onChangeContent={props.onChangeContent}
      />
    </section>
  );
}

function toLoadedState(output: GlobalAgentInstructionsOutput): GlobalInstructionsState {
  return {
    path: output.path,
    loaded: true,
    savedContent: output.content,
    draftContent: output.content,
  };
}

function usePersonalityEditor(props: {
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  readonly personality: Personality;
  readonly t: Translator;
  readonly writeConfigValue: (params: ConfigValueWriteParams) => Promise<unknown>;
}) {
  const [savedPersonality, setSavedPersonality] = useState(props.personality);
  const [selectedPersonality, setSelectedPersonality] = useState(props.personality);
  const [feedback, setFeedback] = useState<SaveFeedback>(EMPTY_FEEDBACK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSavedPersonality(props.personality);
    setSelectedPersonality(props.personality);
  }, [props.personality]);

  const handleChange = useCallback(async (nextPersonality: Personality) => {
    if (props.busy || saving || nextPersonality === selectedPersonality) {
      return;
    }
    const previousPersonality = savedPersonality;
    setSelectedPersonality(nextPersonality);
    setSaving(true);
    setFeedback(EMPTY_FEEDBACK);
    try {
      await writePersonalityConfigValue(
        props.writeConfigValue,
        props.configSnapshot,
        nextPersonality,
      );
      setSavedPersonality(nextPersonality);
      setFeedback({
        kind: "success",
        message: props.t("settings.personalization.styleSyncedMessage"),
      });
    } catch (error) {
      setSelectedPersonality(previousPersonality);
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [
    props.busy,
    props.configSnapshot,
    props.t,
    props.writeConfigValue,
    savedPersonality,
    saving,
    selectedPersonality,
  ]);

  return { selectedPersonality, feedback, saving, handleChange };
}

function useGlobalInstructionsEditor(props: {
  readonly t: Translator;
  readonly readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
  readonly writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
}) {
  const [instructionsState, setInstructionsState] = useState(INITIAL_INSTRUCTIONS_STATE);
  const [feedback, setFeedback] = useState<SaveFeedback>(EMPTY_FEEDBACK);

  useEffect(() => {
    let active = true;
    void props.readGlobalAgentInstructions()
      .then((output) => {
        if (!active) {
          return;
        }
        setInstructionsState(toLoadedState(output));
        setFeedback(EMPTY_FEEDBACK);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setFeedback({
          kind: "error",
          message: props.t("settings.personalization.loadFailed", { error: toErrorMessage(error) }),
        });
      });
    return () => {
      active = false;
    };
  }, [props.readGlobalAgentInstructions, props.t]);

  const dirty = instructionsState.draftContent !== instructionsState.savedContent;
  const handleChange = (value: string) => {
    setInstructionsState((current) => ({ ...current, draftContent: value }));
    setFeedback((current) => (current.kind === "idle" ? current : EMPTY_FEEDBACK));
  };

  const handleSave = async () => {
    setFeedback(EMPTY_FEEDBACK);
    try {
      const output = await props.writeGlobalAgentInstructions({ content: instructionsState.draftContent });
      setInstructionsState(toLoadedState(output));
      setFeedback({ kind: "success", message: props.t("settings.personalization.syncedMessage") });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    }
  };

  return { instructionsState, feedback, dirty, handleChange, handleSave };
}

function useManagedPromptEditor(props: {
  readonly busy: boolean;
  readonly modelInstructionsFile: string | null;
  readonly t: Translator;
  readonly setUserModelInstructionsFile: (path: string | null) => Promise<void>;
  readonly refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  readonly listManagedPrompts: () => Promise<ReadonlyArray<ManagedPromptOutput>>;
  readonly upsertManagedPrompt: (input: {
    readonly previousName?: string | null;
    readonly name: string;
    readonly content: string;
  }) => Promise<ManagedPromptOutput>;
  readonly deleteManagedPrompt: (name: string) => Promise<void>;
}) {
  const [state, setState] = useState(INITIAL_MANAGED_PROMPT_STATE);
  const [feedback, setFeedback] = useState<SaveFeedback>(EMPTY_FEEDBACK);
  const [actionState, setActionState] = useState<PromptActionState>("loading");

  const refreshPrompts = useCallback(async () => {
    const prompts = [...await props.listManagedPrompts()];
    setState((current) => ({ ...current, loaded: true, prompts }));
    return prompts;
  }, [props.listManagedPrompts]);

  useEffect(() => {
    let active = true;
    setActionState("loading");
    void props.listManagedPrompts()
      .then((prompts) => {
        if (!active) {
          return;
        }
        setState((current) => ({
          ...current,
          loaded: true,
          prompts,
          appliedPath: props.modelInstructionsFile ?? null,
          lastPromptPath: props.modelInstructionsFile ?? current.lastPromptPath,
        }));
        setFeedback(EMPTY_FEEDBACK);
        setActionState("idle");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setState((current) => ({ ...current, loaded: true }));
        setFeedback({
          kind: "error",
          message: props.t("settings.personalization.prompts.loadFailed", { error: toErrorMessage(error) }),
        });
        setActionState("idle");
      });
    return () => {
      active = false;
    };
  }, [props.listManagedPrompts, props.modelInstructionsFile, props.t]);

  useEffect(() => {
    setState((current) => ({
      ...current,
      appliedPath: props.modelInstructionsFile ?? current.appliedPath,
      lastPromptPath: props.modelInstructionsFile ?? current.lastPromptPath,
    }));
  }, [props.modelInstructionsFile]);

  const dialogDirty = state.dialog === null
    ? false
    : state.dialog.mode === "create"
      ? state.dialog.draftName.trim().length > 0 || state.dialog.draftContent.length > 0
      : (() => {
        const originalPrompt = state.prompts.find((item) => item.name === state.dialog?.previousName) ?? null;
        return originalPrompt === null
          || state.dialog.draftName !== originalPrompt.name
          || state.dialog.draftContent !== originalPrompt.content;
      })();

  const handleCreatePrompt = () => {
    setState((current) => ({
      ...current,
      dialog: createPromptDialogState("create", null, current.prompts),
    }));
    setFeedback(EMPTY_FEEDBACK);
  };

  const handleEditPrompt = (name: string) => {
    const prompt = state.prompts.find((item) => item.name === name) ?? null;
    if (prompt === null) {
      return;
    }
    setState((current) => ({
      ...current,
      dialog: createPromptDialogState("edit", prompt, current.prompts),
    }));
    setFeedback(EMPTY_FEEDBACK);
  };

  const handleCancelDialog = () => {
    setState((current) => ({ ...current, dialog: null }));
    setFeedback((current) => (current.kind === "idle" ? current : EMPTY_FEEDBACK));
  };

  const handleChangeName = (value: string) => {
    setState((current) => current.dialog === null
      ? current
      : { ...current, dialog: { ...current.dialog, draftName: value } });
    setFeedback((current) => (current.kind === "idle" ? current : EMPTY_FEEDBACK));
  };

  const handleChangeContent = (value: string) => {
    setState((current) => current.dialog === null
      ? current
      : { ...current, dialog: { ...current.dialog, draftContent: value } });
    setFeedback((current) => (current.kind === "idle" ? current : EMPTY_FEEDBACK));
  };

  const persistDialogPrompt = useCallback(async () => {
    if (state.dialog === null) {
      throw new Error("No prompt dialog is open.");
    }
    const originalPrompt = state.dialog.previousName === null
      ? null
      : state.prompts.find((item) => item.name === state.dialog?.previousName) ?? null;
    const wasApplied = originalPrompt !== null
      && normalizePromptPath(originalPrompt.path) === normalizePromptPath(state.appliedPath);
    const wasRememberedPrompt = originalPrompt !== null
      && normalizePromptPath(originalPrompt.path) === normalizePromptPath(state.lastPromptPath);
    const output = await props.upsertManagedPrompt({
      previousName: state.dialog.previousName,
      name: state.dialog.draftName,
      content: state.dialog.draftContent,
    });
    if (wasApplied) {
      await applyManagedPromptConfigValues(
        props.setUserModelInstructionsFile,
        props.refreshConfigSnapshot,
        output.path,
      );
    }
    await refreshPrompts();
    setState((current) => ({
      ...current,
      dialog: null,
      appliedPath: wasApplied ? output.path : current.appliedPath,
      lastPromptPath: wasApplied || wasRememberedPrompt ? output.path : current.lastPromptPath,
    }));
    return output;
  }, [
    props.setUserModelInstructionsFile,
    props.refreshConfigSnapshot,
    props.upsertManagedPrompt,
    refreshPrompts,
    state.appliedPath,
    state.dialog,
    state.lastPromptPath,
    state.prompts,
  ]);

  const handleSavePrompt = async () => {
    if (state.dialog === null) {
      return;
    }
    setFeedback(EMPTY_FEEDBACK);
    setActionState("saving");
    try {
      await persistDialogPrompt();
      setFeedback({
        kind: "success",
        message: props.t("settings.personalization.prompts.savedMessage"),
      });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setActionState("idle");
    }
  };

  const applyPrompt = useCallback(async (prompt: ManagedPromptOutput) => {
    await applyManagedPromptConfigValues(
      props.setUserModelInstructionsFile,
      props.refreshConfigSnapshot,
      prompt.path,
    );
    setState((current) => ({
      ...current,
      appliedPath: prompt.path,
      lastPromptPath: prompt.path,
    }));
      setFeedback({
        kind: "success",
        message: props.t("settings.personalization.prompts.appliedMessage", {
          path: prompt.path,
        }),
      });
  }, [props.setUserModelInstructionsFile, props.refreshConfigSnapshot, props.t]);

  const handleApplyPrompt = async (name: string) => {
    const prompt = state.prompts.find((item) => item.name === name) ?? null;
    if (prompt === null) {
      return;
    }
    setFeedback(EMPTY_FEEDBACK);
    setActionState("applying");
    try {
      await applyPrompt(prompt);
      await refreshPrompts();
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setActionState("idle");
    }
  };

  const handleToggleEnabled = async () => {
    const enabled = normalizePromptPath(state.appliedPath) !== null;
    if (!enabled) {
      const prompt = findPromptForEnable(state.prompts, state.lastPromptPath);
      if (prompt === null) {
        setFeedback({
          kind: "error",
          message: props.t("settings.personalization.prompts.enableEmptyMessage"),
        });
        return;
      }
      setFeedback(EMPTY_FEEDBACK);
      setActionState("applying");
      try {
        await applyPrompt(prompt);
      } catch (error) {
        setFeedback({ kind: "error", message: toErrorMessage(error) });
      } finally {
        setActionState("idle");
      }
      return;
    }

    setFeedback(EMPTY_FEEDBACK);
    setActionState("disabling");
    try {
      const previousPath = state.appliedPath;
      await removeManagedPromptConfigValues(
        props.setUserModelInstructionsFile,
        props.refreshConfigSnapshot,
      );
      setState((current) => ({
        ...current,
        appliedPath: null,
        lastPromptPath: previousPath ?? current.lastPromptPath,
      }));
      setFeedback({
        kind: "success",
        message: props.t("settings.personalization.prompts.disabledMessage"),
      });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setActionState("idle");
    }
  };

  const handleDeletePrompt = async (name: string) => {
    const prompt = state.prompts.find((item) => item.name === name) ?? null;
    if (prompt === null) {
      return;
    }
    const confirmMessage = props.t("settings.personalization.prompts.deleteConfirm", {
      name: prompt.name,
    });
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMessage)) {
      return;
    }

    setFeedback(EMPTY_FEEDBACK);
    setActionState("deleting");
    try {
      await props.deleteManagedPrompt(prompt.name);
      const deletedAppliedPrompt = normalizePromptPath(prompt.path) === normalizePromptPath(state.appliedPath);
      if (deletedAppliedPrompt) {
        await removeManagedPromptConfigValues(
          props.setUserModelInstructionsFile,
          props.refreshConfigSnapshot,
        );
      }
      const prompts = await refreshPrompts();
      setState((current) => ({
        ...current,
        appliedPath: deletedAppliedPrompt ? null : current.appliedPath,
        lastPromptPath: normalizePromptPath(prompt.path) === normalizePromptPath(current.lastPromptPath)
          ? prompts[0]?.path ?? null
          : current.lastPromptPath,
      }));
      setFeedback({
        kind: "success",
        message: props.t("settings.personalization.prompts.deletedMessage"),
      });
    } catch (error) {
      setFeedback({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setActionState("idle");
    }
  };

  return {
    actionState,
    appliedPath: state.appliedPath,
    dialogDirty,
    feedback,
    handleApplyPrompt,
    handleCancelDialog,
    handleChangeContent,
    handleChangeName,
    handleCreatePrompt,
    handleDeletePrompt,
    handleEditPrompt,
    handleSavePrompt,
    handleToggleEnabled,
    state,
  };
}

function usePersonalizationSettingsController(
  props: PersonalizationSettingsSectionProps,
  t: Translator,
) {
  const view = useMemo(
    () => readPersonalizationConfigView(props.configSnapshot),
    [props.configSnapshot],
  );
  const styleOptions = useMemo(() => createPersonalityOptions(t), [t]);
  const {
    selectedPersonality,
    feedback: styleFeedback,
    saving: styleSaving,
    handleChange: handleStyleChange,
  } = usePersonalityEditor({
    busy: props.busy,
    configSnapshot: props.configSnapshot,
    personality: view.personality,
    t,
    writeConfigValue: props.writeConfigValue,
  });
  const personalityCopy = useMemo(
    () => PERSONALITY_MESSAGE_KEYS[selectedPersonality],
    [selectedPersonality],
  );
  const {
    instructionsState,
    feedback,
    dirty,
    handleChange,
    handleSave,
  } = useGlobalInstructionsEditor({
    t,
    readGlobalAgentInstructions: props.readGlobalAgentInstructions,
    writeGlobalAgentInstructions: props.writeGlobalAgentInstructions,
  });
  const promptEditor = useManagedPromptEditor({
    busy: props.busy,
    modelInstructionsFile: view.modelInstructionsFile,
    t,
    setUserModelInstructionsFile: props.setUserModelInstructionsFile,
    refreshConfigSnapshot: props.refreshConfigSnapshot,
    listManagedPrompts: props.listManagedPrompts,
    upsertManagedPrompt: props.upsertManagedPrompt,
    deleteManagedPrompt: props.deleteManagedPrompt,
  });

  return {
    dirty,
    feedback,
    handleChange,
    handleSave,
    instructionsState,
    personalityCopy,
    promptEditor,
    selectedPersonality,
    styleFeedback,
    styleOptions,
    styleSaving,
    handleStyleChange,
    view,
  };
}

export function PersonalizationSettingsSection(
  props: PersonalizationSettingsSectionProps,
): JSX.Element {
  const { t } = useI18n();
  const controller = usePersonalizationSettingsController(props, t);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.personalization.title")}</h1>
      </header>
      <PersonalizationStyleCard
        title={t("settings.personalization.styleLabel")}
        description={t(controller.personalityCopy.description)}
        value={controller.selectedPersonality}
        options={controller.styleOptions}
        disabled={props.busy || controller.styleSaving}
        saving={controller.styleSaving}
        feedback={controller.styleFeedback}
        savingLabel={t("settings.personalization.styleSaving")}
        onChange={controller.handleStyleChange}
      />
      <InstructionsCard
        busy={props.busy || !controller.instructionsState.loaded}
        dirty={controller.dirty}
        title={t("settings.personalization.instructionsTitle")}
        description={t("settings.personalization.instructionsDescription", {
          path: controller.instructionsState.path,
        })}
        ariaLabel={t("settings.personalization.instructionsAriaLabel")}
        saveLabel={t("settings.personalization.instructionsSaveAction")}
        savingLabel={t("settings.personalization.instructionsSaving")}
        value={controller.instructionsState.draftContent}
        feedback={controller.feedback}
        onChange={controller.handleChange}
        onSave={controller.handleSave}
      />
      <ManagedPromptManagerCard
        busy={props.busy || controller.promptEditor.actionState !== "idle"}
        loaded={controller.promptEditor.state.loaded}
        prompts={controller.promptEditor.state.prompts}
        modelInstructionsFile={controller.promptEditor.appliedPath}
        enabled={normalizePromptPath(controller.promptEditor.appliedPath) !== null}
        dialog={controller.promptEditor.state.dialog}
        dialogDirty={controller.promptEditor.dialogDirty}
        title={t("settings.personalization.prompts.title")}
        description={t("settings.personalization.prompts.description", {
          directory: MANAGED_PROMPTS_DIR,
        })}
        enabledSummary={t("settings.personalization.prompts.enabledSummary", {
          path: controller.promptEditor.appliedPath ?? "",
        })}
        disabledSummary={t("settings.personalization.prompts.disabledSummary")}
        switchLabel={t("settings.personalization.prompts.switchLabel")}
        emptyLabel={t("settings.personalization.prompts.empty")}
        listAriaLabel={t("settings.personalization.prompts.listAriaLabel")}
        nameLabel={t("settings.personalization.prompts.nameLabel")}
        contentLabel={t("settings.personalization.prompts.contentLabel")}
        pathPreviewLabel={t("settings.personalization.prompts.pathPreview", {
          path: "{path}",
        })}
        activeBadge={t("settings.personalization.prompts.activeBadge")}
        newLabel={t("settings.personalization.prompts.newAction")}
        saveLabel={t("settings.personalization.prompts.saveAction")}
        cancelLabel={t("settings.personalization.prompts.cancelAction")}
        closeLabel={t("settings.personalization.prompts.closeAction")}
        editLabel={t("settings.personalization.prompts.editAction")}
        applyLabel={t("settings.personalization.prompts.applyAction")}
        deleteLabel={t("settings.personalization.prompts.deleteAction")}
        dialogCreateTitle={t("settings.personalization.prompts.dialogCreateTitle")}
        dialogEditTitle={t("settings.personalization.prompts.dialogEditTitle")}
        savingLabel={t("settings.personalization.prompts.saving")}
        feedback={controller.promptEditor.feedback}
        actionState={controller.promptEditor.actionState}
        onCreatePrompt={controller.promptEditor.handleCreatePrompt}
        onEditPrompt={controller.promptEditor.handleEditPrompt}
        onSavePrompt={controller.promptEditor.handleSavePrompt}
        onApplyPrompt={controller.promptEditor.handleApplyPrompt}
        onDeletePrompt={controller.promptEditor.handleDeletePrompt}
        onToggleEnabled={controller.promptEditor.handleToggleEnabled}
        onCancelDialog={controller.promptEditor.handleCancelDialog}
        onChangeName={controller.promptEditor.handleChangeName}
        onChangeContent={controller.promptEditor.handleChangeContent}
      />
    </div>
  );
}
