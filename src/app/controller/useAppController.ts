import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentEnvironment, HostBridge } from "../../bridge/types";
import { applyAppServerNotification } from "./appControllerNotifications";
import { FrameTextDeltaQueue } from "../../features/conversation/model/frameTextDeltaQueue";
import { OutputDeltaQueue } from "../../features/conversation/model/outputDeltaQueue";
import { normalizeServerRequest } from "./serverRequests";
import { ProtocolClient } from "../../protocol/client";
import { useAppDispatch } from "../../state/store";
import { useAppControllerRuntimeState } from "./appControllerState";
import { useAppUpdater } from "./useAppUpdater";
import type { CommandApprovalAllowlist } from "../../features/shared/utils/commandApprovalRules";
import {
  createAppServerStartInput,
  loadConversationCatalog,
  loadBootstrapSnapshot,
  startOrReuseAppServer,
} from "./appControllerBootstrap";
import { openChatgptLogin, refreshAccountState } from "./appControllerAccount";
import { tryAutoApproveCommandRequest } from "./commandApprovalController";
import {
  createInitializeParams,
  RETRY_DELAY_MS,
  toErrorMessage,
  type AppController,
} from "./appControllerTypes";
import { useAppControllerActions } from "./useAppControllerActions";
import { useServerRequestTracker } from "./useServerRequestTracker";
import { useWindowsSandboxSetup } from "./useWindowsSandboxSetup";

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
  const retryHandlerRef = useRef<() => void>(() => undefined);
  const textDeltaQueueRef = useRef<FrameTextDeltaQueue | null>(null);
  const outputDeltaQueueRef = useRef<OutputDeltaQueue | null>(null);
  const pendingRequestsRef = useRef(runtimeState.pendingRequestsById);
  const previousAgentEnvironmentRef = useRef(agentEnvironment);
  const agentEnvironmentRef = useRef(agentEnvironment);
  const sessionIndexReloadInFlightRef = useRef(false);
  const approvalAllowlistRef = useRef<CommandApprovalAllowlist>({});

  const requestTracker = useServerRequestTracker(clientRef, dispatch);

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
    requestTracker.clearOnDisconnect();
  }, [runtimeState.connectionStatus, requestTracker]);

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
          requestTracker.settleThreadRequest(String((params as { requestId: string | number }).requestId));
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
        if (request.kind === "commandApproval" && clientRef.current !== null) {
          void tryAutoApproveCommandRequest({
            agentEnvironment: agentEnvironmentRef.current,
            allowlistRef: approvalAllowlistRef,
            client: clientRef.current,
            dispatch,
            request,
          }).then((handled) => {
            if (handled) {
              return;
            }
            dispatch({ type: "serverRequest/received", request });
            requestTracker.trackThreadRequest(request);
          });
          return;
        }
        dispatch({ type: "serverRequest/received", request });
        requestTracker.trackThreadRequest(request);
      },
      onFatalError: (message) => {
        dispatch({ type: "fatal/error", message });
        scheduleRetry();
      },
    });
    return clientRef.current;
  }, [dispatch, hostBridge, requestTracker, scheduleRetry]);

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
    allowlistRef: approvalAllowlistRef,
    bootstrap,
    client,
    dispatch,
    hostBridge,
    pendingRequestsRef,
    selectedConversationId: runtimeState.selectedConversationId,
    configSnapshot: runtimeState.configSnapshot,
  });

  useWindowsSandboxSetup(
    client,
    dispatch,
    agentEnvironment,
    runtimeState.configSnapshot,
    runtimeState.windowsSandboxSetup,
  );

  return {
    setInput: (text) => dispatch({ type: "input/changed", value: text }),
    retryConnection: () => bootstrap(true),
    checkForAppUpdate: appUpdater.checkForAppUpdate,
    installAppUpdate: appUpdater.installAppUpdate,
    ...controllerActions,
  };
}
