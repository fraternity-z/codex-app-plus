import type { AppAction } from "../../../domain/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { ConfigWriteResponse } from "../../../protocol/generated/v2/ConfigWriteResponse";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";
import type { ExperimentalFeatureListResponse } from "../../../protocol/generated/v2/ExperimentalFeatureListResponse";
import type { ListMcpServerStatusResponse } from "../../../protocol/generated/v2/ListMcpServerStatusResponse";
import type { McpServerRefreshResponse } from "../../../protocol/generated/v2/McpServerRefreshResponse";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import { ProtocolClient } from "../../../protocol/client";

const EXPERIMENTAL_FEATURE_PAGE_SIZE = 100;
const MCP_STATUS_PAGE_SIZE = 100;
export const MCP_STATUS_CACHE_TTL_MS = 30 * 1000;

interface McpStatusCacheEntry {
  readonly statuses?: ReadonlyArray<McpServerStatus>;
  readonly expiresAt: number;
  readonly inFlight?: Promise<ReadonlyArray<McpServerStatus>>;
}

const mcpStatusCache = new WeakMap<ProtocolClient, McpStatusCacheEntry>();

export interface McpRefreshResult {
  readonly config: ConfigReadResponse;
  readonly statuses: ReadonlyArray<McpServerStatus>;
  readonly reload: McpServerRefreshResponse;
}

export interface ConfigMutationResult {
  readonly config: ConfigReadResponse;
  readonly statuses: ReadonlyArray<McpServerStatus>;
  readonly write: ConfigWriteResponse;
}

export interface ConfigSnapshotMutationResult {
  readonly config: ConfigReadResponse;
  readonly write: ConfigWriteResponse;
}

type Dispatch = (action: AppAction) => void;

export async function readConfigSnapshot(
  client: ProtocolClient,
  dispatch?: Dispatch
): Promise<ConfigReadResponse> {
  const config = (await client.request("config/read", { includeLayers: true })) as ConfigReadResponse;
  dispatch?.({ type: "config/loaded", config });
  return config;
}

async function fetchAllMcpServerStatuses(client: ProtocolClient): Promise<ReadonlyArray<McpServerStatus>> {
  const statuses: Array<McpServerStatus> = [];
  let cursor: string | null = null;

  do {
    const response = (await client.request("mcpServerStatus/list", {
      cursor,
      limit: MCP_STATUS_PAGE_SIZE
    })) as ListMcpServerStatusResponse;
    statuses.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor !== null);

  return statuses;
}

export function invalidateMcpServerStatusCache(client: ProtocolClient): void {
  mcpStatusCache.delete(client);
}

export async function listAllMcpServerStatuses(
  client: ProtocolClient,
  options: { readonly force?: boolean } = {},
): Promise<ReadonlyArray<McpServerStatus>> {
  const now = Date.now();
  const cached = mcpStatusCache.get(client);
  if (options.force !== true) {
    if (cached?.statuses !== undefined && cached.expiresAt > now) {
      return cached.statuses;
    }
    if (cached?.inFlight !== undefined) {
      return cached.inFlight;
    }
  }

  const inFlight = fetchAllMcpServerStatuses(client);
  mcpStatusCache.set(client, { inFlight, expiresAt: now + MCP_STATUS_CACHE_TTL_MS });
  try {
    const statuses = await inFlight;
    mcpStatusCache.set(client, { statuses, expiresAt: Date.now() + MCP_STATUS_CACHE_TTL_MS });
    return statuses;
  } catch (error) {
    mcpStatusCache.delete(client);
    throw error;
  }
}

export async function listAllExperimentalFeatures(client: ProtocolClient): Promise<ReadonlyArray<ExperimentalFeature>> {
  const features: Array<ExperimentalFeature> = [];
  let cursor: string | null = null;

  do {
    const response = (await client.request("experimentalFeature/list", {
      cursor,
      limit: EXPERIMENTAL_FEATURE_PAGE_SIZE
    })) as ExperimentalFeatureListResponse;
    features.push(...response.data);
    cursor = response.nextCursor;
  } while (cursor !== null);

  return features;
}

export async function refreshMcpData(client: ProtocolClient, dispatch: Dispatch): Promise<McpRefreshResult> {
  invalidateMcpServerStatusCache(client);
  const reload = (await client.request("config/mcpServer/reload", undefined)) as McpServerRefreshResponse;
  const [config, statuses] = await Promise.all([
    readConfigSnapshot(client, dispatch),
    listAllMcpServerStatuses(client, { force: true })
  ]);
  dispatch({ type: "mcp/statusesLoaded", statuses });
  return { config, statuses, reload };
}

export async function writeConfigValueAndRefresh(
  client: ProtocolClient,
  dispatch: Dispatch,
  params: ConfigValueWriteParams
): Promise<ConfigMutationResult> {
  const write = (await client.request("config/value/write", params)) as ConfigWriteResponse;
  const refreshed = await refreshMcpData(client, dispatch);
  return { write, config: refreshed.config, statuses: refreshed.statuses };
}

export async function batchWriteConfigAndRefresh(
  client: ProtocolClient,
  dispatch: Dispatch,
  params: ConfigBatchWriteParams
): Promise<ConfigMutationResult> {
  const write = (await client.request("config/batchWrite", params)) as ConfigWriteResponse;
  const refreshed = await refreshMcpData(client, dispatch);
  return { write, config: refreshed.config, statuses: refreshed.statuses };
}

export async function batchWriteConfigAndReadSnapshot(
  client: ProtocolClient,
  dispatch: Dispatch,
  params: ConfigBatchWriteParams
): Promise<ConfigSnapshotMutationResult> {
  const write = (await client.request("config/batchWrite", params)) as ConfigWriteResponse;
  const config = await readConfigSnapshot(client, dispatch);
  return { write, config };
}
