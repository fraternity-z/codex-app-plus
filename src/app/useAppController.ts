import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HostBridge } from "../bridge/types";
import type { AppAction, AppState, AuthStatus, ServerRequestResolution } from "../domain/types";
import type { GetAuthStatusResponse } from "../protocol/generated/GetAuthStatusResponse";
import type { InitializeParams } from "../protocol/generated/InitializeParams";
import type { AgentMessageDeltaNotification } from "../protocol/generated/v2/AgentMessageDeltaNotification";
import type { CollaborationModeListResponse } from "../protocol/generated/v2/CollaborationModeListResponse";
import type { CommandExecutionOutputDeltaNotification } from "../protocol/generated/v2/CommandExecutionOutputDeltaNotification";
import type { ConfigBatchWriteParams } from "../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../protocol/generated/v2/ConfigValueWriteParams";
import type { FileChangeOutputDeltaNotification } from "../protocol/generated/v2/FileChangeOutputDeltaNotification";
import type { ItemCompletedNotification } from "../protocol/generated/v2/ItemCompletedNotification";
import type { ItemStartedNotification } from "../protocol/generated/v2/ItemStartedNotification";
import type { McpServerStatus } from "../protocol/generated/v2/McpServerStatus";
import type { PlanDeltaNotification } from "../protocol/generated/v2/PlanDeltaNotification";
import type { ServerRequestResolvedNotification } from "../protocol/generated/v2/ServerRequestResolvedNotification";
import type { TerminalInteractionNotification } from "../protocol/generated/v2/TerminalInteractionNotification";
import type { ThreadStartedNotification } from "../protocol/generated/v2/ThreadStartedNotification";
import type { ThreadStatusChangedNotification } from "../protocol/generated/v2/ThreadStatusChangedNotification";
import type { TurnCompletedNotification } from "../protocol/generated/v2/TurnCompletedNotification";
import type { TurnDiffUpdatedNotification } from "../protocol/generated/v2/TurnDiffUpdatedNotification";
import type { TurnPlanUpdatedNotification } from "../protocol/generated/v2/TurnPlanUpdatedNotification";
import type { TurnStartedNotification } from "../protocol/generated/v2/TurnStartedNotification";
import {
  batchWriteConfigAndRefresh,
  type ConfigMutationResult,
  listAllMcpServerStatuses,
  readConfigSnapshot,
  refreshMcpData,
  type McpRefreshResult,
  writeConfigValueAndRefresh
} from "./configOperations";
import { createServerRequestPayload, normalizeServerRequest } from "./serverRequests";
import { listAllThreads } from "./threadCatalog";
import { ProtocolClient } from "../protocol/client";
import { mapThreadToSummary } from "../protocol/mappers";
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
  login: () => Promise<void>;
  resolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  selectThread: (threadId: string) => void;
}

function createInitializeParams(): InitializeParams {
  return {
    clientInfo: { name: "codex_app_plus", title: "Codex App Plus", version: APP_VERSION },
    capabilities: { experimentalApi: true, optOutNotificationMethods: null }
  };
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

function applyNotification(dispatch: (action: AppAction) => void, method: string, params: unknown): void {
  if (method === "item/agentMessage/delta") {
    const payload = params as AgentMessageDeltaNotification;
    dispatch({ type: "message/assistantDelta", threadId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, delta: payload.delta });
    return;
  }

  if (method === "item/plan/delta") {
    const payload = params as PlanDeltaNotification;
    dispatch({ type: "item/planDelta", threadId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, delta: payload.delta });
    return;
  }

  if (method === "item/commandExecution/outputDelta") {
    const payload = params as CommandExecutionOutputDeltaNotification;
    dispatch({ type: "item/commandOutputDelta", threadId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, delta: payload.delta });
    return;
  }

  if (method === "item/fileChange/outputDelta") {
    const payload = params as FileChangeOutputDeltaNotification;
    dispatch({ type: "item/fileChangeDelta", threadId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, delta: payload.delta });
    return;
  }

  if (method === "item/commandExecution/terminalInteraction") {
    const payload = params as TerminalInteractionNotification;
    dispatch({ type: "item/terminalInteraction", threadId: payload.threadId, turnId: payload.turnId, itemId: payload.itemId, stdin: payload.stdin });
    return;
  }

  if (method === "item/started") {
    const payload = params as ItemStartedNotification;
    dispatch({ type: "item/started", threadId: payload.threadId, turnId: payload.turnId, item: payload.item });
    return;
  }

  if (method === "item/completed") {
    const payload = params as ItemCompletedNotification;
    dispatch({ type: "item/completed", threadId: payload.threadId, turnId: payload.turnId, item: payload.item });
    return;
  }

  if (method === "turn/started") {
    const payload = params as TurnStartedNotification;
    dispatch({ type: "turn/started", threadId: payload.threadId, turnId: payload.turn.id });
    return;
  }

  if (method === "turn/completed") {
    const payload = params as TurnCompletedNotification;
    dispatch({ type: "turn/completed", threadId: payload.threadId, turnId: payload.turn.id });
    return;
  }

  if (method === "thread/started") {
    const payload = params as ThreadStartedNotification;
    dispatch({ type: "thread/upserted", thread: mapThreadToSummary(payload.thread) });
    return;
  }

  if (method === "thread/status/changed") {
    const payload = params as ThreadStatusChangedNotification;
    const activeFlags = payload.status.type === "active" ? payload.status.activeFlags : [];
    dispatch({ type: "thread/statusChanged", threadId: payload.threadId, status: payload.status.type, activeFlags });
    return;
  }

  if (method === "turn/plan/updated") {
    const payload = params as TurnPlanUpdatedNotification;
    dispatch({ type: "turn/planUpdated", threadId: payload.threadId, turnId: payload.turnId, explanation: payload.explanation, plan: payload.plan });
    return;
  }

  if (method === "turn/diff/updated") {
    const payload = params as TurnDiffUpdatedNotification;
    dispatch({ type: "turn/diffUpdated", threadId: payload.threadId, turnId: payload.turnId, diff: payload.diff });
    return;
  }

  if (method === "serverRequest/resolved") {
    const payload = params as ServerRequestResolvedNotification;
    dispatch({ type: "serverRequest/resolved", requestId: String(payload.requestId) });
  }
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

async function loadThreads(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
  const threads = await listAllThreads({ request: (method, params) => client.request(method, params) });
  dispatch({ type: "threads/loaded", threads: [...threads] });
}

async function loadBootstrapSnapshot(client: ProtocolClient, dispatch: (action: AppAction) => void): Promise<void> {
  const [, , config, collaborationModes] = await Promise.all([
    loadAuthStatus(client, dispatch),
    loadThreads(client, dispatch),
    client.request("config/read", { includeLayers: true }),
    client.request("collaborationMode/list", {})
  ]);
  dispatch({ type: "config/loaded", config: config as ConfigReadResponse });
  const response = collaborationModes as CollaborationModeListResponse;
  dispatch({
    type: "collaborationModes/loaded",
    modes: response.data.map((mode) => ({
      name: mode.name,
      mode: mode.mode,
      model: mode.model,
      reasoningEffort: mode.reasoning_effort
    }))
  });
}

async function startOrReuseAppServer(client: ProtocolClient): Promise<void> {
  try {
    await client.startAppServer();
  } catch (error) {
    if (!toErrorMessage(error).includes("宸插湪杩愯")) {
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
        applyNotification(dispatch, method, params);
      },
      onServerRequest: (id, method, params) => {
        dispatch({ type: "serverRequest/received", request: normalizeServerRequest(id, method, params) });
      },
      onFatalError: (message) => {
        dispatch({ type: "fatal/error", message });
        scheduleRetry();
      }
    });
    return clientRef.current;
  }, [dispatch, hostBridge, scheduleRetry]);

  const bootstrap = useCallback(
    async (forceRestart: boolean) => {
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
    },
    [clearRetry, client, dispatch, scheduleRetry]
  );

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

  const runBusy = useCallback(
    async <T,>(runner: () => Promise<T>): Promise<T> => {
      dispatch({ type: "bootstrapBusy/changed", busy: true });
      try {
        return await runner();
      } finally {
        dispatch({ type: "bootstrapBusy/changed", busy: false });
      }
    },
    [dispatch]
  );

  const login = useCallback(async () => {
    await runBusy(async () => {
      await client.request("account/login/start", { type: "chatgpt" });
    });
  }, [client, runBusy]);

  const refreshConfig = useCallback(() => readConfigSnapshot(client, dispatch), [client, dispatch]);
  const refreshMcp = useCallback(() => refreshMcpData(client, dispatch), [client, dispatch]);
  const listStatuses = useCallback(() => listAllMcpServerStatuses(client), [client]);

  const writeConfigValue = useCallback(
    (params: ConfigValueWriteParams) => runBusy(() => writeConfigValueAndRefresh(client, dispatch, params)),
    [client, dispatch, runBusy]
  );

  const batchWriteConfig = useCallback(
    (params: ConfigBatchWriteParams) => runBusy(() => batchWriteConfigAndRefresh(client, dispatch, params)),
    [client, dispatch, runBusy]
  );

  const resolveServerRequest = useCallback(
    async (resolution: ServerRequestResolution) => {
      await client.resolveServerRequest(resolution.requestId, createServerRequestPayload(resolution));
      dispatch({ type: "serverRequest/resolved", requestId: resolution.requestId });
    },
    [client, dispatch]
  );

  return {
    state,
    setInput: (text) => dispatch({ type: "input/changed", value: text }),
    retryConnection: () => bootstrap(true),
    refreshConfigSnapshot: refreshConfig,
    refreshMcpData: refreshMcp,
    listMcpServerStatuses: listStatuses,
    writeConfigValue,
    batchWriteConfig,
    login,
    resolveServerRequest,
    selectThread: (threadId) => dispatch({ type: "thread/selected", threadId })
  };
}
