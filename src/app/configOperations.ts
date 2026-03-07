import type { AppAction } from "../domain/types";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { ConfigBatchWriteParams } from "../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../protocol/generated/v2/ConfigValueWriteParams";
import type { ConfigWriteResponse } from "../protocol/generated/v2/ConfigWriteResponse";
import type { ListMcpServerStatusResponse } from "../protocol/generated/v2/ListMcpServerStatusResponse";
import type { McpServerRefreshResponse } from "../protocol/generated/v2/McpServerRefreshResponse";
import type { McpServerStatus } from "../protocol/generated/v2/McpServerStatus";
import { ProtocolClient } from "../protocol/client";

const MCP_STATUS_PAGE_SIZE = 100;

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

type Dispatch = (action: AppAction) => void;

export async function readConfigSnapshot(
  client: ProtocolClient,
  dispatch?: Dispatch
): Promise<ConfigReadResponse> {
  const config = (await client.request("config/read", { includeLayers: true })) as ConfigReadResponse;
  dispatch?.({ type: "config/loaded", config });
  return config;
}

export async function listAllMcpServerStatuses(client: ProtocolClient): Promise<ReadonlyArray<McpServerStatus>> {
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

export async function refreshMcpData(client: ProtocolClient, dispatch: Dispatch): Promise<McpRefreshResult> {
  const reload = (await client.request("config/mcpServer/reload", undefined)) as McpServerRefreshResponse;
  const [config, statuses] = await Promise.all([
    readConfigSnapshot(client, dispatch),
    listAllMcpServerStatuses(client)
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
