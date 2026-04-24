import type { Personality } from "../../../protocol/generated/Personality";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";

export interface PersonalizationConfigView {
  readonly personality: Personality;
  readonly modelInstructionsFile: string | null;
  readonly memories: MemorySettingsConfigView;
}

export interface MemorySettingsConfigView {
  readonly featureEnabled: boolean;
  readonly useMemories: boolean;
  readonly generateMemories: boolean;
  readonly disableOnExternalContext: boolean;
}

const DEFAULT_PERSONALITY: Personality = "pragmatic";
const DEFAULT_MEMORY_SETTINGS: MemorySettingsConfigView = {
  featureEnabled: false,
  useMemories: true,
  generateMemories: true,
  disableOnExternalContext: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedConfig(value: unknown): value is ConfigReadResponse {
  return isRecord(value) && isRecord(value.config);
}

function toPersonality(value: unknown): Personality {
  if (value === "none" || value === "friendly" || value === "pragmatic") {
    return value;
  }
  return DEFAULT_PERSONALITY;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readMemoriesConfig(config: Record<string, unknown>): MemorySettingsConfigView {
  const features = isRecord(config.features) ? config.features : null;
  const memories = isRecord(config.memories) ? config.memories : null;

  return {
    featureEnabled: toOptionalBoolean(features?.memories) ?? DEFAULT_MEMORY_SETTINGS.featureEnabled,
    useMemories: toOptionalBoolean(memories?.use_memories) ?? DEFAULT_MEMORY_SETTINGS.useMemories,
    generateMemories: toOptionalBoolean(memories?.generate_memories) ?? DEFAULT_MEMORY_SETTINGS.generateMemories,
    disableOnExternalContext:
      toOptionalBoolean(memories?.disable_on_external_context)
      ?? toOptionalBoolean(memories?.no_memories_if_mcp_or_web_search)
      ?? DEFAULT_MEMORY_SETTINGS.disableOnExternalContext,
  };
}

export function readPersonalizationConfigView(snapshot: unknown): PersonalizationConfigView {
  if (!isTypedConfig(snapshot)) {
    return {
      personality: DEFAULT_PERSONALITY,
      modelInstructionsFile: null,
      memories: DEFAULT_MEMORY_SETTINGS,
    };
  }

  const config = snapshot.config as Record<string, unknown>;
  return {
    personality: toPersonality(config.personality),
    modelInstructionsFile: toOptionalString(config.model_instructions_file),
    memories: readMemoriesConfig(config),
  };
}
