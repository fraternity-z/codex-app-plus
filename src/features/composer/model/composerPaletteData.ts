import type { ComposerPermissionLevel } from "./composerPermission";
import type { ComposerModelOption } from "./composerPreferences";
import type { ComposerCommandPaletteItem } from "../ui/ComposerCommandPalette";
import type { ComposerActiveTrigger } from "./composerInputTriggers";
import { listComposerSlashCommands } from "./composerSlashCommands";

export type PaletteMode = "slash-root" | "slash-model" | "slash-permissions" | "mention" | null;

const SEARCHING_MESSAGE = "Searching workspace files…";
const NO_RESULTS_MESSAGE = "No matching files";
const NO_COMMANDS_MESSAGE = "No matching commands";

export function createPaletteItems(
  mode: PaletteMode,
  activeTrigger: ComposerActiveTrigger | null,
  models: ReadonlyArray<ComposerModelOption>,
  selectedModel: string | null,
  permissionLevel: ComposerPermissionLevel,
  mentionSession: MentionPaletteSession | null,
  paletteError: string | null,
): ReadonlyArray<ComposerCommandPaletteItem> {
  if (mode === "slash-root") {
    return createSlashItems(activeTrigger?.query ?? "");
  }
  if (mode === "slash-model") {
    return models.map((model) => ({
      key: model.value,
      label: model.label,
      description: `Default effort: ${model.defaultEffort}`,
      disabled: false,
      meta: model.value === selectedModel ? "Current" : null,
    }));
  }
  if (mode === "slash-permissions") {
    return createPermissionItems(permissionLevel);
  }
  if (mode === "mention") {
    return createMentionItems(mentionSession, paletteError);
  }
  return [];
}

export function getPaletteTitle(mode: PaletteMode): string {
  if (mode === "slash-model") {
    return "Choose model";
  }
  if (mode === "slash-permissions") {
    return "Choose permissions";
  }
  if (mode === "mention") {
    return "Mention file";
  }
  return "Run command";
}

export function createTriggerKey(trigger: ComposerActiveTrigger | null): string | null {
  return trigger === null ? null : `${trigger.kind}:${trigger.range.start}:${trigger.range.end}:${trigger.query}`;
}

export interface MentionPaletteSession {
  readonly files: ReadonlyArray<{ readonly path: string; readonly file_name: string }>;
  readonly completed: boolean;
}

function createSlashItems(query: string): ReadonlyArray<ComposerCommandPaletteItem> {
  const commands = listComposerSlashCommands(query);
  if (commands.length === 0) {
    return [createNoticeItem(NO_COMMANDS_MESSAGE)];
  }
  return commands.map((command) => ({
    key: command.id,
    label: command.name,
    description: command.disabledReason ?? command.description,
    disabled: command.disabledReason !== null,
    meta: command.disabledReason === null ? null : "Unavailable",
  }));
}

function createPermissionItems(
  permissionLevel: ComposerPermissionLevel,
): ReadonlyArray<ComposerCommandPaletteItem> {
  return [
    {
      key: "default",
      label: "Default permissions",
      description: "Use the default approval flow.",
      disabled: false,
      meta: permissionLevel === "default" ? "Current" : null,
    },
    {
      key: "full",
      label: "Full permissions",
      description: "Allow broader local actions.",
      disabled: false,
      meta: permissionLevel === "full" ? "Current" : null,
    },
  ];
}

function createMentionItems(
  mentionSession: MentionPaletteSession | null,
  paletteError: string | null,
): ReadonlyArray<ComposerCommandPaletteItem> {
  if (paletteError !== null) {
    return [createNoticeItem(paletteError)];
  }
  if (mentionSession === null) {
    return [createNoticeItem(SEARCHING_MESSAGE)];
  }
  if (mentionSession.files.length === 0) {
    return [createNoticeItem(mentionSession.completed ? NO_RESULTS_MESSAGE : SEARCHING_MESSAGE)];
  }
  return mentionSession.files.map((file) => ({
    key: file.path,
    label: file.file_name,
    description: file.path,
    disabled: false,
    meta: file.path,
  }));
}

function createNoticeItem(message: string): ComposerCommandPaletteItem {
  return { key: message, label: message, description: message, disabled: true, meta: null };
}
