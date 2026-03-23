import { useCallback, type MutableRefObject } from "react";
import type { HostBridge } from "../../bridge/types";
import type { ServerRequestResolution } from "../../domain/types";
import type { ThreadUnarchiveResponse } from "../../protocol/generated/v2/ThreadUnarchiveResponse";
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
import { startWindowsSandboxSetupRequest } from "../../features/settings/sandbox/windowsSandboxSetup";
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
  SkillsConfigWriteParams,
  SkillsConfigWriteResponse,
  SkillsListParams,
  SkillsListResponse,
  SkillsRemoteReadParams,
  SkillsRemoteReadResponse,
  SkillsRemoteWriteParams,
  SkillsRemoteWriteResponse,
  WindowsSandboxSetupMode,
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
  const listSkills = useCallback((params: SkillsListParams) => (
    client.request("skills/list", params) as Promise<SkillsListResponse>
  ), [client]);
  const listRemoteSkills = useCallback((params: SkillsRemoteReadParams) => (
    client.request("skills/remote/list", params) as Promise<SkillsRemoteReadResponse>
  ), [client]);
  const writeSkillConfig = useCallback((params: SkillsConfigWriteParams) => (
    client.request("skills/config/write", params) as Promise<SkillsConfigWriteResponse>
  ), [client]);
  const exportRemoteSkill = useCallback((params: SkillsRemoteWriteParams) => (
    client.request("skills/remote/export", params) as Promise<SkillsRemoteWriteResponse>
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
  const startWindowsSandboxSetup = useCallback(
    (mode: WindowsSandboxSetupMode) => startWindowsSandboxSetupRequest(client, dispatch, mode),
    [client, dispatch],
  );

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
    batchWriteConfig,
    batchWriteConfigSnapshot,
    exportRemoteSkill,
    listArchivedThreads,
    listMcpServerStatuses,
    listRemoteSkills,
    listSkills,
    login,
    logout,
    refreshAuthState,
    refreshConfigSnapshot,
    refreshMcpData,
    resolveServerRequest,
    setMultiAgentEnabled,
    startWindowsSandboxSetup,
    unarchiveThread,
    writeConfigValue,
    writeSkillConfig,
  };
}
