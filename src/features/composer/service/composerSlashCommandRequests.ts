import type { Dispatch } from "react";
import type { AppAction } from "../../../domain/types";
import type { AppInfo } from "../../../protocol/generated/v2/AppInfo";
import type { AppsListResponse } from "../../../protocol/generated/v2/AppsListResponse";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";
import type { ExperimentalFeatureListResponse } from "../../../protocol/generated/v2/ExperimentalFeatureListResponse";
import type { ListMcpServerStatusResponse } from "../../../protocol/generated/v2/ListMcpServerStatusResponse";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
import type { ComposerCommandBridge } from "./composerCommandBridge";

const LIST_PAGE_SIZE = 100;

export async function refreshSlashConfig(
  bridge: ComposerCommandBridge,
  dispatch: Dispatch<AppAction>,
): Promise<ConfigReadResponse> {
  const config = (await bridge.request("config/read", { includeLayers: true })) as ConfigReadResponse;
  dispatch({ type: "config/loaded", config });
  return config;
}

export async function listAllExperimentalFeatures(
  bridge: ComposerCommandBridge,
): Promise<ReadonlyArray<ExperimentalFeature>> {
  const features: Array<ExperimentalFeature> = [];
  let cursor: string | null = null;
  do {
    const response = (await bridge.request("experimentalFeature/list", { cursor, limit: LIST_PAGE_SIZE })) as ExperimentalFeatureListResponse;
    features.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor !== null);
  return features;
}

export async function listAllMcpServerStatuses(
  bridge: ComposerCommandBridge,
): Promise<ReadonlyArray<McpServerStatus>> {
  const statuses: Array<McpServerStatus> = [];
  let cursor: string | null = null;
  do {
    const response = (await bridge.request("mcpServerStatus/list", { cursor, limit: LIST_PAGE_SIZE })) as ListMcpServerStatusResponse;
    statuses.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor !== null);
  return statuses;
}

export async function listAllApps(
  bridge: ComposerCommandBridge,
  threadId: string | null,
): Promise<ReadonlyArray<AppInfo>> {
  const apps: Array<AppInfo> = [];
  let cursor: string | null = null;
  do {
    const response = (await bridge.request("app/list", { cursor, limit: LIST_PAGE_SIZE, threadId, forceRefetch: true })) as AppsListResponse;
    apps.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor !== null);
  return apps;
}

export async function listAllPlugins(
  bridge: ComposerCommandBridge,
  selectedRootPath: string | null,
): Promise<PluginListResponse> {
  return (await bridge.request("plugin/list", {
    cwds: selectedRootPath === null ? undefined : [selectedRootPath],
  })) as PluginListResponse;
}
