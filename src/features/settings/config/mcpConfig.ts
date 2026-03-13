import type { ConfigLayerMetadata } from "../../../protocol/generated/v2/ConfigLayerMetadata";
import type { ConfigLayerSource } from "../../../protocol/generated/v2/ConfigLayerSource";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { McpAuthStatus } from "../../../protocol/generated/v2/McpAuthStatus";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import type { JsonValue } from "../../../protocol/generated/serde_json/JsonValue";
import { readUserConfigWriteTarget, type UserConfigWriteTarget } from "./configWriteTarget";
import { MCP_RECOMMENDED_PRESETS } from "./mcpPresets";

export type McpTransportType = "stdio" | "http" | "sse";
export type JsonObject = Record<string, JsonValue>;

export interface McpRuntimeSummary {
  readonly authStatus: McpAuthStatus;
  readonly toolCount: number;
  readonly resourceCount: number;
}

export interface McpConfigServerView {
  readonly id: string;
  readonly name: string;
  readonly type: McpTransportType;
  readonly enabled: boolean;
  readonly config: JsonObject;
  readonly origin: ConfigLayerMetadata | null;
  readonly originLabel: string;
  readonly writable: boolean;
  readonly runtime: McpRuntimeSummary | null;
}

export interface McpConfigView {
  readonly writeTarget: UserConfigWriteTarget;
  readonly userServers: ReadonlyArray<McpConfigServerView>;
  readonly readOnlyServers: ReadonlyArray<McpConfigServerView>;
  readonly userServerMap: JsonObject;
  readonly installedPresetIds: ReadonlySet<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as JsonObject;
}

function isTypedConfig(value: unknown): value is ConfigReadResponse {
  return isRecord(value) && isRecord(value.config);
}

function getMcpServersMap(snapshot: unknown): JsonObject {
  if (!isTypedConfig(snapshot)) {
    return {};
  }
  const config = snapshot.config as Record<string, unknown>;
  return toJsonObject(config.mcp_servers) ?? toJsonObject(config.mcpServers) ?? {};
}

function getTransportType(config: JsonObject): McpTransportType {
  if (config.type === "http" || config.type === "sse" || config.type === "stdio") {
    return config.type;
  }
  return typeof config.url === "string" ? "http" : "stdio";
}

function isEnabled(config: JsonObject): boolean {
  return config.enabled !== false;
}

function buildRuntimeMap(statuses: ReadonlyArray<McpServerStatus>): ReadonlyMap<string, McpRuntimeSummary> {
  return new Map(
    statuses.map((status) => [
      status.name,
      {
        authStatus: status.authStatus,
        toolCount: Object.keys(status.tools).length,
        resourceCount: status.resources.length + status.resourceTemplates.length
      }
    ])
  );
}

function getOriginMetadata(snapshot: ConfigReadResponse, id: string): ConfigLayerMetadata | null {
  const path = `mcp_servers.${id}`;
  const direct = snapshot.origins[path];
  if (direct !== undefined) {
    return direct;
  }
  return ["enabled", "command", "url", "type"].map((field) => snapshot.origins[`${path}.${field}`]).find(Boolean) ?? null;
}

function getOriginLabel(source: ConfigLayerSource | null): string {
  if (source === null) {
    return "未知来源";
  }
  if (source.type === "user") return "用户配置";
  if (source.type === "project") return "项目配置";
  if (source.type === "system") return "系统配置";
  if (source.type === "mdm") return "MDM";
  if (source.type === "sessionFlags") return "会话参数";
  if (source.type === "legacyManagedConfigTomlFromFile") return "托管文件";
  return "托管配置";
}

function toServerView(
  id: string,
  config: JsonObject,
  snapshot: ConfigReadResponse | null,
  runtimes: ReadonlyMap<string, McpRuntimeSummary>
): McpConfigServerView {
  const origin = snapshot === null ? null : getOriginMetadata(snapshot, id);
  return {
    id,
    name: typeof config.name === "string" && config.name.length > 0 ? config.name : id,
    type: getTransportType(config),
    enabled: isEnabled(config),
    config,
    origin,
    originLabel: getOriginLabel(origin?.name ?? null),
    writable: origin?.name.type === "user",
    runtime: runtimes.get(id) ?? null
  };
}

export function readMcpConfigView(
  snapshot: unknown,
  statuses: ReadonlyArray<McpServerStatus>
): McpConfigView {
  const typedSnapshot = isTypedConfig(snapshot) ? snapshot : null;
  const serversMap = getMcpServersMap(snapshot);
  const runtimes = buildRuntimeMap(statuses);
  const views = Object.entries(serversMap)
    .map(([id, value]) => {
      const config = toJsonObject(value);
      return config === null ? null : toServerView(id, config, typedSnapshot, runtimes);
    })
    .filter((item): item is McpConfigServerView => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  const userServers = views.filter((server) => server.writable);
  const readOnlyServers = views.filter((server) => !server.writable);
  const installedPresetIds = new Set(
    MCP_RECOMMENDED_PRESETS.map((preset) => preset.id).filter((id) => views.some((server) => server.id === id))
  );

  return {
    writeTarget: readUserConfigWriteTarget(typedSnapshot),
    userServers,
    readOnlyServers,
    userServerMap: Object.fromEntries(userServers.map((server) => [server.id, server.config])),
    installedPresetIds
  };
}

export function omitServer(configMap: JsonObject, serverId: string): JsonObject {
  return Object.fromEntries(Object.entries(configMap).filter(([id]) => id !== serverId));
}
