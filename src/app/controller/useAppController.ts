import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentEnvironment, HostBridge } from "../../bridge/types";
import type { ReceivedServerRequest } from "../../domain/serverRequests";
import type { WindowsSandboxSetupCompletedNotification } from "../../protocol/generated/v2/WindowsSandboxSetupCompletedNotification";
import { applyAppServerNotification } from "./appControllerNotifications";
import { FrameTextDeltaQueue } from "../../features/conversation/model/frameTextDeltaQueue";
import { OutputDeltaQueue } from "../../features/conversation/model/outputDeltaQueue";
import { normalizeServerRequest } from "./serverRequests";
import { refreshConfigAfterWindowsSandboxSetup } from "../../features/settings/sandbox/windowsSandboxSetup";
import { ProtocolClient } from "../../protocol/client";
import { useAppDispatch } from "../../state/store";
import { useAppControllerRuntimeState } from "./appControllerState";
import { useAppUpdater } from "./useAppUpdater";
import {
  createAppServerStartInput,
  loadConversationCatalog,
  loadBootstrapSnapshot,
  startOrReuseAppServer,
} from "./appControllerBootstrap";
import { openChatgptLogin, refreshAccountState } from "./appControllerAccount";
import {
  decrementThreadElicitation,
  incrementThreadElicitation,
  reportServerRequestError,
} from "./appControllerServerRequests";
import {
  createInitializeParams,
  RETRY_DELAY_MS,
  toErrorMessage,
  type AppController,
  WINDOWS_SANDBOX_STATE_IDLE_RESET_MS,
} from "./appControllerTypes";
import { useAppControllerActions } from "./useAppControllerActions";

export {
  ensureChatgptModeForLogin,
  isChatgptLoginDisabledError,
  loginWithStoredTokens,
  logoutWithLocalCleanup,
  openChatgptLogin,
  refreshAccountState,
} from "./appControllerAccount";

export function useAppController(hostBridge: HostBridge, agentEnvironment: AgentEnvironment): AppController {
  const dispatch = useAppDispatch();
  const runtimeState = useAppControllerRuntimeState();
  const appUpdater = useAppUpdater();
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
  const sessionIndexReloadInFlightRef = useRef(false);

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
      reportServerRequestError(dispatch, { threadId, turnId }, "Failed to resume request timeout", error);
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
        reportServerRequestError(dispatch, request, "Failed to pause request timeout", error);
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
          void (async () => {
            try {
              await refreshAccountState(clientRef.current!, dispatch);
              await hostBridge.app.captureCodexOauthSnapshot({
                agentEnvironment: agentEnvironmentRef.current,
              });
            } catch (error) {
              console.error("同步 OAuth 快照失败", error);
            }
          })();
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

  const refreshConversationCatalog = useCallback(async () => {
    if (clientRef.current === null || sessionIndexReloadInFlightRef.current || bootingRef.current) {
      return;
    }
    sessionIndexReloadInFlightRef.current = true;
    try {
      await loadConversationCatalog(
        clientRef.current,
        hostBridge,
        dispatch,
        agentEnvironmentRef.current,
      );
    } catch (error) {
      console.error("刷新工作区会话目录失败", error);
    } finally {
      sessionIndexReloadInFlightRef.current = false;
    }
  }, [dispatch, hostBridge]);

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
    let disposed = false;
    let detach: (() => void) | null = null;
    void hostBridge.subscribe("codex-session-index-updated", (payload) => {
      if (payload.agentEnvironment !== agentEnvironmentRef.current) {
        return;
      }
      console.info("codex_session_index_updated", payload);
      void refreshConversationCatalog();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      detach = unlisten;
    }).catch((error) => {
      console.error("订阅 session 索引刷新事件失败", error);
    });
    return () => {
      disposed = true;
      detach?.();
    };
  }, [hostBridge, refreshConversationCatalog]);

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

  const controllerActions = useAppControllerActions({
    agentEnvironment,
    bootstrap,
    client,
    dispatch,
    hostBridge,
    pendingRequestsRef,
    selectedConversationId: runtimeState.selectedConversationId,
    configSnapshot: runtimeState.configSnapshot,
  });

  return {
    setInput: (text) => dispatch({ type: "input/changed", value: text }),
    retryConnection: () => bootstrap(true),
    checkForAppUpdate: appUpdater.checkForAppUpdate,
    installAppUpdate: appUpdater.installAppUpdate,
    ...controllerActions,
  };
}
