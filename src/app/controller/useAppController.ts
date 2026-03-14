import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentEnvironment, HostBridge } from "../../bridge/types";
import type { ReceivedServerRequest } from "../../domain/serverRequests";
import type { AppAction, AuthStatus, ServerRequestResolution, ThreadSummary } from "../../domain/types";
import type { GetAuthStatusResponse } from "../../protocol/generated/GetAuthStatusResponse";
import type { InitializeParams } from "../../protocol/generated/InitializeParams";
import type { GetAccountRateLimitsResponse } from "../../protocol/generated/v2/GetAccountRateLimitsResponse";
import type { GetAccountResponse } from "../../protocol/generated/v2/GetAccountResponse";
import type { CollaborationModeListResponse } from "../../protocol/generated/v2/CollaborationModeListResponse";
import type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
import type { LoginAccountResponse } from "../../protocol/generated/v2/LoginAccountResponse";
import type { McpServerStatus } from "../../protocol/generated/v2/McpServerStatus";
import type { WindowsSandboxSetupCompletedNotification } from "../../protocol/generated/v2/WindowsSandboxSetupCompletedNotification";
import type { WindowsSandboxSetupMode } from "../../protocol/generated/v2/WindowsSandboxSetupMode";
import type { WindowsSandboxSetupStartResponse } from "../../protocol/generated/v2/WindowsSandboxSetupStartResponse";
import type { ThreadUnarchiveResponse } from "../../protocol/generated/v2/ThreadUnarchiveResponse";
import {
  batchWriteConfigAndReadSnapshot,
  batchWriteConfigAndRefresh,
  type ConfigMutationResult,
  type ConfigSnapshotMutationResult,
  listAllExperimentalFeatures,
  listAllMcpServerStatuses,
  readConfigSnapshot,
  refreshMcpData,
  type McpRefreshResult,
  writeConfigValueAndRefresh,
} from "../../features/settings/config/configOperations";
import { readUserConfigWriteTarget } from "../../features/settings/config/configWriteTarget";
import { applyAppServerNotification } from "./appControllerNotifications";
import { createConversationFromThread, createConversationFromThreadSummary } from "../../features/conversation/model/conversationState";
import { FrameTextDeltaQueue } from "../../features/conversation/model/frameTextDeltaQueue";
import { OutputDeltaQueue } from "../../features/conversation/model/outputDeltaQueue";
import { createServerRequestPayload, normalizeServerRequest } from "./serverRequests";
import { listAllThreads, loadThreadCatalog } from "../../features/workspace/model/threadCatalog";
import { refreshConfigAfterWindowsSandboxSetup, startWindowsSandboxSetupRequest } from "../../features/settings/sandbox/windowsSandboxSetup";
import { ProtocolClient } from "../../protocol/client";
import { useAppDispatch } from "../../state/store";
import { useAppControllerRuntimeState } from "./appControllerState";

const APP_VERSION = "0.1.0";
const RETRY_DELAY_MS = 3_000;
const WINDOWS_SANDBOX_STATE_IDLE_RESET_MS = 120_000;

type AccountRequestClient = Pick<ProtocolClient, "request">;
type AppHostBridge = Pick<HostBridge, "app">;

interface AppController {
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
  setMultiAgentEnabled: (enabled: boolean) => Promise<void>;
  startWindowsSandboxSetup: (mode: WindowsSandboxSetupMode) => Promise<WindowsSandboxSetupStartResponse>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  resolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

function createInitializeParams(): InitializeParams {
  return { clientInfo: { name: "codex_app_plus", title: "Codex App Plus", version: APP_VERSION }, capabilities: { experimentalApi: true, optOutNotificationMethods: null } };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapAuthStatus(response: GetAuthStatusResponse): { status: AuthStatus; mode: string | null } {
  if (response.requiresOpenaiAuth === true && response.authMethod === null) {
    return { status: "needs_login", mode: null };
  }
  if (response.authMethod !== null || response.requiresOpenaiAuth === false) {
    return { status: "authenticated", mode: response.authMethod };
  }
  return { status: "unknown", mode: response.authMethod };
}

async function loadAuthStatus(client: AccountRequestClient, dispatch: (action: AppAction) => void): Promise<void> {
  try {
    const response = (await client.request("getAuthStatus", { includeToken: false, refreshToken: false })) as GetAuthStatusResponse;
    const auth = mapAuthStatus(response);
    dispatch({ type: "auth/changed", status: auth.status, mode: auth.mode });
  } catch {
    dispatch({ type: "auth/changed", status: "unknown", mode: null });
  }
}

async function loadConversationCatalog(
  client: ProtocolClient,
  hostBridge: HostBridge,
  dispatch: (action: AppAction) => void,
  agentEnvironment: AgentEnvironment,
): Promise<void> {
  const threads = await loadThreadCatalog(
    { request: (method, params) => client.request(method, params) },
    () => hostBridge.app.listCodexSessions({ agentEnvironment }),
    agentEnvironment,
  );
  const conversations = threads.map(createConversationFromThreadSummary);
  dispatch({ type: "conversations/catalogLoaded", conversations });
}

async function loadAccountSnapshot(client: AccountRequestClient, dispatch: (action: AppAction) => void): Promise<void> {
  try {
    const response = (await client.request("account/read", { refreshToken: false })) as GetAccountResponse;
    if (response.account === null) {
      dispatch({ type: "account/updated", account: null });
      return;
    }
    dispatch({ type: "account/updated", account: { authMode: response.account.type === "apiKey" ? "apikey" : "chatgpt", planType: response.account.type === "chatgpt" ? response.account.planType : null } });
  } catch {
    dispatch({ type: "account/updated", account: null });
  }
}

async function loadRateLimits(client: AccountRequestClient, dispatch: (action: AppAction) => void): Promise<void> {
  try {
    const response = (await client.request("account/rateLimits/read", undefined)) as GetAccountRateLimitsResponse;
    dispatch({ type: "rateLimits/updated", rateLimits: response.rateLimits });
  } catch {
    dispatch({ type: "rateLimits/updated", rateLimits: null });
  }
}

export async function refreshAccountState(client: AccountRequestClient, dispatch: (action: AppAction) => void): Promise<void> {
  await Promise.all([
    loadAuthStatus(client, dispatch),
    loadAccountSnapshot(client, dispatch),
    loadRateLimits(client, dispatch),
  ]);
}

async function loadBootstrapSnapshot(client: ProtocolClient, hostBridge: HostBridge, dispatch: (action: AppAction) => void, agentEnvironment: AgentEnvironment): Promise<void> {
  const [, , config, collaborationModes, experimentalFeatures, statuses] = await Promise.all([
    refreshAccountState(client, dispatch),
    loadConversationCatalog(client, hostBridge, dispatch, agentEnvironment),
    client.request("config/read", { includeLayers: true }),
    client.request("collaborationMode/list", {}),
    listAllExperimentalFeatures(client),
    listAllMcpServerStatuses(client),
  ]);
  dispatch({ type: "config/loaded", config: config as ConfigReadResponse });
  dispatch({ type: "mcp/statusesLoaded", statuses: statuses as ReadonlyArray<McpServerStatus> });
  const response = collaborationModes as CollaborationModeListResponse;
  dispatch({ type: "collaborationModes/loaded", modes: response.data.map((mode) => ({ name: mode.name, mode: mode.mode, model: mode.model, reasoningEffort: mode.reasoning_effort })) });
  dispatch({ type: "experimentalFeatures/loaded", features: experimentalFeatures });
}

async function startOrReuseAppServer(
  client: ProtocolClient,
  agentEnvironment: AgentEnvironment
): Promise<void> {
  try {
    await client.startAppServer(createAppServerStartInput(agentEnvironment));
  } catch (error) {
    if (!toErrorMessage(error).includes("already")) {
      throw error;
    }
  }
}

function createAppServerStartInput(agentEnvironment: AgentEnvironment) {
  return { agentEnvironment };
}

async function incrementThreadElicitation(client: ProtocolClient, threadId: string): Promise<void> {
  await client.request("thread/increment_elicitation", { threadId });
}

async function decrementThreadElicitation(client: ProtocolClient, threadId: string): Promise<void> {
  await client.request("thread/decrement_elicitation", { threadId });
}

function reportServerRequestError(
  dispatch: (action: AppAction) => void,
  threadId: string | null,
  turnId: string | null,
  title: string,
  error: unknown,
): void {
  const detail = toErrorMessage(error);
  dispatch({
    type: "banner/pushed",
    banner: { id: `server-request:${title}:${detail}`, level: "error", title, detail, source: "server-request" },
  });
  if (threadId !== null) {
    dispatch({ type: "conversation/systemNoticeAdded", conversationId: threadId, turnId, title, detail, level: "error", source: "server-request" });
  }
}

export async function openChatgptLogin(client: AccountRequestClient, hostBridge: AppHostBridge, dispatch: (action: AppAction) => void): Promise<boolean> {
  const response = (await client.request("account/login/start", { type: "chatgpt" })) as LoginAccountResponse;
  if (response.type !== "chatgpt") {
    dispatch({ type: "authLogin/completed", success: true, error: null });
    return false;
  }
  dispatch({ type: "authLogin/started", loginId: response.loginId, authUrl: response.authUrl });
  await hostBridge.app.openExternal(response.authUrl);
  return true;
}

export async function loginWithStoredTokens(client: AccountRequestClient, hostBridge: AppHostBridge): Promise<boolean> {
  try {
    const tokens = await hostBridge.app.readChatgptAuthTokens();
    await hostBridge.app.writeChatgptAuthTokens(tokens);
    const response = (await client.request("account/login/start", { type: "chatgptAuthTokens", accessToken: tokens.accessToken, chatgptAccountId: tokens.chatgptAccountId, chatgptPlanType: tokens.chatgptPlanType })) as LoginAccountResponse;
    return response.type === "chatgptAuthTokens";
  } catch {
    return false;
  }
}

export async function logoutWithLocalCleanup(client: AccountRequestClient, hostBridge: AppHostBridge, dispatch: (action: AppAction) => void): Promise<void> {
  await client.request("account/logout", undefined);
  await hostBridge.app.clearChatgptAuthState();
  await refreshAccountState(client, dispatch);
}

export function useAppController(hostBridge: HostBridge, agentEnvironment: AgentEnvironment): AppController {
  const dispatch = useAppDispatch();
  const runtimeState = useAppControllerRuntimeState();
  const clientRef = useRef<ProtocolClient | null>(null);
  const bootStartedRef = useRef(false);
  const bootingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const windowsSandboxResetTimerRef = useRef<number | null>(null);
  const retryHandlerRef = useRef<() => void>(() => undefined);
  const textDeltaQueueRef = useRef<FrameTextDeltaQueue | null>(null);
  const outputDeltaQueueRef = useRef<OutputDeltaQueue | null>(null);
  const pendingRequestsRef = useRef(runtimeState.pendingRequestsById);
  const pausedRequestThreadIdsRef = useRef(new Map<string, string>());
  const requestThreadMetaRef = useRef(new Map<string, { threadId: string; turnId: string | null }>());
  const settledRequestIdsRef = useRef(new Set<string>());
  const previousAgentEnvironmentRef = useRef(agentEnvironment);
  const agentEnvironmentRef = useRef(agentEnvironment);

  if (textDeltaQueueRef.current === null) {
    textDeltaQueueRef.current = new FrameTextDeltaQueue({ onFlush: (entries) => dispatch({ type: "conversation/textDeltasFlushed", entries }) });
  }
  if (outputDeltaQueueRef.current === null) {
    outputDeltaQueueRef.current = new OutputDeltaQueue({ onFlush: (entries) => dispatch({ type: "conversation/outputDeltasFlushed", entries }) });
  }

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    dispatch({ type: "retry/scheduled", at: null });
  }, [dispatch]);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      return;
    }
    const scheduledAt = Date.now() + RETRY_DELAY_MS;
    dispatch({ type: "retry/scheduled", at: scheduledAt });
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      dispatch({ type: "retry/scheduled", at: null });
      void retryHandlerRef.current();
    }, RETRY_DELAY_MS);
  }, [dispatch]);

  useEffect(() => {
    pendingRequestsRef.current = runtimeState.pendingRequestsById;
  }, [runtimeState.pendingRequestsById]);

  useEffect(() => {
    agentEnvironmentRef.current = agentEnvironment;
  }, [agentEnvironment]);

  useEffect(() => {
    if (runtimeState.connectionStatus === "connected") {
      return;
    }
    pausedRequestThreadIdsRef.current.clear();
    requestThreadMetaRef.current.clear();
    settledRequestIdsRef.current.clear();
  }, [runtimeState.connectionStatus]);

  const resumeThreadTimeout = useCallback((threadId: string, turnId: string | null) => {
    if (clientRef.current === null) {
      return;
    }
    void decrementThreadElicitation(clientRef.current, threadId).catch((error) => {
      reportServerRequestError(dispatch, threadId, turnId, "Failed to resume request timeout", error);
    });
  }, [dispatch]);

  const trackThreadRequest = useCallback((request: ReceivedServerRequest) => {
    if (request.threadId === null || clientRef.current === null || pausedRequestThreadIdsRef.current.has(request.id)) {
      return;
    }
    const { threadId } = request;
    requestThreadMetaRef.current.set(request.id, { threadId, turnId: request.turnId });
    void incrementThreadElicitation(clientRef.current, threadId)
      .then(() => {
        if (settledRequestIdsRef.current.delete(request.id)) {
          requestThreadMetaRef.current.delete(request.id);
          resumeThreadTimeout(threadId, request.turnId);
          return;
        }
        pausedRequestThreadIdsRef.current.set(request.id, threadId);
      })
      .catch((error) => {
        requestThreadMetaRef.current.delete(request.id);
        reportServerRequestError(dispatch, threadId, request.turnId, "Failed to pause request timeout", error);
      });
  }, [dispatch, resumeThreadTimeout]);

  const settleThreadRequest = useCallback((requestId: string) => {
    const threadId = pausedRequestThreadIdsRef.current.get(requestId);
    const requestMeta = requestThreadMetaRef.current.get(requestId) ?? null;
    if (threadId === undefined) {
      if (requestMeta !== null) {
        settledRequestIdsRef.current.add(requestId);
      }
      return;
    }
    pausedRequestThreadIdsRef.current.delete(requestId);
    requestThreadMetaRef.current.delete(requestId);
    resumeThreadTimeout(threadId, requestMeta?.turnId ?? null);
  }, [resumeThreadTimeout]);

  const client = useMemo(() => {
    if (clientRef.current !== null) {
      return clientRef.current;
    }
    clientRef.current = new ProtocolClient(hostBridge, {
      onConnectionChanged: (status) => dispatch({ type: "connection/changed", status }),
      onNotification: (method, params) => {
        dispatch({ type: "notification/received", notification: { method, params } });
        applyAppServerNotification({ dispatch, textDeltaQueue: textDeltaQueueRef.current!, outputDeltaQueue: outputDeltaQueueRef.current!, agentEnvironment: agentEnvironmentRef.current }, method, params);
        if (method === "serverRequest/resolved") {
          settleThreadRequest(String((params as { requestId: string | number }).requestId));
        }
        if (method === "account/login/completed" && clientRef.current !== null && (params as { success?: boolean }).success === true) {
          void refreshAccountState(clientRef.current, dispatch);
        }
        if (method === "windowsSandbox/setupCompleted" && clientRef.current !== null) {
          void refreshConfigAfterWindowsSandboxSetup(clientRef.current, dispatch, params as WindowsSandboxSetupCompletedNotification).catch((error) => dispatch({ type: "fatal/error", message: toErrorMessage(error) }));
        }
      },
      onServerRequest: (id, method, params) => {
        const request = normalizeServerRequest(id, method, params);
        if (request.kind === "tokenRefresh") {
          dispatch({ type: "serverRequest/received", request });
          void (async () => {
            try {
              const tokens = await hostBridge.app.readChatgptAuthTokens();
              await hostBridge.app.writeChatgptAuthTokens(tokens);
              await clientRef.current?.resolveServerRequest(request.rpcId, { accessToken: tokens.accessToken, chatgptAccountId: tokens.chatgptAccountId, chatgptPlanType: tokens.chatgptPlanType });
            } catch {
              try {
                await openChatgptLogin(clientRef.current!, hostBridge, dispatch);
              } catch (error) {
                dispatch({ type: "tokenRefresh/completed", requestId: request.id, error: toErrorMessage(error) });
              }
            }
          })();
          return;
        }
        dispatch({ type: "serverRequest/received", request });
        trackThreadRequest(request);
      },
      onFatalError: (message) => {
        dispatch({ type: "fatal/error", message });
        scheduleRetry();
      },
    });
    return clientRef.current;
  }, [dispatch, hostBridge, scheduleRetry, settleThreadRequest, trackThreadRequest]);

  const bootstrap = useCallback(async (forceRestart: boolean) => {
    if (bootingRef.current) {
      return;
    }
    bootingRef.current = true;
    clearRetry();
    dispatch({ type: "bootstrapBusy/changed", busy: true });
    dispatch({ type: "initialized/changed", ready: false });
    try {
      if (forceRestart) {
        await client.restartAppServer(createAppServerStartInput(agentEnvironment));
      } else {
        await startOrReuseAppServer(client, agentEnvironment);
      }
      await client.initializeConnection(createInitializeParams());
      dispatch({ type: "initialized/changed", ready: true });
      await loadBootstrapSnapshot(client, hostBridge, dispatch, agentEnvironment);
    } catch (error) {
      dispatch({ type: "fatal/error", message: toErrorMessage(error) });
      scheduleRetry();
    } finally {
      dispatch({ type: "bootstrapBusy/changed", busy: false });
      bootingRef.current = false;
    }
  }, [agentEnvironment, clearRetry, client, dispatch, scheduleRetry]);

  retryHandlerRef.current = () => void bootstrap(true);

  useEffect(() => {
    void client.attach();
    return () => {
      client.detach();
      clearRetry();
      if (windowsSandboxResetTimerRef.current !== null) {
        window.clearTimeout(windowsSandboxResetTimerRef.current);
        windowsSandboxResetTimerRef.current = null;
      }
    };
  }, [client, clearRetry]);

  useEffect(() => {
    if (windowsSandboxResetTimerRef.current !== null) {
      window.clearTimeout(windowsSandboxResetTimerRef.current);
      windowsSandboxResetTimerRef.current = null;
    }
    if (
      runtimeState.windowsSandboxSetup.pending
      || runtimeState.windowsSandboxSetup.mode === null
      || runtimeState.windowsSandboxSetup.success === null
    ) {
      return;
    }
    windowsSandboxResetTimerRef.current = window.setTimeout(() => {
      windowsSandboxResetTimerRef.current = null;
      dispatch({ type: "windowsSandbox/setupCleared" });
    }, WINDOWS_SANDBOX_STATE_IDLE_RESET_MS);
    return () => {
      if (windowsSandboxResetTimerRef.current !== null) {
        window.clearTimeout(windowsSandboxResetTimerRef.current);
        windowsSandboxResetTimerRef.current = null;
      }
    };
  }, [dispatch, runtimeState.windowsSandboxSetup]);

  useEffect(() => {
    if (bootStartedRef.current) {
      return;
    }
    bootStartedRef.current = true;
    void bootstrap(false);
  }, [bootstrap]);

  useEffect(() => {
    if (!bootStartedRef.current) {
      previousAgentEnvironmentRef.current = agentEnvironment;
      return;
    }
    if (previousAgentEnvironmentRef.current === agentEnvironment) {
      return;
    }
    previousAgentEnvironmentRef.current = agentEnvironment;
    void bootstrap(true);
  }, [agentEnvironment, bootstrap]);

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
      const loggedInWithTokens = await loginWithStoredTokens(client, hostBridge);
      if (loggedInWithTokens) {
        dispatch({ type: "authLogin/completed", success: true, error: null });
        await refreshAccountState(client, dispatch);
        return;
      }
      const openedBrowser = await openChatgptLogin(client, hostBridge, dispatch);
      if (!openedBrowser) {
        await refreshAccountState(client, dispatch);
      }
    });
  }, [client, dispatch, hostBridge, runBusy]);

  const logout = useCallback(async () => {
    await runBusy(async () => {
      await logoutWithLocalCleanup(client, hostBridge, dispatch);
    });
  }, [client, dispatch, hostBridge, runBusy]);

  const refreshConfig = useCallback(() => readConfigSnapshot(client, dispatch), [client, dispatch]);
  const refreshAuth = useCallback(() => refreshAccountState(client, dispatch), [client, dispatch]);
  const refreshMcp = useCallback(() => refreshMcpData(client, dispatch), [client, dispatch]);
  const listStatuses = useCallback(async () => {
    const statuses = await listAllMcpServerStatuses(client);
    dispatch({ type: "mcp/statusesLoaded", statuses });
    return statuses;
  }, [client, dispatch]);
  const listArchivedThreads = useCallback(
    () => listAllThreads({ request: (method, params) => client.request(method, params) }, agentEnvironment, true),
    [agentEnvironment, client]
  );
  const archiveThread = useCallback(async (threadId: string) => {
    await client.request("thread/archive", { threadId });
    dispatch({ type: "conversation/hiddenChanged", conversationId: threadId, hidden: true });
    if (runtimeState.selectedConversationId === threadId) {
      dispatch({ type: "conversation/selected", conversationId: null });
    }
  }, [client, dispatch, runtimeState.selectedConversationId]);
  const unarchiveThread = useCallback(async (threadId: string) => {
    const response = (await client.request("thread/unarchive", { threadId })) as ThreadUnarchiveResponse;
    dispatch({ type: "conversation/upserted", conversation: createConversationFromThread(response.thread, { agentEnvironment }) });
    dispatch({ type: "conversation/hiddenChanged", conversationId: threadId, hidden: false });
  }, [agentEnvironment, client, dispatch]);
  const writeConfigValue = useCallback((params: ConfigValueWriteParams) => runBusy(() => writeConfigValueAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfig = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfigSnapshot = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndReadSnapshot(client, dispatch, params)), [client, dispatch, runBusy]);
  const setMultiAgentEnabled = useCallback(async (enabled: boolean) => {
    await runBusy(async () => {
      const writeTarget = readUserConfigWriteTarget(runtimeState.configSnapshot);
      await client.request("config/value/write", {
        keyPath: "features.multi_agent",
        value: enabled,
        mergeStrategy: "replace",
        filePath: writeTarget.filePath,
        expectedVersion: writeTarget.expectedVersion
      });
      await bootstrap(true);
    });
  }, [bootstrap, client, runBusy, runtimeState.configSnapshot]);
  const startWindowsSandboxSetup = useCallback((mode: WindowsSandboxSetupMode) => startWindowsSandboxSetupRequest(client, dispatch, mode), [client, dispatch]);

  const resolveServerRequest = useCallback(async (resolution: ServerRequestResolution) => {
    const request = pendingRequestsRef.current[resolution.requestId];
    if (request === undefined) {
      return;
    }
    try {
      if (resolution.kind === "tokenRefresh") {
        await hostBridge.app.writeChatgptAuthTokens({ accessToken: resolution.result.accessToken, chatgptAccountId: resolution.result.chatgptAccountId, chatgptPlanType: resolution.result.chatgptPlanType });
      }
      await client.resolveServerRequest(request.rpcId, createServerRequestPayload(resolution));
    } catch (error) {
      reportServerRequestError(dispatch, request.threadId, request.turnId, "Failed to submit request response", error);
    }
  }, [client, dispatch, hostBridge.app]);

  return { setInput: (text) => dispatch({ type: "input/changed", value: text }), retryConnection: () => bootstrap(true), refreshConfigSnapshot: refreshConfig, refreshAuthState: refreshAuth, refreshMcpData: refreshMcp, listMcpServerStatuses: listStatuses, listArchivedThreads, archiveThread, unarchiveThread, writeConfigValue, batchWriteConfig, batchWriteConfigSnapshot, setMultiAgentEnabled, startWindowsSandboxSetup, login, logout, resolveServerRequest };
}
