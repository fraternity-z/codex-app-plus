import type {
  AgentEnvironment,
  ProxyMode,
  ProxySettings,
  UpdateProxySettingsInput,
} from "../../../bridge/types";

export const EMPTY_PROXY_SETTINGS: ProxySettings = {
  mode: "disabled",
  httpProxy: "",
  httpsProxy: "",
  noProxy: "",
};

export function normalizeProxySettings(settings: ProxySettings): ProxySettings {
  if (settings.mode === "custom") {
    return {
      mode: "custom",
      httpProxy: settings.httpProxy.trim(),
      httpsProxy: settings.httpsProxy.trim(),
      noProxy: settings.noProxy.trim(),
    };
  }
  return {
    mode: settings.mode,
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
  if (normalizedSaved.mode !== normalizedDraft.mode) {
    return true;
  }
  if (normalizedDraft.mode !== "custom") {
    return false;
  }
  return (
    normalizedSaved.httpProxy !== normalizedDraft.httpProxy ||
    normalizedSaved.httpsProxy !== normalizedDraft.httpsProxy ||
    normalizedSaved.noProxy !== normalizedDraft.noProxy
  );
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

export type ProxySettingsValidation =
  | { readonly kind: "valid" }
  | { readonly kind: "empty" };

export function validateProxySettings(settings: ProxySettings): ProxySettingsValidation {
  if (settings.mode !== "custom") {
    return { kind: "valid" };
  }
  if (settings.httpProxy.trim() === "" && settings.httpsProxy.trim() === "") {
    return { kind: "empty" };
  }
  return { kind: "valid" };
}

export const PROXY_MODES: ReadonlyArray<ProxyMode> = ["disabled", "system", "custom"];
