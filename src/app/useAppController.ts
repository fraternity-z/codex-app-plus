import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HostBridge } from "../bridge/types";
import type { AppAction, AppState, AuthStatus, ServerRequestResolution } from "../domain/types";
import type { GetAuthStatusResponse } from "../protocol/generated/GetAuthStatusResponse";
import type { InitializeParams } from "../protocol/generated/InitializeParams";
import type { GetAccountRateLimitsResponse } from "../protocol/generated/v2/GetAccountRateLimitsResponse";
import type { GetAccountResponse } from "../protocol/generated/v2/GetAccountResponse";
import type { CollaborationModeListResponse } from "../protocol/generated/v2/CollaborationModeListResponse";
import type { ConfigBatchWriteParams } from "../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../protocol/generated/v2/ConfigValueWriteParams";
import type { LoginAccountResponse } from "../protocol/generated/v2/LoginAccountResponse";
import type { McpServerStatus } from "../protocol/generated/v2/McpServerStatus";
import {
  batchWriteConfigAndReadSnapshot,
  batchWriteConfigAndRefresh,
  type ConfigMutationResult,
  type ConfigSnapshotMutationResult,
  listAllMcpServerStatuses,
  readConfigSnapshot,
  refreshMcpData,
  type McpRefreshResult,
  writeConfigValueAndRefresh,
} from "./configOperations";
import { applyAppServerNotification } from "./appControllerNotifications";
import { createConversationFromThreadSummary } from "./conversationState";
import { FrameTextDeltaQueue } from "./frameTextDeltaQueue";
import { OutputDeltaQueue } from "./outputDeltaQueue";
import { createServerRequestPayload, normalizeServerRequest } from "./serverRequests";
import { loadThreadCatalog } from "./threadCatalog";
import { ProtocolClient } from "../protocol/client";
import { useAppStore } from "../state/store";

const APP_VERSION = "0.1.0";
const RETRY_DELAY_MS = 3_000;
interface AppController {
  readonly state: AppState;
  setInput: (text: string) => void;
  retryConnection: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listMcpServerStatuses: () => Promise<ReadonlyArray<McpServerStatus>>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>;
  login: () => Promise<void>;
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

async function loadAuthStatus(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
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
  dispatch: (action: AppAction) => void
): Promise<void> {
  const threads = await loadThreadCatalog(
    { request: (method, params) => client.request(method, params) },
    () => hostBridge.app.listCodexSessions()
  );
  const conversations = threads.map(createConversationFromThreadSummary);
  dispatch({ type: "conversations/catalogLoaded", conversations });
}

async function loadAccountSnapshot(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
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

async function loadRateLimits(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
  try {
    const response = (await client.request("account/rateLimits/read", undefined)) as GetAccountRateLimitsResponse;
    dispatch({ type: "rateLimits/updated", rateLimits: response.rateLimits });
  } catch {
    dispatch({ type: "rateLimits/updated", rateLimits: null });
  }
}

async function loadBootstrapSnapshot(client: ProtocolClient, hostBridge: HostBridge, dispatch: (action: AppAction) => void): Promise<void> {
  const [, , , , config, collaborationModes, statuses] = await Promise.all([
    loadAuthStatus(client, dispatch),
    loadConversationCatalog(client, hostBridge, dispatch),
    loadAccountSnapshot(client, dispatch),
    loadRateLimits(client, dispatch),
    client.request("config/read", { includeLayers: true }),
    client.request("collaborationMode/list", {}),
    listAllMcpServerStatuses(client),
  ]);
  dispatch({ type: "config/loaded", config: config as ConfigReadResponse });
  dispatch({ type: "mcp/statusesLoaded", statuses: statuses as ReadonlyArray<McpServerStatus> });
  const response = collaborationModes as CollaborationModeListResponse;
  dispatch({ type: "collaborationModes/loaded", modes: response.data.map((mode) => ({ name: mode.name, mode: mode.mode, model: mode.model, reasoningEffort: mode.reasoning_effort })) });
}

async function startOrReuseAppServer(client: ProtocolClient): Promise<void> {
  try {
    await client.startAppServer();
  } catch (error) {
    if (!toErrorMessage(error).includes("already")) {
      throw error;
    }
  }
}

async function openChatgptLogin(client: ProtocolClient, hostBridge: HostBridge, dispatch: (action: AppAction) => void): Promise<void> {
  const response = (await client.request("account/login/start", { type: "chatgpt" })) as LoginAccountResponse;
  if (response.type !== "chatgpt") {
    dispatch({ type: "authLogin/completed", success: true, error: null });
    return;
  }
  dispatch({ type: "authLogin/started", loginId: response.loginId, authUrl: response.authUrl });
  await hostBridge.app.openExternal(response.authUrl);
}

async function loginWithStoredTokens(client: ProtocolClient, hostBridge: HostBridge): Promise<boolean> {
  try {
    const tokens = await hostBridge.app.readChatgptAuthTokens();
    await hostBridge.app.writeChatgptAuthTokens(tokens);
    const response = (await client.request("account/login/start", { type: "chatgptAuthTokens", accessToken: tokens.accessToken, chatgptAccountId: tokens.chatgptAccountId, chatgptPlanType: tokens.chatgptPlanType })) as LoginAccountResponse;
    return response.type === "chatgptAuthTokens";
  } catch {
    return false;
  }
}

export function useAppController(hostBridge: HostBridge): AppController {
  const { state, dispatch } = useAppStore();
  const clientRef = useRef<ProtocolClient | null>(null);
  const bootStartedRef = useRef(false);
  const bootingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryHandlerRef = useRef<() => void>(() => undefined);
  const textDeltaQueueRef = useRef<FrameTextDeltaQueue | null>(null);
  const outputDeltaQueueRef = useRef<OutputDeltaQueue | null>(null);

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

  const client = useMemo(() => {
    if (clientRef.current !== null) {
      return clientRef.current;
    }
    clientRef.current = new ProtocolClient(hostBridge, {
      onConnectionChanged: (status) => dispatch({ type: "connection/changed", status }),
      onNotification: (method, params) => {
        dispatch({ type: "notification/received", notification: { method, params } });
        applyAppServerNotification({ dispatch, textDeltaQueue: textDeltaQueueRef.current!, outputDeltaQueue: outputDeltaQueueRef.current! }, method, params);
      },
      onServerRequest: (id, method, params) => {
        const request = normalizeServerRequest(id, method, params);
        if (request.kind === "tokenRefresh") {
          dispatch({ type: "serverRequest/received", request });
          void (async () => {
            try {
              const tokens = await hostBridge.app.readChatgptAuthTokens();
              await hostBridge.app.writeChatgptAuthTokens(tokens);
              await clientRef.current?.resolveServerRequest(request.id, { accessToken: tokens.accessToken, chatgptAccountId: tokens.chatgptAccountId, chatgptPlanType: tokens.chatgptPlanType });
              dispatch({ type: "serverRequest/resolved", requestId: request.id });
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
      },
      onFatalError: (message) => {
        dispatch({ type: "fatal/error", message });
        scheduleRetry();
      },
    });
    return clientRef.current;
  }, [dispatch, hostBridge, scheduleRetry]);

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
        await client.restartAppServer();
      } else {
        await startOrReuseAppServer(client);
      }
      await client.initializeConnection(createInitializeParams());
      dispatch({ type: "initialized/changed", ready: true });
      await loadBootstrapSnapshot(client, hostBridge, dispatch);
    } catch (error) {
      dispatch({ type: "fatal/error", message: toErrorMessage(error) });
      scheduleRetry();
    } finally {
      dispatch({ type: "bootstrapBusy/changed", busy: false });
      bootingRef.current = false;
    }
  }, [clearRetry, client, dispatch, scheduleRetry]);

  retryHandlerRef.current = () => void bootstrap(true);

  useEffect(() => {
    void client.attach();
    return () => {
      client.detach();
      clearRetry();
    };
  }, [client, clearRetry]);

  useEffect(() => {
    if (bootStartedRef.current) {
      return;
    }
    bootStartedRef.current = true;
    void bootstrap(false);
  }, [bootstrap]);

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
        await loadAuthStatus(client, dispatch);
        await loadAccountSnapshot(client, dispatch);
        return;
      }
      await openChatgptLogin(client, hostBridge, dispatch);
    });
  }, [client, dispatch, hostBridge, runBusy]);

  const refreshConfig = useCallback(() => readConfigSnapshot(client, dispatch), [client, dispatch]);
  const refreshMcp = useCallback(() => refreshMcpData(client, dispatch), [client, dispatch]);
  const listStatuses = useCallback(async () => {
    const statuses = await listAllMcpServerStatuses(client);
    dispatch({ type: "mcp/statusesLoaded", statuses });
    return statuses;
  }, [client, dispatch]);
  const writeConfigValue = useCallback((params: ConfigValueWriteParams) => runBusy(() => writeConfigValueAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfig = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfigSnapshot = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndReadSnapshot(client, dispatch, params)), [client, dispatch, runBusy]);

  const resolveServerRequest = useCallback(async (resolution: ServerRequestResolution) => {
    if (resolution.kind === "tokenRefresh") {
      await hostBridge.app.writeChatgptAuthTokens({ accessToken: resolution.result.accessToken, chatgptAccountId: resolution.result.chatgptAccountId, chatgptPlanType: resolution.result.chatgptPlanType });
    }
    await client.resolveServerRequest(resolution.requestId, createServerRequestPayload(resolution));
    dispatch({ type: "serverRequest/resolved", requestId: resolution.requestId });
  }, [client, dispatch, hostBridge.app]);

  return { state, setInput: (text) => dispatch({ type: "input/changed", value: text }), retryConnection: () => bootstrap(true), refreshConfigSnapshot: refreshConfig, refreshMcpData: refreshMcp, listMcpServerStatuses: listStatuses, writeConfigValue, batchWriteConfig, batchWriteConfigSnapshot, login, resolveServerRequest };
}
