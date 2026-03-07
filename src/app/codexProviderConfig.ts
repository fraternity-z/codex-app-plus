import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type {
  CodexProviderDraft,
  CodexProviderRecord,
} from "../bridge/types";

const DEFAULT_API_KEY = "";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.1-codex";
const DEFAULT_PROVIDER_KEY = "openai";
const DEFAULT_REASONING_EFFORT = "high";
const DEFAULT_WIRE_API = "responses";

type JsonObject = Record<string, unknown>;
type TomlObject = Record<string, unknown>;

export interface CodexProviderValidationErrors {
  name?: string;
  providerKey?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  authJsonText?: string;
  configTomlText?: string;
}

export interface CodexConfigFields {
  readonly providerKey: string;
  readonly baseUrl: string;
  readonly model: string;
}

export function createEmptyCodexProviderDraft(): CodexProviderDraft {
  return {
    id: null,
    name: "",
    providerKey: DEFAULT_PROVIDER_KEY,
    apiKey: DEFAULT_API_KEY,
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    authJsonText: createAuthJsonText(DEFAULT_API_KEY),
    configTomlText: createConfigTomlText({
      providerKey: DEFAULT_PROVIDER_KEY,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      providerName: DEFAULT_PROVIDER_KEY,
    }),
  };
}

export function createDraftFromRecord(record: CodexProviderRecord): CodexProviderDraft {
  return {
    id: record.id,
    name: record.name,
    providerKey: record.providerKey,
    apiKey: record.apiKey,
    baseUrl: record.baseUrl,
    model: record.model,
    authJsonText: record.authJsonText,
    configTomlText: record.configTomlText,
  };
}

export function createAuthJsonText(apiKey: string): string {
  return `${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`;
}

export function createConfigTomlText(input: {
  readonly providerKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly providerName: string;
}): string {
  const doc: TomlObject = {
    model_provider: input.providerKey,
    model: input.model,
    model_reasoning_effort: DEFAULT_REASONING_EFFORT,
    disable_response_storage: true,
    model_providers: {
      [input.providerKey]: {
        name: input.providerName.trim() || input.providerKey,
        base_url: input.baseUrl,
        wire_api: DEFAULT_WIRE_API,
        requires_openai_auth: true,
      },
    },
  };
  return `${stringifyToml(doc)}\n`;
}

export function parseAuthJsonText(authJsonText: string): JsonObject {
  const parsed = JSON.parse(authJsonText) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("auth.json 必须是 JSON 对象");
  }
  return parsed;
}

export function parseConfigTomlText(configTomlText: string): TomlObject {
  const parsed = parseToml(configTomlText) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("config.toml 必须是 TOML 表");
  }
  return parsed;
}

export function extractApiKeyFromAuthJson(authJsonText: string): string {
  const parsed = parseAuthJsonText(authJsonText);
  const apiKey = parsed.OPENAI_API_KEY;
  if (typeof apiKey !== "string") {
    throw new Error("auth.json 缺少 OPENAI_API_KEY");
  }
  return apiKey;
}

export function extractCodexConfigFields(configTomlText: string): CodexConfigFields {
  const parsed = parseConfigTomlText(configTomlText);
  const providerKey = readString(parsed, "model_provider", "config.toml 缺少 model_provider");
  const model = readString(parsed, "model", "config.toml 缺少 model");
  const providers = readObject(parsed, "model_providers", "config.toml 缺少 model_providers");
  const providerConfig = readNestedObject(providers, providerKey, "config.toml 缺少当前 provider 配置");
  const baseUrl = readString(providerConfig, "base_url", "config.toml 缺少 base_url");
  return { providerKey, baseUrl, model };
}

export function updateAuthJsonWithApiKey(authObject: JsonObject, apiKey: string): string {
  return `${JSON.stringify({ ...authObject, OPENAI_API_KEY: apiKey }, null, 2)}\n`;
}

export function updateConfigTomlWithBasics(
  configObject: TomlObject,
  input: {
    readonly providerKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly providerName: string;
  }
): string {
  const nextProviderKey = input.providerKey;
  const previousProviderKey = typeof configObject.model_provider === "string"
    ? configObject.model_provider
    : null;
  const providers = readOptionalObject(configObject.model_providers, "config.toml 的 model_providers 必须是表");
  const nextProviders = { ...providers };
  if (previousProviderKey !== null && previousProviderKey !== nextProviderKey) {
    delete nextProviders[previousProviderKey];
  }
  const previousProvider = readOptionalObject(nextProviders[nextProviderKey], "provider 配置必须是表");
  nextProviders[nextProviderKey] = {
    ...previousProvider,
    name: typeof previousProvider.name === "string"
      ? previousProvider.name
      : input.providerName.trim() || nextProviderKey,
    base_url: input.baseUrl,
    wire_api: typeof previousProvider.wire_api === "string" ? previousProvider.wire_api : DEFAULT_WIRE_API,
    requires_openai_auth: typeof previousProvider.requires_openai_auth === "boolean"
      ? previousProvider.requires_openai_auth
      : true,
  };
  const nextConfig = {
    ...configObject,
    model_provider: nextProviderKey,
    model: input.model,
    model_providers: nextProviders,
  };
  return `${stringifyToml(nextConfig)}\n`;
}

export function validateCodexProviderDraft(
  draft: CodexProviderDraft,
  providers: ReadonlyArray<CodexProviderRecord>
): CodexProviderValidationErrors {
  const errors: CodexProviderValidationErrors = {};
  if (draft.name.trim().length === 0) errors.name = "名称不能为空";
  if (draft.providerKey.trim().length === 0) errors.providerKey = "providerKey 不能为空";
  if (draft.apiKey.trim().length === 0) errors.apiKey = "API Key 不能为空";
  if (draft.baseUrl.trim().length === 0) errors.baseUrl = "Base URL 不能为空";
  if (draft.model.trim().length === 0) errors.model = "模型不能为空";
  const duplicated = providers.some((provider) => provider.providerKey === draft.providerKey.trim() && provider.id !== draft.id);
  if (duplicated) {
    errors.providerKey = "providerKey 已存在";
  }
  try {
    if (extractApiKeyFromAuthJson(draft.authJsonText) !== draft.apiKey.trim()) {
      errors.authJsonText = "auth.json 与 API Key 字段不一致";
    }
  } catch (error) {
    errors.authJsonText = toErrorMessage(error);
  }
  try {
    const fields = extractCodexConfigFields(draft.configTomlText);
    if (fields.providerKey !== draft.providerKey.trim()) {
      errors.configTomlText = "config.toml 与 providerKey 字段不一致";
    }
    if (fields.baseUrl !== draft.baseUrl.trim()) {
      errors.configTomlText = "config.toml 与 Base URL 字段不一致";
    }
    if (fields.model !== draft.model.trim()) {
      errors.configTomlText = "config.toml 与模型字段不一致";
    }
  } catch (error) {
    errors.configTomlText = toErrorMessage(error);
  }
  return errors;
}

export function readCurrentCodexProviderKey(configSnapshot: unknown): string | null {
  if (!isRecord(configSnapshot) || !isRecord(configSnapshot.config)) {
    return null;
  }
  return typeof configSnapshot.config.model_provider === "string"
    ? configSnapshot.config.model_provider
    : null;
}

function readOptionalObject(value: unknown, message: string): JsonObject {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

function readObject(source: JsonObject, key: string, message: string): JsonObject {
  return readOptionalObject(source[key], message);
}

function readNestedObject(source: JsonObject, key: string, message: string): JsonObject {
  return readOptionalObject(source[key], message);
}

function readString(source: JsonObject, key: string, message: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
