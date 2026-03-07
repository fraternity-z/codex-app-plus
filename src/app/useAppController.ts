import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HostBridge } from "../bridge/types";
import type { AppAction, AppState, AuthStatus, ServerRequestResolution } from "../domain/types";
import type { GetAuthStatusResponse } from "../protocol/generated/GetAuthStatusResponse";
import type { InitializeParams } from "../protocol/generated/InitializeParams";
import type { CollaborationModeListResponse } from "../protocol/generated/v2/CollaborationModeListResponse";
import type { ConfigBatchWriteParams } from "../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../protocol/generated/v2/ConfigValueWriteParams";
import type { McpServerStatus } from "../protocol/generated/v2/McpServerStatus";
import type { ThreadListResponse } from "../protocol/generated/v2/ThreadListResponse";
import {
  batchWriteConfigAndRefresh,
  type ConfigMutationResult,
  listAllMcpServerStatuses,
  readConfigSnapshot,
  refreshMcpData,
  type McpRefreshResult,
  writeConfigValueAndRefresh,
} from "./configOperations";
import { applyAppServerNotification } from "./appControllerNotifications";
import { createConversationFromThread } from "./conversationState";
import { FrameTextDeltaQueue } from "./frameTextDeltaQueue";
import { OutputDeltaQueue } from "./outputDeltaQueue";
import { createServerRequestPayload, normalizeServerRequest } from "./serverRequests";
import { ProtocolClient } from "../protocol/client";
import { useAppStore } from "../state/store";

const APP_VERSION = "0.1.0";
const RETRY_DELAY_MS = 3_000;
const THREAD_PAGE_SIZE = 100;

interface AppController {
  readonly state: AppState;
  setInput: (text: string) => void;
  retryConnection: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listMcpServerStatuses: () => Promise<ReadonlyArray<McpServerStatus>>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
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

async function loadConversationCatalog(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
  const conversations = [];
  let cursor: string | null = null;
  do {
    const response = (await client.request("thread/list", { archived: false, cursor, limit: THREAD_PAGE_SIZE, sortKey: "updated_at" })) as ThreadListResponse;
    conversations.push(...response.data.map((thread) => createConversationFromThread(thread)));
    cursor = response.nextCursor;
  } while (cursor !== null);
  dispatch({ type: "conversations/catalogLoaded", conversations });
}

async function loadBootstrapSnapshot(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
  const [, , config, collaborationModes] = await Promise.all([
    loadAuthStatus(client, dispatch),
    loadConversationCatalog(client, dispatch),
    client.request("config/read", { includeLayers: true }),
    client.request("collaborationMode/list", {}),
  ]);
  dispatch({ type: "config/loaded", config: config as ConfigReadResponse });
  const response = collaborationModes as CollaborationModeListResponse;
  dispatch({ type: "collaborationModes/loaded", modes: response.data.map((mode) => ({ name: mode.name, mode: mode.mode, model: mode.model, reasoningEffort: mode.reasoning_effort })) });
}

async function startOrReuseAppServer(client: ProtocolClient): Promise<void> {
  try {
    await client.startAppServer();
  } catch (error) {
    if (!toErrorMessage(error).includes("已在运行")) {
      throw error;
    }
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
      onServerRequest: (id, method, params) => dispatch({ type: "serverRequest/received", request: normalizeServerRequest(id, method, params) }),
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
      await loadBootstrapSnapshot(client, dispatch);
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
      await client.request("account/login/start", { type: "chatgpt" });
    });
  }, [client, runBusy]);

  const refreshConfig = useCallback(() => readConfigSnapshot(client, dispatch), [client, dispatch]);
  const refreshMcp = useCallback(() => refreshMcpData(client, dispatch), [client, dispatch]);
  const listStatuses = useCallback(() => listAllMcpServerStatuses(client), [client]);
  const writeConfigValue = useCallback((params: ConfigValueWriteParams) => runBusy(() => writeConfigValueAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);
  const batchWriteConfig = useCallback((params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndRefresh(client, dispatch, params)), [client, dispatch, runBusy]);

  const resolveServerRequest = useCallback(async (resolution: ServerRequestResolution) => {
    await client.resolveServerRequest(resolution.requestId, createServerRequestPayload(resolution));
    dispatch({ type: "serverRequest/resolved", requestId: resolution.requestId });
  }, [client, dispatch]);

  return { state, setInput: (text) => dispatch({ type: "input/changed", value: text }), retryConnection: () => bootstrap(true), refreshConfigSnapshot: refreshConfig, refreshMcpData: refreshMcp, listMcpServerStatuses: listStatuses, writeConfigValue, batchWriteConfig, login, resolveServerRequest };
}
