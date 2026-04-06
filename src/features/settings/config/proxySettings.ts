import type {
  AgentEnvironment,
  ProxySettings,
  UpdateProxySettingsInput,
} from "../../../bridge/types";

export const EMPTY_PROXY_SETTINGS: ProxySettings = {
  enabled: false,
  httpProxy: "",
  httpsProxy: "",
  noProxy: "",
};

export function normalizeProxySettings(settings: ProxySettings): ProxySettings {
  return {
    enabled: settings.enabled,
    httpProxy: "",
    httpsProxy: "",
    noProxy: "",
  };
}

export function hasProxySettingsChanges(
  saved: ProxySettings,
  draft: ProxySettings,
): boolean {
  const normalizedSaved = normalizeProxySettings(saved);
  const normalizedDraft = normalizeProxySettings(draft);
  return normalizedSaved.enabled !== normalizedDraft.enabled;
}

export function buildProxySettingsInput(
  agentEnvironment: AgentEnvironment,
  settings: ProxySettings,
): UpdateProxySettingsInput {
  return {
    agentEnvironment,
    ...normalizeProxySettings(settings),
  };
}
