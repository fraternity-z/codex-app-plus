import { useCallback, type MutableRefObject } from "react";
import type { HostBridge } from "../../bridge/types";
import type { ServerRequestResolution } from "../../domain/types";
import type { ThreadUnarchiveResponse } from "../../protocol/generated/v2/ThreadUnarchiveResponse";
import type { ThreadMemoryMode } from "../../protocol/generated/ThreadMemoryMode";
import {
  batchWriteConfigAndReadSnapshot,
  batchWriteConfigAndRefresh,
  listAllMcpServerStatuses,
  readConfigSnapshot,
  refreshMcpData as refreshMcpSnapshot,
  writeConfigValueAndRefresh,
} from "../../features/settings/config/configOperations";
import { readUserConfigWriteTarget } from "../../features/settings/config/configWriteTarget";
import { createConversationFromThread } from "../../features/conversation/model/conversationState";
import { ProtocolClient } from "../../protocol/client";
import type { CommandApprovalAllowlist } from "../../features/shared/utils/commandApprovalRules";
import { resolveRememberedCommandApproval } from "./commandApprovalController";
import { createServerRequestPayload } from "./serverRequests";
import { listArchivedThreads as listArchivedThreadsForEnvironment } from "./appControllerBootstrap";
import {
  ensureChatgptModeForLogin,
  isChatgptLoginDisabledError,
  loginWithStoredTokens,
  logoutWithLocalCleanup,
  openChatgptLogin,
  refreshAccountState,
} from "./appControllerAccount";
import { reportServerRequestError } from "./appControllerServerRequests";
import type {
  AppController,
  ConfigReadResponse,
  ConfigBatchWriteParams,
  ConfigValueWriteParams,
  ConfigWriteResponse,
  MarketplaceAddParams,
  MarketplaceAddResponse,
  MarketplaceRemoveParams,
  MarketplaceRemoveResponse,
  MarketplaceUpgradeParams,
  MarketplaceUpgradeResponse,
  PluginInstallParams,
  PluginInstallResponse,
  PluginListParams,
  PluginListResponse,
  PluginReadParams,
  PluginReadResponse,
  PluginUninstallParams,
  PluginUninstallResponse,
  SkillsConfigWriteParams,
  SkillsConfigWriteResponse,
  SkillsListParams,
  SkillsListResponse,
} from "./appControllerTypes";

type Dispatch = (action: import("../../domain/types").AppAction) => void;

interface UseAppControllerActionsArgs {
  readonly agentEnvironment: "windowsNative" | "wsl";
  readonly allowlistRef: MutableRefObject<CommandApprovalAllowlist>;
  readonly bootstrap: (forceRestart: boolean) => Promise<void>;
  readonly client: ProtocolClient;
  readonly dispatch: Dispatch;
  readonly hostBridge: HostBridge;
  readonly pendingRequestsRef: MutableRefObject<Record<string, import("../../domain/serverRequests").ReceivedServerRequest>>;
  readonly selectedConversationId: string | null;
  readonly configSnapshot: ConfigReadResponse | null;
}

type AppControllerActions = Omit<AppController, "retryConnection" | "setInput" | "checkForAppUpdate" | "installAppUpdate">;

export function useAppControllerActions({
  agentEnvironment,
  allowlistRef,
  bootstrap,
  client,
  dispatch,
  hostBridge,
  pendingRequestsRef,
  selectedConversationId,
  configSnapshot,
}: UseAppControllerActionsArgs): AppControllerActions {
  const runBusy = useCallback(async <T,>(runner: () => Promise<T>): Promise<T> => {
    dispatch({ type: "bootstrapBusy/changed", busy: true });
    try {
      return await runner();
    } finally {
      dispatch({ type: "bootstrapBusy/changed", busy: false });
    }
  }, [dispatch]);

  const login = useCallback(async () => {
    await runBusy(async () => {
      await ensureChatgptModeForLogin(client, hostBridge, agentEnvironment);
      const loggedInWithTokens = await loginWithStoredTokens(client, hostBridge);
      if (loggedInWithTokens) {
        dispatch({ type: "authLogin/completed", success: true, error: null });
        await refreshAccountState(client, dispatch);
        await hostBridge.app.captureCodexOauthSnapshot({
          agentEnvironment,
        });
        return;
      }
      let openedBrowser: boolean;
      try {
        openedBrowser = await openChatgptLogin(client, hostBridge, dispatch);
      } catch (error) {
        if (!isChatgptLoginDisabledError(error)) {
          throw error;
        }
        await ensureChatgptModeForLogin(client, hostBridge, agentEnvironment);
        openedBrowser = await openChatgptLogin(client, hostBridge, dispatch);
      }
      if (!openedBrowser) {
        await refreshAccountState(client, dispatch);
      }
    });
  }, [agentEnvironment, client, dispatch, hostBridge, runBusy]);

  const logout = useCallback(async () => {
    await runBusy(async () => {
      await logoutWithLocalCleanup(client, hostBridge, dispatch);
    });
  }, [client, dispatch, hostBridge, runBusy]);

  const refreshConfigSnapshot = useCallback(() => readConfigSnapshot(client, dispatch), [client, dispatch]);
  const refreshAuthState = useCallback(() => refreshAccountState(client, dispatch), [client, dispatch]);
  const refreshMcpData = useCallback(() => refreshMcpSnapshot(client, dispatch), [client, dispatch]);
  const listMcpServerStatuses = useCallback(async () => {
    const statuses = await listAllMcpServerStatuses(client);
    dispatch({ type: "mcp/statusesLoaded", statuses });
    return statuses;
  }, [client, dispatch]);
  const listArchivedThreads = useCallback(
    () => listArchivedThreadsForEnvironment(client, agentEnvironment),
    [agentEnvironment, client],
  );
  const archiveThread = useCallback(async (threadId: string) => {
    await client.request("thread/archive", { threadId });
    dispatch({ type: "conversation/hiddenChanged", conversationId: threadId, hidden: true });
    if (selectedConversationId === threadId) {
      dispatch({ type: "conversation/selected", conversationId: null });
    }
  }, [client, dispatch, selectedConversationId]);
  const unarchiveThread = useCallback(async (threadId: string) => {
    const response = (await client.request("thread/unarchive", { threadId })) as ThreadUnarchiveResponse;
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(response.thread, { agentEnvironment }) });
    dispatch({ type: "conversation/hiddenChanged", conversationId: threadId, hidden: false });
  }, [agentEnvironment, client, dispatch]);
  const writeConfigValue = useCallback((params: ConfigValueWriteParams) => runBusy(() => writeConfigValueAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfig = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfigSnapshot = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndReadSnapshot(client, dispatch, params)), [client, dispatch, runBusy]);
  const setThreadMemoryMode = useCallback((threadId: string, mode: ThreadMemoryMode) => (
    runBusy(async () => {
      await client.request("thread/memoryMode/set", { threadId, mode });
    })
  ), [client, runBusy]);
  const resetMemories = useCallback(() => (
    runBusy(async () => {
      await client.request("memory/reset", undefined);
    })
  ), [client, runBusy]);
  const listSkills = useCallback((params: SkillsListParams) => (
    client.request("skills/list", params) as Promise<SkillsListResponse>
  ), [client]);
  const listMarketplacePlugins = useCallback((params: PluginListParams) => (
    client.request("plugin/list", params) as Promise<PluginListResponse>
  ), [client]);
  const addMarketplace = useCallback((params: MarketplaceAddParams) => (
    client.request("marketplace/add", params) as Promise<MarketplaceAddResponse>
  ), [client]);
  const removeMarketplace = useCallback((params: MarketplaceRemoveParams) => (
    client.request("marketplace/remove", params) as Promise<MarketplaceRemoveResponse>
  ), [client]);
  const upgradeMarketplaces = useCallback((params: MarketplaceUpgradeParams) => (
    client.request("marketplace/upgrade", params) as Promise<MarketplaceUpgradeResponse>
  ), [client]);
  const readMarketplacePlugin = useCallback((params: PluginReadParams) => (
    client.request("plugin/read", params) as Promise<PluginReadResponse>
  ), [client]);
  const writeSkillConfig = useCallback((params: SkillsConfigWriteParams) => (
    client.request("skills/config/write", params) as Promise<SkillsConfigWriteResponse>
  ), [client]);
  const installMarketplacePlugin = useCallback((params: PluginInstallParams) => (
    client.request("plugin/install", params) as Promise<PluginInstallResponse>
  ), [client]);
  const uninstallMarketplacePlugin = useCallback((params: PluginUninstallParams) => (
    client.request("plugin/uninstall", params) as Promise<PluginUninstallResponse>
  ), [client]);
  const setMarketplacePluginEnabled = useCallback((pluginId: string, enabled: boolean) => (
    client.request("config/value/write", {
      keyPath: `plugins.${pluginId}`,
      value: { enabled },
      mergeStrategy: "upsert",
      filePath: null,
      expectedVersion: null,
    }) as Promise<ConfigWriteResponse>
  ), [client]);
  const setMultiAgentEnabled = useCallback(async (enabled: boolean) => {
    await runBusy(async () => {
      const writeTarget = readUserConfigWriteTarget(configSnapshot);
      await client.request("config/value/write", {
        keyPath: "features.multi_agent",
        value: enabled,
        mergeStrategy: "replace",
        filePath: writeTarget.filePath,
        expectedVersion: writeTarget.expectedVersion,
      });
      await bootstrap(true);
    });
  }, [bootstrap, client, configSnapshot, runBusy]);
  const getAgentsSettings = useCallback(() => (
    hostBridge.app.getAgentsSettings({ agentEnvironment })
  ), [agentEnvironment, hostBridge.app]);
  const createAgent = useCallback((input: Parameters<HostBridge["app"]["createAgent"]>[0]) => (
    hostBridge.app.createAgent({ ...input, agentEnvironment })
  ), [agentEnvironment, hostBridge.app]);
  const updateAgent = useCallback((input: Parameters<HostBridge["app"]["updateAgent"]>[0]) => (
    hostBridge.app.updateAgent({ ...input, agentEnvironment })
  ), [agentEnvironment, hostBridge.app]);
  const deleteAgent = useCallback((input: Parameters<HostBridge["app"]["deleteAgent"]>[0]) => (
    hostBridge.app.deleteAgent({ ...input, agentEnvironment })
  ), [agentEnvironment, hostBridge.app]);
  const readAgentConfig = useCallback((name: string) => (
    hostBridge.app.readAgentConfig({ agentEnvironment, name })
  ), [agentEnvironment, hostBridge.app]);
  const writeAgentConfig = useCallback((name: string, content: string) => (
    hostBridge.app.writeAgentConfig({ agentEnvironment, name, content })
  ), [agentEnvironment, hostBridge.app]);

  const resolveServerRequest = useCallback(async (resolution: ServerRequestResolution) => {
    const request = pendingRequestsRef.current[resolution.requestId];
    if (request === undefined) {
      return;
    }
    try {
      if (resolution.kind === "tokenRefresh") {
        await hostBridge.app.writeChatgptAuthTokens({
          accessToken: resolution.result.accessToken,
          chatgptAccountId: resolution.result.chatgptAccountId,
          chatgptPlanType: resolution.result.chatgptPlanType,
        });
      }
      if (resolution.kind === "commandApproval" && request.kind === "commandApproval") {
        const handled = await resolveRememberedCommandApproval({
          agentEnvironment,
          allowlistRef,
          client,
          dispatch,
          hostBridge,
          request,
          resolution,
        });
        if (handled) {
          return;
        }
      }
      await client.resolveServerRequest(request.rpcId, createServerRequestPayload(resolution));
    } catch (error) {
      reportServerRequestError(dispatch, request, "Failed to submit request response", error);
    }
  }, [agentEnvironment, allowlistRef, client, dispatch, hostBridge, pendingRequestsRef]);

  return {
    addMarketplace,
    archiveThread,
    batchWriteConfig,
    batchWriteConfigSnapshot,
    installMarketplacePlugin,
    listArchivedThreads,
    listMarketplacePlugins,
    listMcpServerStatuses,
    listSkills,
    login,
    logout,
    refreshAuthState,
    refreshConfigSnapshot,
    refreshMcpData,
    readMarketplacePlugin,
    removeMarketplace,
    resolveServerRequest,
    resetMemories,
    setMarketplacePluginEnabled,
    setMultiAgentEnabled,
    setThreadMemoryMode,
    getAgentsSettings,
    createAgent,
    updateAgent,
    deleteAgent,
    readAgentConfig,
    writeAgentConfig,
    unarchiveThread,
    uninstallMarketplacePlugin,
    upgradeMarketplaces,
    writeConfigValue,
    writeSkillConfig,
  };
}
