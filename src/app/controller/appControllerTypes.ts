import type { HostBridge } from "../../bridge/types";
import { APP_VERSION } from "../appVersion";
import type {
  ServerRequestResolution,
  ThreadSummary
} from "../../domain/types";
import type { InitializeParams } from "../../protocol/generated/InitializeParams";
import type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
import type { ConfigWriteResponse } from "../../protocol/generated/v2/ConfigWriteResponse";
import type { MarketplaceAddParams } from "../../protocol/generated/v2/MarketplaceAddParams";
import type { MarketplaceAddResponse } from "../../protocol/generated/v2/MarketplaceAddResponse";
import type { MarketplaceRemoveParams } from "../../protocol/generated/v2/MarketplaceRemoveParams";
import type { MarketplaceRemoveResponse } from "../../protocol/generated/v2/MarketplaceRemoveResponse";
import type { MarketplaceUpgradeParams } from "../../protocol/generated/v2/MarketplaceUpgradeParams";
import type { MarketplaceUpgradeResponse } from "../../protocol/generated/v2/MarketplaceUpgradeResponse";
import type { PluginInstallParams } from "../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../protocol/generated/v2/PluginListResponse";
import type { PluginReadParams } from "../../protocol/generated/v2/PluginReadParams";
import type { PluginReadResponse } from "../../protocol/generated/v2/PluginReadResponse";
import type { PluginUninstallParams } from "../../protocol/generated/v2/PluginUninstallParams";
import type { PluginUninstallResponse } from "../../protocol/generated/v2/PluginUninstallResponse";
import type { SkillsConfigWriteParams } from "../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../protocol/generated/v2/SkillsListResponse";
import type { ThreadMemoryMode } from "../../protocol/generated/ThreadMemoryMode";
import type { McpServerStatus } from "../../protocol/generated/v2/McpServerStatus";
import type {
  AgentsSettingsOutput,
  CreateAgentInput,
  DeleteAgentInput,
  ReadAgentConfigOutput,
  UpdateAgentInput,
  WriteAgentConfigOutput,
} from "../../bridge/types";
import { type ConfigMutationResult, type ConfigSnapshotMutationResult, type McpRefreshResult } from "../../features/settings/config/configOperations";
import { ProtocolClient } from "../../protocol/client";

export type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
export type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
export type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
export type { ConfigWriteResponse } from "../../protocol/generated/v2/ConfigWriteResponse";
export type { MarketplaceAddParams } from "../../protocol/generated/v2/MarketplaceAddParams";
export type { MarketplaceAddResponse } from "../../protocol/generated/v2/MarketplaceAddResponse";
export type { MarketplaceRemoveParams } from "../../protocol/generated/v2/MarketplaceRemoveParams";
export type { MarketplaceRemoveResponse } from "../../protocol/generated/v2/MarketplaceRemoveResponse";
export type { MarketplaceUpgradeParams } from "../../protocol/generated/v2/MarketplaceUpgradeParams";
export type { MarketplaceUpgradeResponse } from "../../protocol/generated/v2/MarketplaceUpgradeResponse";
export type { PluginInstallParams } from "../../protocol/generated/v2/PluginInstallParams";
export type { PluginInstallResponse } from "../../protocol/generated/v2/PluginInstallResponse";
export type { PluginListParams } from "../../protocol/generated/v2/PluginListParams";
export type { PluginListResponse } from "../../protocol/generated/v2/PluginListResponse";
export type { PluginReadParams } from "../../protocol/generated/v2/PluginReadParams";
export type { PluginReadResponse } from "../../protocol/generated/v2/PluginReadResponse";
export type { PluginUninstallParams } from "../../protocol/generated/v2/PluginUninstallParams";
export type { PluginUninstallResponse } from "../../protocol/generated/v2/PluginUninstallResponse";
export type { SkillsConfigWriteParams } from "../../protocol/generated/v2/SkillsConfigWriteParams";
export type { SkillsConfigWriteResponse } from "../../protocol/generated/v2/SkillsConfigWriteResponse";
export type { SkillsListParams } from "../../protocol/generated/v2/SkillsListParams";
export type { SkillsListResponse } from "../../protocol/generated/v2/SkillsListResponse";
export type { McpServerStatus } from "../../protocol/generated/v2/McpServerStatus";

export const RETRY_DELAY_MS = 3_000;
export const WINDOWS_SANDBOX_STATE_IDLE_RESET_MS = 120_000;

export type AccountRequestClient = Pick<ProtocolClient, "request">;
export type AppHostBridge = Pick<HostBridge, "app">;

export interface AppController {
  setInput: (text: string) => void;
  retryConnection: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  refreshAuthState: () => Promise<void>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listMcpServerStatuses: () => Promise<ReadonlyArray<McpServerStatus>>;
  listArchivedThreads: () => Promise<ReadonlyArray<ThreadSummary>>;
  archiveThread: (threadId: string) => Promise<void>;
  unarchiveThread: (threadId: string) => Promise<void>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>;
  setThreadMemoryMode: (threadId: string, mode: ThreadMemoryMode) => Promise<void>;
  resetMemories: () => Promise<void>;
  listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  addMarketplace: (params: MarketplaceAddParams) => Promise<MarketplaceAddResponse>;
  removeMarketplace: (params: MarketplaceRemoveParams) => Promise<MarketplaceRemoveResponse>;
  upgradeMarketplaces: (params: MarketplaceUpgradeParams) => Promise<MarketplaceUpgradeResponse>;
  readMarketplacePlugin: (params: PluginReadParams) => Promise<PluginReadResponse>;
  writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
  uninstallMarketplacePlugin: (params: PluginUninstallParams) => Promise<PluginUninstallResponse>;
  setMarketplacePluginEnabled: (pluginId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
  setMultiAgentEnabled: (enabled: boolean) => Promise<void>;
  getAgentsSettings: () => Promise<AgentsSettingsOutput>;
  createAgent: (input: CreateAgentInput) => Promise<AgentsSettingsOutput>;
  updateAgent: (input: UpdateAgentInput) => Promise<AgentsSettingsOutput>;
  deleteAgent: (input: DeleteAgentInput) => Promise<AgentsSettingsOutput>;
  readAgentConfig: (name: string) => Promise<ReadAgentConfigOutput>;
  writeAgentConfig: (name: string, content: string) => Promise<WriteAgentConfigOutput>;
  checkForAppUpdate: () => Promise<void>;
  installAppUpdate: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  resolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

export function createInitializeParams(): InitializeParams {
  return {
    clientInfo: { name: "codex_app_plus", title: "Codex App Plus", version: APP_VERSION },
    capabilities: { experimentalApi: true, optOutNotificationMethods: null },
  };
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
