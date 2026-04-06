import type { AppServerClient } from "../../../protocol/appServerClient";
import type { ReasoningEffort } from "../../../protocol/generated/ReasoningEffort";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import type { Model } from "../../../protocol/generated/v2/Model";
import type { ModelListResponse } from "../../../protocol/generated/v2/ModelListResponse";

const MODEL_PAGE_SIZE = 100;
const PRIMARY_COMPOSER_MODEL_COUNT = 5;
const REASONING_EFFORT_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh"] as const satisfies ReadonlyArray<ReasoningEffort>;
const DEFAULT_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const satisfies ReadonlyArray<ReasoningEffort>;
const REASONING_EFFORT_SET = new Set<ReasoningEffort>(REASONING_EFFORT_VALUES);
const SERVICE_TIER_VALUES = ["fast", "flex"] as const satisfies ReadonlyArray<ServiceTier>;
const SERVICE_TIER_SET = new Set<ServiceTier>(SERVICE_TIER_VALUES);
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODELS_URL = `${OPENROUTER_BASE_URL}/models?output_modalities=text`;
const OPENROUTER_MODELS_CACHE_KEY = "codex-app-plus.openrouter-models-cache";
const OPENROUTER_FETCH_TIMEOUT_MS = 5000;

export const DEFAULT_COMPOSER_MODEL_LABEL = "gpt-5.4";

export interface ComposerSelection {
  readonly model: string | null;
  readonly effort: ReasoningEffort | null;
  readonly serviceTier: ServiceTier | null;
}

export interface ResolvedComposerSelection extends ComposerSelection {
  readonly modelOption: ComposerModelOption | null;
}

export interface ComposerModelOption {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly defaultEffort: ReasoningEffort;
  readonly supportedEfforts: ReadonlyArray<ReasoningEffort>;
  readonly isDefault: boolean;
}

interface ComposerModelGroups {
  readonly primaryModels: ReadonlyArray<ComposerModelOption>;
  readonly extraModels: ReadonlyArray<ComposerModelOption>;
}

interface OpenRouterModelRecord {
  readonly id: string;
  readonly name?: string;
  readonly supported_parameters?: ReadonlyArray<string>;
}

interface OpenRouterModelsResponse {
  readonly data?: ReadonlyArray<OpenRouterModelRecord>;
}

interface OpenRouterModelsCache {
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly updatedAt: number;
}

interface ComposerModelPrioritizationOptions {
  readonly pinBuiltins?: boolean;
}

const PINNED_COMPOSER_MODELS = Object.freeze<ReadonlyArray<ComposerModelOption>>([
  {
    id: "builtin-gpt-5.4",
    value: "gpt-5.4",
    label: "gpt-5.4",
    defaultEffort: "high",
    supportedEfforts: [...DEFAULT_REASONING_EFFORTS],
    isDefault: false
  }
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toReasoningEffort(value: unknown): ReasoningEffort | null {
  return typeof value === "string" && REASONING_EFFORT_SET.has(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : null;
}

function toServiceTier(value: unknown): ServiceTier | null {
  return typeof value === "string" && SERVICE_TIER_SET.has(value as ServiceTier)
    ? (value as ServiceTier)
    : null;
}

function collectSupportedEfforts(model: Model): ReadonlyArray<ReasoningEffort> {
  const supported = model.supportedReasoningEfforts.map((item) => item.reasoningEffort);
  return Array.from(new Set([model.defaultReasoningEffort, ...supported]));
}

function toComposerModelOption(model: Model): ComposerModelOption {
  return {
    id: model.id,
    value: model.model,
    label: model.displayName.trim().length > 0 ? model.displayName : model.model,
    defaultEffort: model.defaultReasoningEffort,
    supportedEfforts: collectSupportedEfforts(model),
    isDefault: model.isDefault
  };
}

function dedupeComposerModels(models: ReadonlyArray<ComposerModelOption>): ReadonlyArray<ComposerModelOption> {
  const seen = new Set<string>();
  const unique: Array<ComposerModelOption> = [];

  for (const model of models) {
    if (seen.has(model.value)) {
      continue;
    }
    seen.add(model.value);
    unique.push(model);
  }

  return unique;
}

function shouldPinBuiltinComposerModels(models: ReadonlyArray<ComposerModelOption>): boolean {
  const hasPinnedModel = models.some((model) => PINNED_COMPOSER_MODELS.some((pinned) => pinned.value === model.value));
  if (hasPinnedModel) {
    return true;
  }

  return !models.some((model) => model.id.startsWith("openrouter:"));
}

export function prioritizeComposerModels(
  models: ReadonlyArray<ComposerModelOption>,
  options: ComposerModelPrioritizationOptions = {}
): ReadonlyArray<ComposerModelOption> {
  const remaining = [...dedupeComposerModels(models)];
  const pinBuiltins = options.pinBuiltins ?? shouldPinBuiltinComposerModels(remaining);
  if (!pinBuiltins) {
    return remaining;
  }
  const prioritized = PINNED_COMPOSER_MODELS.map((pinned) => {
    const index = remaining.findIndex((model) => model.value === pinned.value);
    return index === -1 ? pinned : remaining.splice(index, 1)[0];
  });

  return [...prioritized, ...remaining];
}

export function partitionComposerModels(
  models: ReadonlyArray<ComposerModelOption>,
  options: ComposerModelPrioritizationOptions = {}
): ComposerModelGroups {
  const prioritized = prioritizeComposerModels(models, options);
  return {
    primaryModels: prioritized.slice(0, PRIMARY_COMPOSER_MODEL_COUNT),
    extraModels: prioritized.slice(PRIMARY_COMPOSER_MODEL_COUNT)
  };
}

export function readComposerSelectionFromConfig(configSnapshot: unknown): ComposerSelection {
  if (!isRecord(configSnapshot) || !isRecord(configSnapshot.config)) {
    return { model: null, effort: null, serviceTier: null };
  }

  return {
    model: typeof configSnapshot.config.model === "string" ? configSnapshot.config.model : null,
    effort: toReasoningEffort(configSnapshot.config.model_reasoning_effort),
    serviceTier: toServiceTier(configSnapshot.config.service_tier)
  };
}

export function findComposerModel(
  models: ReadonlyArray<ComposerModelOption>,
  value: string | null
): ComposerModelOption | null {
  if (value === null) {
    return null;
  }

  return models.find((model) => model.value === value) ?? null;
}

export function resolveComposerModel(
  models: ReadonlyArray<ComposerModelOption>,
  preferredModel: string | null
): ComposerModelOption | null {
  const preferred = findComposerModel(models, preferredModel);
  if (preferred !== null) {
    return preferred;
  }

  return models.find((model) => model.isDefault) ?? models[0] ?? null;
}

export function resolveComposerEffort(
  model: ComposerModelOption | null,
  preferredEffort: ReasoningEffort | null
): ReasoningEffort | null {
  if (model === null) {
    return preferredEffort;
  }
  if (preferredEffort !== null && model.supportedEfforts.includes(preferredEffort)) {
    return preferredEffort;
  }
  return model.defaultEffort;
}

export function resolveConfiguredComposerSelection(
  models: ReadonlyArray<ComposerModelOption>,
  preferredModel: string | null,
  preferredEffort: ReasoningEffort | null,
  preferredServiceTier: ServiceTier | null
): ResolvedComposerSelection {
  if (preferredModel !== null) {
    const matchedModel = findComposerModel(models, preferredModel);
    return {
      model: preferredModel,
      effort: matchedModel === null ? preferredEffort : resolveComposerEffort(matchedModel, preferredEffort),
      serviceTier: preferredServiceTier,
      modelOption: matchedModel
    };
  }

  const fallbackModel = resolveComposerModel(models, null);
  return {
    model: fallbackModel?.value ?? null,
    effort: resolveComposerEffort(fallbackModel, preferredEffort),
    serviceTier: preferredServiceTier,
    modelOption: fallbackModel
  };
}

export function getComposerModelLabel(models: ReadonlyArray<ComposerModelOption>, value: string | null): string {
  const matched = value === null ? null : models.find((model) => model.value === value) ?? null;
  return matched?.label ?? value ?? DEFAULT_COMPOSER_MODEL_LABEL;
}

export async function listComposerModels(
  client: AppServerClient,
  configSnapshot?: unknown,
): Promise<ReadonlyArray<ComposerModelOption>> {
  const appModels = await listAppServerComposerModels(client);
  if (!isOpenRouterProviderActive(configSnapshot)) {
    return prioritizeComposerModels(appModels);
  }

  const openRouterModels = await loadOpenRouterComposerModels();
  const configuredModel = readComposerSelectionFromConfig(configSnapshot).model?.trim() ?? "";
  const configuredFallbackModel = resolveConfiguredOpenRouterModel(configuredModel, appModels, openRouterModels);
  return prioritizeComposerModels(
    configuredFallbackModel === null
      ? openRouterModels
      : [configuredFallbackModel, ...openRouterModels],
    { pinBuiltins: false }
  );
}

async function listAppServerComposerModels(client: AppServerClient): Promise<ReadonlyArray<ComposerModelOption>> {
  const models: Array<ComposerModelOption> = [];
  let cursor: string | null = null;

  do {
    const response = await client.request("model/list", {
      cursor,
      includeHidden: true,
      limit: MODEL_PAGE_SIZE,
    }) as ModelListResponse;

    models.push(...response.data.map(toComposerModelOption));
    cursor = response.nextCursor;
  } while (cursor !== null);

  return dedupeComposerModels(models);
}

function isOpenRouterProviderActive(configSnapshot: unknown): boolean {
  if (!isRecord(configSnapshot) || !isRecord(configSnapshot.config)) {
    return false;
  }

  const providerKey = typeof configSnapshot.config.model_provider === "string"
    ? configSnapshot.config.model_provider.trim()
    : "";
  if (providerKey.toLowerCase() === "openrouter") {
    return true;
  }

  const providers = readOptionalRecord(configSnapshot.config.model_providers);
  const providerConfig = providerKey.length > 0 ? readOptionalRecord(providers[providerKey]) : null;
  const baseUrl = providerConfig && typeof providerConfig.base_url === "string"
    ? providerConfig.base_url.trim().toLowerCase()
    : "";

  return baseUrl.startsWith(`${OPENROUTER_BASE_URL}/`) || baseUrl === OPENROUTER_BASE_URL;
}

function readOptionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function inferOpenRouterSupportedEfforts(model: OpenRouterModelRecord): ReadonlyArray<ReasoningEffort> {
  const supportedParameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
  const supportsReasoning = supportedParameters.includes("reasoning") || supportedParameters.includes("include_reasoning");
  return supportsReasoning ? [...REASONING_EFFORT_VALUES] : ["high"];
}

function toOpenRouterComposerModelOption(model: OpenRouterModelRecord): ComposerModelOption | null {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  if (id.length === 0) {
    return null;
  }

  const supportedEfforts = inferOpenRouterSupportedEfforts(model);
  return {
    id: `openrouter:${id}`,
    value: id,
    label: typeof model.name === "string" && model.name.trim().length > 0 ? model.name.trim() : id,
    defaultEffort: supportedEfforts.includes("high") ? "high" : supportedEfforts[0] ?? "high",
    supportedEfforts,
    isDefault: false,
  };
}

function resolveConfiguredOpenRouterModel(
  configuredModel: string,
  appModels: ReadonlyArray<ComposerModelOption>,
  openRouterModels: ReadonlyArray<ComposerModelOption>
): ComposerModelOption | null {
  if (configuredModel.length === 0) {
    return null;
  }

  const listedModel = openRouterModels.find((model) => model.value === configuredModel) ?? null;
  if (listedModel !== null) {
    return listedModel;
  }

  const appModel = appModels.find((model) => model.value === configuredModel) ?? null;
  if (appModel !== null) {
    return appModel;
  }

  return {
    id: `openrouter:configured:${configuredModel}`,
    value: configuredModel,
    label: configuredModel,
    defaultEffort: "high",
    supportedEfforts: ["high"],
    isDefault: false,
  };
}

async function loadOpenRouterComposerModels(): Promise<ReadonlyArray<ComposerModelOption>> {
  try {
    const models = await fetchOpenRouterComposerModels();
    writeOpenRouterModelsCache(models);
    return models;
  } catch {
    return readOpenRouterModelsCache();
  }
}

async function fetchOpenRouterComposerModels(): Promise<ReadonlyArray<ComposerModelOption>> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeoutId = controller === null
    ? null
    : window.setTimeout(() => controller.abort(), OPENROUTER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenRouter model list failed with ${response.status}`);
    }

    const payload = await response.json() as OpenRouterModelsResponse;
    const data = Array.isArray(payload.data) ? payload.data : [];
    return data
      .map(toOpenRouterComposerModelOption)
      .filter((model): model is ComposerModelOption => model !== null);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function readOpenRouterModelsCache(): ReadonlyArray<ComposerModelOption> {
  try {
    const raw = window.localStorage.getItem(OPENROUTER_MODELS_CACHE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.models)) {
      return [];
    }

    return parsed.models.filter(isComposerModelOption);
  } catch {
    return [];
  }
}

function writeOpenRouterModelsCache(models: ReadonlyArray<ComposerModelOption>): void {
  const cache: OpenRouterModelsCache = {
    models,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(OPENROUTER_MODELS_CACHE_KEY, JSON.stringify(cache));
}

function isComposerModelOption(value: unknown): value is ComposerModelOption {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.value === "string"
    && typeof value.label === "string"
    && toReasoningEffort(value.defaultEffort) !== null
    && Array.isArray(value.supportedEfforts)
    && value.supportedEfforts.every((item) => toReasoningEffort(item) !== null)
    && typeof value.isDefault === "boolean";
}
