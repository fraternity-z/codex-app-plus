import type { JsonValue } from "../../../protocol/generated/serde_json/JsonValue";
import type { ConfigLayer } from "../../../protocol/generated/v2/ConfigLayer";
import type { ConfigLayerSource } from "../../../protocol/generated/v2/ConfigLayerSource";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";

type JsonObject = Record<string, JsonValue>;
type WindowsSandboxConfigMode = WindowsSandboxSetupMode | "disabled";

interface LayerMatch {
  readonly mode: WindowsSandboxSetupMode;
  readonly source: string;
  readonly isLegacy: boolean;
}

export interface WindowsSandboxConfigView {
  readonly mode: WindowsSandboxConfigMode;
  readonly source: string | null;
  readonly isLegacy: boolean;
  readonly canRunSetup: boolean;
}

function sourceLabelFromMetadata(value: unknown): string | null {
  const metadata = toJsonObject(value);
  const source = metadata === null ? null : metadata.name;
  if (!isRecord(source) || typeof source.type !== "string") {
    return null;
  }
  if (source.type === "user") return "windows.sandbox · 用户配置";
  if (source.type === "project") return "windows.sandbox · 项目配置";
  if (source.type === "system") return "windows.sandbox · 系统配置";
  if (source.type === "mdm") return "windows.sandbox · MDM";
  if (source.type === "sessionFlags") return "windows.sandbox · 会话参数";
  if (source.type === "legacyManagedConfigTomlFromFile") return "windows.sandbox · 托管配置文件";
  if (source.type === "legacyManagedConfigTomlFromMdm") return "windows.sandbox · 托管配置";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject | null {
  return isRecord(value) ? (value as JsonObject) : null;
}

function isTypedConfig(value: unknown): value is ConfigReadResponse {
  return isRecord(value) && isRecord(value.config);
}

function toMode(value: unknown): WindowsSandboxSetupMode | null {
  return value === "elevated" || value === "unelevated" ? value : null;
}

function layerLabel(source: ConfigLayerSource): string {
  if (source.type === "user") return "用户配置";
  if (source.type === "project") return "项目配置";
  if (source.type === "system") return "系统配置";
  if (source.type === "mdm") return "MDM";
  if (source.type === "sessionFlags") return "会话参数";
  if (source.type === "legacyManagedConfigTomlFromFile") return "托管配置文件";
  return "托管配置";
}

function readProfileMode(config: JsonObject, activeProfile: string | null): WindowsSandboxSetupMode | null {
  if (activeProfile === null) {
    return null;
  }
  const profiles = toJsonObject(config.profiles);
  const profile = toJsonObject(profiles?.[activeProfile]);
  const windows = toJsonObject(profile?.windows);
  return toMode(windows?.sandbox);
}

function readTopLevelMode(config: JsonObject): WindowsSandboxSetupMode | null {
  const windows = toJsonObject(config.windows);
  return toMode(windows?.sandbox);
}

function readLegacyMode(config: JsonObject): WindowsSandboxSetupMode | null {
  const features = toJsonObject(config.features);
  if (features?.elevated_windows_sandbox === true) {
    return "elevated";
  }
  if (features?.experimental_windows_sandbox === true || features?.enable_experimental_windows_sandbox === true) {
    return "unelevated";
  }
  return null;
}

function matchLayer(layer: ConfigLayer, activeProfile: string | null): LayerMatch | null {
  if (layer.disabledReason !== null) {
    return null;
  }
  const config = toJsonObject(layer.config);
  if (config === null) {
    return null;
  }
  const source = layerLabel(layer.name);
  const profileMode = readProfileMode(config, activeProfile);
  if (profileMode !== null && activeProfile !== null) {
    return { mode: profileMode, source: `配置档 ${activeProfile} · ${source}`, isLegacy: false };
  }
  const topLevelMode = readTopLevelMode(config);
  if (topLevelMode !== null) {
    return { mode: topLevelMode, source: `windows.sandbox · ${source}`, isLegacy: false };
  }
  const legacyMode = readLegacyMode(config);
  return legacyMode === null ? null : { mode: legacyMode, source: `旧版特性开关 · ${source}`, isLegacy: true };
}

function canRunSetup(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }
  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /windows|win32|win64|jsdom/i.test(`${platform} ${userAgent}`);
}

export function readWindowsSandboxConfigView(snapshot: unknown): WindowsSandboxConfigView {
  if (!isTypedConfig(snapshot)) {
    return { mode: "disabled", source: null, isLegacy: false, canRunSetup: canRunSetup() };
  }
  const effectiveConfig = snapshot.config as Record<string, unknown>;
  const effectiveWindows = toJsonObject(effectiveConfig.windows);
  const effectiveMode = toMode(effectiveWindows?.sandbox);
  if (effectiveMode !== null) {
    return {
      mode: effectiveMode,
      source: sourceLabelFromMetadata(snapshot.origins?.["windows.sandbox"]) ?? "windows.sandbox · 当前生效配置",
      isLegacy: false,
      canRunSetup: canRunSetup(),
    };
  }
  const activeProfile = typeof snapshot.config.profile === "string" ? snapshot.config.profile : null;
  const match = (snapshot.layers ?? []).reduce<LayerMatch | null>(
    (current, layer) => matchLayer(layer, activeProfile) ?? current,
    null,
  );
  return match === null
    ? { mode: "disabled", source: null, isLegacy: false, canRunSetup: canRunSetup() }
    : { ...match, canRunSetup: canRunSetup() };
}
