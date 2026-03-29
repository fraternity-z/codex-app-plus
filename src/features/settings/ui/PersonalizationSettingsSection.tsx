import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GlobalAgentInstructionsOutput,
  UpdateGlobalAgentInstructionsInput
} from "../../../bridge/types";
import { useI18n, type MessageKey } from "../../../i18n";
import type { Personality } from "../../../protocol/generated/Personality";
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
  readonly writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
}

interface SaveFeedback {
  readonly kind: "idle" | "success" | "error";
  readonly message: string;
}

type Translator = ReturnType<typeof useI18n>["t"];

interface GlobalInstructionsState {
  readonly path: string;
  readonly loaded: boolean;
  readonly savedContent: string;
  readonly draftContent: string;
}

const GLOBAL_AGENTS_FALLBACK_PATH = "~/.codex/AGENTS.md";
const EMPTY_FEEDBACK: SaveFeedback = { kind: "idle", message: "" };

const INITIAL_INSTRUCTIONS_STATE: GlobalInstructionsState = {
  path: GLOBAL_AGENTS_FALLBACK_PATH,
  loaded: false,
  savedContent: "",
  draftContent: ""
};
const PERSONALITY_MESSAGE_KEYS: Record<Personality, {
  readonly label: MessageKey;
  readonly description: MessageKey;
}> = {
  none: {
    label: "settings.personalization.none.label",
    description: "settings.personalization.none.description"
  },
  friendly: {
    label: "settings.personalization.friendly.label",
    description: "settings.personalization.friendly.description"
  },
  pragmatic: {
    label: "settings.personalization.pragmatic.label",
    description: "settings.personalization.pragmatic.description"
  }
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  t: Translator
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

function toLoadedState(output: GlobalAgentInstructionsOutput): GlobalInstructionsState {
  return {
    path: output.path,
    loaded: true,
    savedContent: output.content,
    draftContent: output.content
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
      .then((output) => active && (setInstructionsState(toLoadedState(output)), setFeedback(EMPTY_FEEDBACK)))
      .catch((error) => active && setFeedback({
        kind: "error",
        message: props.t("settings.personalization.loadFailed", { error: toErrorMessage(error) })
      }));
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

  return {
    dirty,
    feedback,
    handleChange,
    handleSave,
    instructionsState,
    personalityCopy,
    selectedPersonality,
    styleFeedback,
    styleOptions,
    styleSaving,
    handleStyleChange,
  };
}

export function PersonalizationSettingsSection(
  props: PersonalizationSettingsSectionProps
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
          path: controller.instructionsState.path
        })}
        ariaLabel={t("settings.personalization.instructionsAriaLabel")}
        saveLabel={t("settings.personalization.instructionsSaveAction")}
        savingLabel={t("settings.personalization.instructionsSaving")}
        value={controller.instructionsState.draftContent}
        feedback={controller.feedback}
        onChange={controller.handleChange}
        onSave={controller.handleSave}
      />
    </div>
  );
}
