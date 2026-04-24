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
import type { PluginInstallParams } from "../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../protocol/generated/v2/PluginListResponse";
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
export type { PluginInstallParams } from "../../protocol/generated/v2/PluginInstallParams";
export type { PluginInstallResponse } from "../../protocol/generated/v2/PluginInstallResponse";
export type { PluginListParams } from "../../protocol/generated/v2/PluginListParams";
export type { PluginListResponse } from "../../protocol/generated/v2/PluginListResponse";
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
  writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
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
