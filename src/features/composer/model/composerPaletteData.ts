import type { ComposerPermissionLevel } from "./composerPermission";
import type { ComposerModelOption } from "./composerPreferences";
import type { ComposerCommandPaletteItem } from "../ui/ComposerCommandPalette";
import type { ComposerActiveTrigger } from "./composerInputTriggers";
import {
  listComposerSlashCommands,
  type ComposerSlashCommandContext,
} from "./composerSlashCommands";

export type PaletteMode =
  | "slash-root"
  | "slash-model"
  | "slash-permissions"
  | "slash-collab"
  | "slash-resume"
  | "mention"
  | null;

const SEARCHING_MESSAGE = "Searching workspace files…";
const NO_RESULTS_MESSAGE = "No matching files";
const NO_COMMANDS_MESSAGE = "No matching commands";
const NO_COLLABORATION_MESSAGE = "No collaboration presets available";
const NO_THREADS_MESSAGE = "No resumable threads";

export interface SlashPaletteCollections {
  readonly slashContext: ComposerSlashCommandContext;
  readonly collaborationItems: ReadonlyArray<ComposerCommandPaletteItem>;
  readonly resumeItems: ReadonlyArray<ComposerCommandPaletteItem>;
}

export function createPaletteItems(
  mode: PaletteMode,
  activeTrigger: ComposerActiveTrigger | null,
  models: ReadonlyArray<ComposerModelOption>,
  selectedModel: string | null,
  permissionLevel: ComposerPermissionLevel,
  mentionSession: MentionPaletteSession | null,
  paletteError: string | null,
  collections: SlashPaletteCollections,
): ReadonlyArray<ComposerCommandPaletteItem> {
  if (mode === "slash-root") {
    return createSlashItems(activeTrigger?.query ?? "", collections.slashContext);
  }
  if (mode === "slash-model") {
    return createModelItems(models, selectedModel);
  }
  if (mode === "slash-permissions") {
    return createPermissionItems(permissionLevel);
  }
  if (mode === "slash-collab") {
    return createStaticItems(collections.collaborationItems, NO_COLLABORATION_MESSAGE);
  }
  if (mode === "slash-resume") {
    return createStaticItems(collections.resumeItems, NO_THREADS_MESSAGE);
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
  if (mode === "slash-collab") {
    return "Choose collaboration mode";
  }
  if (mode === "slash-resume") {
    return "Resume thread";
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

function createSlashItems(
  query: string,
  context: ComposerSlashCommandContext,
): ReadonlyArray<ComposerCommandPaletteItem> {
  const commands = listComposerSlashCommands(query, context);
  if (commands.length === 0) {
    return [createNoticeItem(NO_COMMANDS_MESSAGE)];
  }
  return commands.map((command) => ({
    key: command.id,
    label: command.name,
    description: command.disabledReason ?? command.description,
    disabled: command.disabledReason !== null,
    meta: command.disabledReason === null ? command.metaLabel : "Unavailable",
  }));
}

function createModelItems(
  models: ReadonlyArray<ComposerModelOption>,
  selectedModel: string | null,
): ReadonlyArray<ComposerCommandPaletteItem> {
  return models.map((model) => ({
    key: model.value,
    label: model.label,
    description: `Default effort: ${model.defaultEffort}`,
    disabled: false,
    meta: model.value === selectedModel ? "Current" : null,
  }));
}

function createStaticItems(
  items: ReadonlyArray<ComposerCommandPaletteItem>,
  emptyMessage: string,
): ReadonlyArray<ComposerCommandPaletteItem> {
  if (items.length === 0) {
    return [createNoticeItem(emptyMessage)];
  }
  return items;
}

function createPermissionItems(
  permissionLevel: ComposerPermissionLevel,
): ReadonlyArray<ComposerCommandPaletteItem> {
  return [
    {
      key: "default",
      label: "Default permissions",
      description: "Use on-request approvals.",
      disabled: false,
      meta: permissionLevel === "default" ? "Current" : null,
    },
    {
      key: "full",
      label: "Full permissions",
      description: "Use never approvals.",
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
