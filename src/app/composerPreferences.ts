import type { HostBridge } from "../bridge/types";
import type { ReasoningEffort } from "../protocol/generated/ReasoningEffort";
import type { Model } from "../protocol/generated/v2/Model";
import type { ModelListResponse } from "../protocol/generated/v2/ModelListResponse";

const MODEL_PAGE_SIZE = 100;
const PRIMARY_COMPOSER_MODEL_COUNT = 5;
const REASONING_EFFORT_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh"] as const satisfies ReadonlyArray<ReasoningEffort>;
const REASONING_EFFORT_SET = new Set<ReasoningEffort>(REASONING_EFFORT_VALUES);

export const DEFAULT_COMPOSER_MODEL_LABEL = "gpt-5.4";

export interface ComposerSelection {
  readonly model: string | null;
  readonly effort: ReasoningEffort | null;
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

const PINNED_COMPOSER_MODELS = Object.freeze<ReadonlyArray<ComposerModelOption>>([
  {
    id: "builtin-gpt-5.4",
    value: "gpt-5.4",
    label: "gpt-5.4",
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
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

export function prioritizeComposerModels(
  models: ReadonlyArray<ComposerModelOption>
): ReadonlyArray<ComposerModelOption> {
  const remaining = [...dedupeComposerModels(models)];
  const prioritized = PINNED_COMPOSER_MODELS.map((pinned) => {
    const index = remaining.findIndex((model) => model.value === pinned.value);
    return index === -1 ? pinned : remaining.splice(index, 1)[0];
  });

  return [...prioritized, ...remaining];
}

export function partitionComposerModels(
  models: ReadonlyArray<ComposerModelOption>
): ComposerModelGroups {
  const prioritized = prioritizeComposerModels(models);
  return {
    primaryModels: prioritized.slice(0, PRIMARY_COMPOSER_MODEL_COUNT),
    extraModels: prioritized.slice(PRIMARY_COMPOSER_MODEL_COUNT)
  };
}

export function readComposerSelectionFromConfig(configSnapshot: unknown): ComposerSelection {
  if (!isRecord(configSnapshot) || !isRecord(configSnapshot.config)) {
    return { model: null, effort: null };
  }

  return {
    model: typeof configSnapshot.config.model === "string" ? configSnapshot.config.model : null,
    effort: toReasoningEffort(configSnapshot.config.model_reasoning_effort)
  };
}

export function resolveComposerModel(
  models: ReadonlyArray<ComposerModelOption>,
  preferredModel: string | null
): ComposerModelOption | null {
  if (preferredModel !== null) {
    const preferred = models.find((model) => model.value === preferredModel);
    if (preferred !== undefined) {
      return preferred;
    }
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

export function getComposerModelLabel(models: ReadonlyArray<ComposerModelOption>, value: string | null): string {
  const matched = value === null ? null : models.find((model) => model.value === value) ?? null;
  return matched?.label ?? value ?? DEFAULT_COMPOSER_MODEL_LABEL;
}

export async function listComposerModels(hostBridge: HostBridge): Promise<ReadonlyArray<ComposerModelOption>> {
  const models: Array<ComposerModelOption> = [];
  let cursor: string | null = null;

  do {
    const response = (await hostBridge.rpc.request({
      method: "model/list",
      params: { cursor, includeHidden: true, limit: MODEL_PAGE_SIZE }
    })).result as ModelListResponse;

    models.push(...response.data.map(toComposerModelOption));
    cursor = response.nextCursor;
  } while (cursor !== null);

  return prioritizeComposerModels(models);
}
