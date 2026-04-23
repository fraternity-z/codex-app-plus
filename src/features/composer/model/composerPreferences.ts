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

export const DEFAULT_COMPOSER_MODEL_LABEL = "gpt-5.5";

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

function createPinnedComposerModel(value: string): ComposerModelOption {
  return {
    id: `builtin-${value}`,
    value,
    label: value,
    defaultEffort: "high",
    supportedEfforts: [...DEFAULT_REASONING_EFFORTS],
    isDefault: false
  };
}

const PINNED_COMPOSER_MODELS = Object.freeze<ReadonlyArray<ComposerModelOption>>([
  createPinnedComposerModel("gpt-5.5"),
  createPinnedComposerModel("gpt-5.4"),
  createPinnedComposerModel("gpt-5.4-mini"),
  createPinnedComposerModel("gpt-5.3-codex"),
  createPinnedComposerModel("gpt-5.2")
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

export function prioritizeComposerModels(models: ReadonlyArray<ComposerModelOption>): ReadonlyArray<ComposerModelOption> {
  const remaining = [...dedupeComposerModels(models)];
  const prioritized = PINNED_COMPOSER_MODELS.map((pinned) => {
    const index = remaining.findIndex((model) => model.value === pinned.value);
    return index === -1 ? pinned : remaining.splice(index, 1)[0];
  });

  return [...prioritized, ...remaining];
}

export function partitionComposerModels(models: ReadonlyArray<ComposerModelOption>): ComposerModelGroups {
  const prioritized = prioritizeComposerModels(models);
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
): Promise<ReadonlyArray<ComposerModelOption>> {
  const appModels = await listAppServerComposerModels(client);
  return prioritizeComposerModels(appModels);
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
