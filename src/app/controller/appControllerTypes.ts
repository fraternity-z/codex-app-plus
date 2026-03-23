import type { HostBridge } from "../../bridge/types";
import { APP_VERSION } from "../appVersion";
import type { ServerRequestResolution, ThreadSummary } from "../../domain/types";
import type { InitializeParams } from "../../protocol/generated/InitializeParams";
import type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
import type { SkillsConfigWriteParams } from "../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../protocol/generated/v2/SkillsListResponse";
import type { SkillsRemoteReadParams } from "../../protocol/generated/v2/SkillsRemoteReadParams";
import type { SkillsRemoteReadResponse } from "../../protocol/generated/v2/SkillsRemoteReadResponse";
import type { SkillsRemoteWriteParams } from "../../protocol/generated/v2/SkillsRemoteWriteParams";
import type { SkillsRemoteWriteResponse } from "../../protocol/generated/v2/SkillsRemoteWriteResponse";
import type { McpServerStatus } from "../../protocol/generated/v2/McpServerStatus";
import { type ConfigMutationResult, type ConfigSnapshotMutationResult, type McpRefreshResult } from "../../features/settings/config/configOperations";
import { ProtocolClient } from "../../protocol/client";

export type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
export type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
export type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
export type { SkillsConfigWriteParams } from "../../protocol/generated/v2/SkillsConfigWriteParams";
export type { SkillsConfigWriteResponse } from "../../protocol/generated/v2/SkillsConfigWriteResponse";
export type { SkillsListParams } from "../../protocol/generated/v2/SkillsListParams";
export type { SkillsListResponse } from "../../protocol/generated/v2/SkillsListResponse";
export type { SkillsRemoteReadParams } from "../../protocol/generated/v2/SkillsRemoteReadParams";
export type { SkillsRemoteReadResponse } from "../../protocol/generated/v2/SkillsRemoteReadResponse";
export type { SkillsRemoteWriteParams } from "../../protocol/generated/v2/SkillsRemoteWriteParams";
export type { SkillsRemoteWriteResponse } from "../../protocol/generated/v2/SkillsRemoteWriteResponse";
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
  listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  listRemoteSkills: (params: SkillsRemoteReadParams) => Promise<SkillsRemoteReadResponse>;
  writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  exportRemoteSkill: (params: SkillsRemoteWriteParams) => Promise<SkillsRemoteWriteResponse>;
  setMultiAgentEnabled: (enabled: boolean) => Promise<void>;
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
