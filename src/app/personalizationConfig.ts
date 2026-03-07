import type { Personality } from "../protocol/generated/Personality";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";

export interface PersonalizationConfigView {
  readonly personality: Personality;
}

export interface PersonalityCopy {
  readonly label: string;
  readonly description: string;
}

const DEFAULT_PERSONALITY: Personality = "pragmatic";

const PERSONALITY_COPY: Record<Personality, PersonalityCopy> = {
  none: {
    label: "默认",
    description: "当前回答风格与 Codex 全局 `personality` 配置一致：默认、不额外施加风格。"
  },
  friendly: {
    label: "友好",
    description: "当前回答风格与 Codex 全局 `personality` 配置一致：友好、自然。"
  },
  pragmatic: {
    label: "务实",
    description: "当前回答风格与 Codex 全局 `personality` 配置一致：务实、直接。"
  }
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

export function readPersonalizationConfigView(snapshot: unknown): PersonalizationConfigView {
  if (!isTypedConfig(snapshot)) {
    return { personality: DEFAULT_PERSONALITY };
  }

  const config = snapshot.config as Record<string, unknown>;
  return { personality: toPersonality(config.personality) };
}

export function getPersonalityCopy(personality: Personality): PersonalityCopy {
  return PERSONALITY_COPY[personality];
}
