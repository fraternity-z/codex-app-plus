import type { FuzzyFileSearchResult } from "../../../protocol/generated/FuzzyFileSearchResult";
import type { SkillMetadata } from "../../../protocol/generated/v2/SkillMetadata";
import type { ComposerPermissionLevel } from "./composerPermission";
import type { ComposerModelOption } from "./composerPreferences";
import type { CustomPromptOutput } from "../../../bridge/types";
import type { ComposerCommandPaletteItem } from "../ui/ComposerCommandPalette";
import type { ComposerActiveTrigger } from "./composerInputTriggers";
import { resolveMentionAttachmentPath } from "./composerAttachments";
import { createCustomPromptPaletteItems } from "./customPromptPalette";
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
  | "slash-personality"
  | "mention"
  | "skill"
  | null;

const SEARCHING_MESSAGE = "Searching workspace files…";
const NO_RESULTS_MESSAGE = "No matching files";
const NO_COMMANDS_MESSAGE = "No matching commands";
const NO_SKILLS_MESSAGE = "No matching skills";
const NO_COLLABORATION_MESSAGE = "No collaboration presets available";
const NO_THREADS_MESSAGE = "No resumable threads";

export interface SlashPaletteCollections {
  readonly slashContext: ComposerSlashCommandContext;
  readonly customPrompts: ReadonlyArray<CustomPromptOutput>;
  readonly collaborationItems: ReadonlyArray<ComposerCommandPaletteItem>;
  readonly resumeItems: ReadonlyArray<ComposerCommandPaletteItem>;
  readonly skills: ReadonlyArray<SkillMetadata>;
  readonly skillsLoading: boolean;
  readonly skillsError: string | null;
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
    return createSlashItems(activeTrigger?.query ?? "", collections);
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
  if (mode === "slash-personality") {
    return createPersonalityItems();
  }
  if (mode === "mention") {
    return createMentionItems(mentionSession, paletteError);
  }
  if (mode === "skill") {
    return createSkillItems(activeTrigger, collections.skills, collections.skillsLoading, collections.skillsError);
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
  if (mode === "slash-personality") {
    return "Choose personality";
  }
  if (mode === "mention") {
    return "Mention file";
  }
  if (mode === "skill") {
    return "Invoke skill";
  }
  return "Run command";
}

export function createTriggerKey(trigger: ComposerActiveTrigger | null): string | null {
  return trigger === null ? null : `${trigger.kind}:${trigger.range.start}:${trigger.range.end}:${trigger.query}`;
}

export interface MentionPaletteSession {
  readonly files: ReadonlyArray<FuzzyFileSearchResult>;
  readonly completed: boolean;
}

function createSlashItems(
  query: string,
  collections: SlashPaletteCollections,
): ReadonlyArray<ComposerCommandPaletteItem> {
  const commands = listComposerSlashCommands(query, collections.slashContext);
  const builtinIds = listComposerSlashCommands("", collections.slashContext).map((command) => command.id);
  const promptItems = createCustomPromptPaletteItems(query, collections.customPrompts, builtinIds);
  if (commands.length === 0 && promptItems.length === 0) {
    return [createNoticeItem(NO_COMMANDS_MESSAGE)];
  }
  return [
    ...commands.map((command) => ({
      key: command.id,
      label: command.name,
      description: command.disabledReason ?? command.description,
      disabled: command.disabledReason !== null,
      meta: command.disabledReason === null ? command.metaLabel : "Unavailable",
    })),
    ...promptItems,
  ];
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
  return mentionSession.files.map(createMentionPaletteItem);
}

function createSkillItems(
  activeTrigger: ComposerActiveTrigger | null,
  skills: ReadonlyArray<SkillMetadata>,
  skillsLoading: boolean,
  skillsError: string | null,
): ReadonlyArray<ComposerCommandPaletteItem> {
  if (skillsError !== null) {
    return [createNoticeItem(skillsError)];
  }
  if (skillsLoading) {
    return [createNoticeItem("Loading skills…")];
  }
  if (activeTrigger?.kind !== "skill") {
    return [createNoticeItem(NO_SKILLS_MESSAGE)];
  }
  const query = activeTrigger.query.trim().toLowerCase();
  const filteredSkills = skills.filter((skill) => {
    if (!skill.enabled) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }
    return skill.name.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query);
  });
  if (filteredSkills.length === 0) {
    return [createNoticeItem(NO_SKILLS_MESSAGE)];
  }
  return filteredSkills
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => ({
      key: skill.path,
      label: `$${skill.name}`,
      description: skill.description,
      disabled: false,
      meta: skill.scope,
    }));
}

function createPersonalityItems(): ReadonlyArray<ComposerCommandPaletteItem> {
  return [
    { key: "none", label: "None", description: "无个性化风格，保持默认。", disabled: false, meta: null },
    { key: "friendly", label: "Friendly", description: "友好、温暖的交流风格。", disabled: false, meta: null },
    { key: "pragmatic", label: "Pragmatic", description: "简洁、务实的交流风格。", disabled: false, meta: null },
  ];
}

function createNoticeItem(message: string): ComposerCommandPaletteItem {
  return { key: message, label: message, description: message, disabled: true, meta: null };
}

function createMentionPaletteItem(file: FuzzyFileSearchResult): ComposerCommandPaletteItem {
  return {
    key: resolveMentionAttachmentPath(file.root, file.path),
    label: file.file_name,
    description: file.path,
    disabled: false,
    meta: null,
  };
}
