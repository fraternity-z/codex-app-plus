import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";

const MULTI_AGENT_FEATURE_NAME = "multi_agent";

export interface MultiAgentFeatureState {
  readonly available: boolean;
  readonly enabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMultiAgentEnabledFromConfig(configSnapshot: ConfigReadResponse | null): boolean {
  const features = configSnapshot?.config.features;
  if (!isRecord(features)) {
    return false;
  }

  return features[MULTI_AGENT_FEATURE_NAME] === true;
}

export function selectMultiAgentFeatureState(
  features: ReadonlyArray<ExperimentalFeature>,
  configSnapshot: ConfigReadResponse | null
): MultiAgentFeatureState {
  const feature = features.find((item) => item.name === MULTI_AGENT_FEATURE_NAME) ?? null;
  if (feature === null) {
    return { available: false, enabled: readMultiAgentEnabledFromConfig(configSnapshot) };
  }

  return { available: true, enabled: feature.enabled };
}
