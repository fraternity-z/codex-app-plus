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
} from "../../features/settings";
import { readUserConfigWriteTarget } from "../../features/settings";
import { createConversationFromThread } from "../../features/conversation";
import { ProtocolClient } from "../../protocol/client";
import type { CommandApprovalAllowlist } from "../../features/shared";
import { resolveRememberedCommandApproval } from "./commandApprovalController";
import { createServerRequestPayload } from "./serverRequests";
import { listArchivedThreads as listArchivedThreadsForEnvironment } from "./appControllerBootstrap";
import {
  ensureChatgptModeForLogin,
  isChatgptLoginDisabledError,
  logoutWithLocalCleanup,
  openChatgptLogin,
  refreshAccountState,
} from "./appControllerAccount";
import { reportServerRequestError } from "./appControllerServerRequests";
import {
  toErrorMessage,
  type AgentsConfigUpdateInput,
  type AppController,
  type ConfigBatchWriteParams,
  type ConfigReadResponse,
  type ConfigValueWriteParams,
} from "./appControllerTypes";
import { useAppControllerPluginActions } from "./appControllerPluginActions";

type Dispatch = (action: import("../../domain/types").AppAction) => void;
const CONFIG_VERSION_CONFLICT_MESSAGE = "Configuration was modified since last read";

interface UseAppControllerActionsArgs {
  readonly agentEnvironment: "windowsNative" | "wsl";
  readonly allowlistRef: MutableRefObject<CommandApprovalAllowlist>;
  readonly bootstrap: (forceRestart: boolean) => Promise<void>;
  readonly client: ProtocolClient;
  readonly dispatch: Dispatch;
  readonly ensureAppServerReady: () => Promise<boolean>;
  readonly hostBridge: HostBridge;
  readonly pendingRequestsRef: MutableRefObject<Record<string, import("../../domain/serverRequests").ReceivedServerRequest>>;
  readonly selectedConversationId: string | null;
  readonly configSnapshot: ConfigReadResponse | null;
}

type AppControllerActions = Omit<AppController, "retryConnection" | "setInput" | "checkForAppUpdate" | "installAppUpdate">;

function isConfigVersionConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(CONFIG_VERSION_CONFLICT_MESSAGE);
}

function createMultiAgentConfigWriteParams(
  snapshot: ConfigReadResponse | null,
  enabled: boolean,
): ConfigBatchWriteParams {
  const writeTarget = readUserConfigWriteTarget(snapshot);
  return {
    edits: [
      { keyPath: "features.multi_agent", value: enabled, mergeStrategy: "replace" },
      { keyPath: "features.multi_agent_v2", value: enabled, mergeStrategy: "replace" },
    ],
    filePath: writeTarget.filePath,
    expectedVersion: writeTarget.expectedVersion,
    reloadUserConfig: true,
  };
}

function createAgentsConfigWriteParams(
  snapshot: ConfigReadResponse | null,
  settings: AgentsConfigUpdateInput,
): ConfigBatchWriteParams {
  const writeTarget = readUserConfigWriteTarget(snapshot);
  const edits: ConfigBatchWriteParams["edits"] = [
    { keyPath: "features.multi_agent", value: settings.multiAgentEnabled, mergeStrategy: "replace" },
    { keyPath: "features.multi_agent_v2", value: settings.multiAgentV2Enabled, mergeStrategy: "replace" },
    { keyPath: "agents.max_threads", value: settings.maxThreads, mergeStrategy: "replace" },
    { keyPath: "agents.max_depth", value: settings.maxDepth, mergeStrategy: "replace" },
    {
      keyPath: "agents.job_max_runtime_seconds",
      value: settings.jobMaxRuntimeSeconds,
      mergeStrategy: "replace",
    },
  ];

  if (settings.role !== null) {
    const roleKey = `agents.${settings.role.name}`;
    edits.push(
      {
        keyPath: `${roleKey}.description`,
        value: settings.role.description,
        mergeStrategy: "replace",
      },
      {
        keyPath: `${roleKey}.config_file`,
        value: settings.role.configFile,
        mergeStrategy: "replace",
      },
      {
        keyPath: `${roleKey}.nickname_candidates`,
        value: settings.role.nicknameCandidates === null ? null : [...settings.role.nicknameCandidates],
        mergeStrategy: "replace",
      },
    );
  }

  return {
    edits,
    filePath: writeTarget.filePath,
    expectedVersion: writeTarget.expectedVersion,
    reloadUserConfig: true,
  };
}

async function writeMultiAgentConfigValues(
  client: ProtocolClient,
  snapshot: ConfigReadResponse | null,
  enabled: boolean,
): Promise<void> {
  await client.request("config/batchWrite", createMultiAgentConfigWriteParams(snapshot, enabled));
}

async function writeAgentsConfigValues(
  client: ProtocolClient,
  snapshot: ConfigReadResponse | null,
  settings: AgentsConfigUpdateInput,
): Promise<void> {
  await client.request("config/batchWrite", createAgentsConfigWriteParams(snapshot, settings));
}

export function useAppControllerActions({
  agentEnvironment,
  allowlistRef,
  bootstrap,
  client,
  dispatch,
  ensureAppServerReady,
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
    try {
      if (!(await ensureAppServerReady())) {
        dispatch({
          type: "authLogin/completed",
          success: false,
          error: "Codex app-server 尚未完成初始化，请稍后重试。",
        });
        return;
      }
      await runBusy(async () => {
        await ensureChatgptModeForLogin(client, hostBridge, agentEnvironment);
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
    } catch (error) {
      dispatch({ type: "authLogin/completed", success: false, error: toErrorMessage(error) });
      console.error("登录 ChatGPT 失败", error);
    }
  }, [agentEnvironment, client, dispatch, ensureAppServerReady, hostBridge, runBusy]);

  const logout = useCallback(async () => {
    await runBusy(async () => {
      await logoutWithLocalCleanup(client, hostBridge, dispatch);
    });
  }, [client, dispatch, hostBridge, runBusy]);

  const refreshConfigSnapshot = useCallback(
    (cwd?: string | null) => readConfigSnapshot(client, dispatch, { cwd }),
    [client, dispatch],
  );
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
  const pluginActions = useAppControllerPluginActions({ client });
  const setMultiAgentEnabled = useCallback(async (enabled: boolean) => {
    await runBusy(async () => {
      try {
        await writeMultiAgentConfigValues(client, configSnapshot, enabled);
      } catch (error) {
        if (!isConfigVersionConflictError(error)) {
          throw error;
        }
        await writeMultiAgentConfigValues(client, await readConfigSnapshot(client, dispatch), enabled);
      }
      await bootstrap(true);
    });
  }, [bootstrap, client, configSnapshot, dispatch, runBusy]);
  const applyAgentsConfig = useCallback(async (settings: AgentsConfigUpdateInput) => {
    await runBusy(async () => {
      try {
        await writeAgentsConfigValues(client, configSnapshot, settings);
      } catch (error) {
        if (!isConfigVersionConflictError(error)) {
          throw error;
        }
        await writeAgentsConfigValues(client, await readConfigSnapshot(client, dispatch), settings);
      }
      await bootstrap(true);
    });
  }, [bootstrap, client, configSnapshot, dispatch, runBusy]);
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
    archiveThread,
    applyAgentsConfig,
    batchWriteConfig,
    batchWriteConfigSnapshot,
    listArchivedThreads,
    listMcpServerStatuses,
    login,
    logout,
    refreshAuthState,
    refreshConfigSnapshot,
    refreshMcpData,
    resolveServerRequest,
    resetMemories,
    setMultiAgentEnabled,
    setThreadMemoryMode,
    unarchiveThread,
    writeConfigValue,
    ...pluginActions,
  };
}
