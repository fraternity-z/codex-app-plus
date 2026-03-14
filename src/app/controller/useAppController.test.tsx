import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import type { ConversationState } from "../../domain/conversation";
import type { RequestId } from "../../protocol/generated/RequestId";
import { AppStoreProvider, useAppDispatch, useAppSelector } from "../../state/store";

const DEFAULT_AGENT_ENVIRONMENT = "windowsNative" as const;

const protocolState = vi.hoisted(() => ({
  handlers: null as null | {
    onConnectionChanged: (status: "disconnected" | "connecting" | "connected" | "error") => void;
    onNotification: (method: string, params: unknown) => void;
    onServerRequest: (id: RequestId, method: string, params: unknown) => void;
    onFatalError: (message: string) => void;
  },
  request: vi.fn(),
  startAppServer: vi.fn().mockResolvedValue(undefined),
  restartAppServer: vi.fn().mockResolvedValue(undefined),
  stopAppServer: vi.fn().mockResolvedValue(undefined),
  initializeConnection: vi.fn().mockResolvedValue(undefined),
  resolveServerRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../protocol/client", () => ({
  ProtocolClient: class {
    constructor(_hostBridge: HostBridge, handlers: (typeof protocolState)["handlers"]) {
      protocolState.handlers = handlers;
    }

    attach(): Promise<void> {
      return Promise.resolve();
    }

    detach(): void {}

    startAppServer(input?: unknown): Promise<void> {
      return protocolState.startAppServer(input);
    }

    restartAppServer(input?: unknown): Promise<void> {
      return protocolState.restartAppServer(input);
    }

    stopAppServer(): Promise<void> {
      return protocolState.stopAppServer();
    }

    initializeConnection(): Promise<void> {
      return protocolState.initializeConnection();
    }

    request(method: string, params: unknown): Promise<unknown> {
      return protocolState.request(method, params);
    }

    resolveServerRequest(requestId: RequestId, result: unknown): Promise<void> {
      return protocolState.resolveServerRequest(requestId, result);
    }
  },
}));

vi.mock("../../features/settings/config/configOperations", () => ({
  batchWriteConfigAndReadSnapshot: vi.fn(),
  batchWriteConfigAndRefresh: vi.fn(),
  listAllExperimentalFeatures: vi.fn().mockResolvedValue([]),
  listAllMcpServerStatuses: vi.fn().mockResolvedValue([]),
  readConfigSnapshot: vi.fn(),
  refreshMcpData: vi.fn(),
  writeConfigValueAndRefresh: vi.fn(),
}));

vi.mock("../../features/workspace/model/threadCatalog", () => ({
  loadThreadCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../features/settings/sandbox/windowsSandboxSetup", () => ({
  refreshConfigAfterWindowsSandboxSetup: vi.fn().mockResolvedValue(undefined),
  startWindowsSandboxSetupRequest: vi.fn(),
}));

import {
  loginWithStoredTokens,
  logoutWithLocalCleanup,
  openChatgptLogin,
  useAppController,
} from "./useAppController";

function createHostBridge(overrides?: Partial<HostBridge["app"]>): HostBridge {
  return {
    app: {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openWorkspace: vi.fn().mockResolvedValue(undefined),
      openCodexConfigToml: vi.fn().mockResolvedValue(undefined),
      readGlobalAgentInstructions: vi.fn(),
      writeGlobalAgentInstructions: vi.fn(),
      listCodexProviders: vi.fn(),
      upsertCodexProvider: vi.fn(),
      deleteCodexProvider: vi.fn(),
      applyCodexProvider: vi.fn(),
      readChatgptAuthTokens: vi.fn().mockResolvedValue({
        accessToken: "token-123",
        chatgptAccountId: "account-123",
        chatgptPlanType: "plus",
        source: "cache",
      }),
      writeChatgptAuthTokens: vi.fn().mockImplementation(async (value) => value),
      clearChatgptAuthState: vi.fn().mockResolvedValue(undefined),
      showNotification: vi.fn().mockResolvedValue(undefined),
      showContextMenu: vi.fn().mockResolvedValue(undefined),
      importOfficialData: vi.fn().mockResolvedValue(undefined),
      listCodexSessions: vi.fn().mockResolvedValue([]),
      readCodexSession: vi.fn(),
      deleteCodexSession: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
    appServer: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
    },
    rpc: {
      request: vi.fn(),
      notify: vi.fn(),
      cancel: vi.fn(),
    },
    serverRequest: {
      resolve: vi.fn().mockResolvedValue(undefined),
    },
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    git: {} as HostBridge["git"],
    terminal: {} as HostBridge["terminal"],
  } as unknown as HostBridge;
}

function createRequestStub() {
  return vi.fn(async (method: string) => {
    switch (method) {
      case "account/login/start":
        return { type: "chatgptAuthTokens" };
      case "account/logout":
        return {};
      case "getAuthStatus":
        return { requiresOpenaiAuth: false, authMethod: "chatgpt" };
      case "account/read":
        return { account: { type: "chatgpt", email: "user@example.com", planType: "plus" }, requiresOpenaiAuth: false };
      case "account/rateLimits/read":
        return { rateLimits: null };
      case "config/read":
        return { config: {}, version: 1, layers: [] };
      case "collaborationMode/list":
        return { data: [] };
      default:
        return {};
    }
  });
}

function wrapper(props: PropsWithChildren): JSX.Element {
  return <AppStoreProvider>{props.children}</AppStoreProvider>;
}

function createConversation(id = "thread-1"): ConversationState {
  return {
    id,
    title: id,
    branch: null,
    cwd: "E:/code/codex-app-plus",
    updatedAt: "2026-03-14T00:00:00.000Z",
    source: "rpc",
    agentEnvironment: DEFAULT_AGENT_ENVIRONMENT,
    status: "idle",
    activeFlags: [],
    resumeState: "resumed",
    turns: [],
    queuedFollowUps: [],
    interruptRequestedTurnId: null,
    hidden: false,
  };
}

function useControllerHarness(hostBridge: HostBridge) {
  const controller = useAppController(hostBridge, DEFAULT_AGENT_ENVIRONMENT);
  const banners = useAppSelector((state) => state.banners);
  const initialized = useAppSelector((state) => state.initialized);
  const pendingRequestsById = useAppSelector((state) => state.pendingRequestsById);
  const tokenRefresh = useAppSelector((state) => state.tokenRefresh);
  const dispatch = useAppDispatch();
  return { banners, controller, dispatch, initialized, pendingRequestsById, tokenRefresh };
}

describe("useAppController auth helpers", () => {
  beforeEach(() => {
    protocolState.handlers = null;
    protocolState.request = createRequestStub();
    protocolState.startAppServer.mockClear();
    protocolState.restartAppServer.mockClear();
    protocolState.initializeConnection.mockClear();
    protocolState.resolveServerRequest.mockClear();
  });

  it("logs in with stored ChatGPT tokens when available", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "chatgptAuthTokens" }) };
    const hostBridge = createHostBridge();

    const success = await loginWithStoredTokens(client as never, hostBridge as never);

    expect(success).toBe(true);
    expect(hostBridge.app.readChatgptAuthTokens).toHaveBeenCalledTimes(1);
    expect(hostBridge.app.writeChatgptAuthTokens).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith("account/login/start", expect.objectContaining({ type: "chatgptAuthTokens" }));
  });

  it("opens the browser for ChatGPT OAuth when required", async () => {
    const dispatch = vi.fn();
    const client = { request: vi.fn().mockResolvedValue({ type: "chatgpt", loginId: "login-1", authUrl: "https://example.com/auth" }) };
    const hostBridge = createHostBridge();

    const openedBrowser = await openChatgptLogin(client as never, hostBridge as never, dispatch);

    expect(openedBrowser).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ type: "authLogin/started", loginId: "login-1", authUrl: "https://example.com/auth" });
    expect(hostBridge.app.openExternal).toHaveBeenCalledWith("https://example.com/auth");
  });

  it("cleans local auth state during logout", async () => {
    const dispatch = vi.fn();
    const client = { request: createRequestStub() };
    const hostBridge = createHostBridge();

    await logoutWithLocalCleanup(client as never, hostBridge as never, dispatch);

    expect(client.request).toHaveBeenCalledWith("account/logout", undefined);
    expect(hostBridge.app.clearChatgptAuthState).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "auth/changed", status: "authenticated", mode: "chatgpt" });
  });

  it("refreshes account state after account/login/completed succeeds", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    protocolState.request.mockClear();

    protocolState.handlers?.onNotification("account/login/completed", { loginId: "login-1", success: true, error: null });

    await waitFor(() => {
      expect(protocolState.request).toHaveBeenCalledWith("getAuthStatus", { includeToken: false, refreshToken: false });
      expect(protocolState.request).toHaveBeenCalledWith("account/read", { refreshToken: false });
      expect(protocolState.request).toHaveBeenCalledWith("account/rateLimits/read", undefined);
    });
  });

  it("starts app-server with the selected agent environment", async () => {
    const hostBridge = createHostBridge();

    renderHook(() => useAppController(hostBridge, "wsl"), { wrapper });

    await waitFor(() => {
      expect(protocolState.startAppServer).toHaveBeenCalledWith({ agentEnvironment: "wsl" });
    });
  });
});

describe("useAppController server request lifecycle", () => {
  beforeEach(() => {
    protocolState.handlers = null;
    protocolState.request = createRequestStub();
    protocolState.resolveServerRequest.mockReset();
    protocolState.resolveServerRequest.mockResolvedValue(undefined);
  });

  it("keeps pending requests until server confirmation and preserves numeric rpc ids", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    protocolState.request.mockClear();

    act(() => {
      protocolState.handlers?.onServerRequest(1, "item/tool/requestUserInput", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [{ id: "scope", header: "Scope", question: "Pick scope", isOther: false, isSecret: false, options: [] }],
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["1"]).toBeDefined();
      expect(protocolState.request).toHaveBeenCalledWith("thread/increment_elicitation", { threadId: "thread-1" });
    });

    await act(async () => {
      await result.current.controller.resolveServerRequest({ kind: "userInput", requestId: "1", answers: { scope: ["main"] } });
    });

    expect(protocolState.resolveServerRequest).toHaveBeenCalledWith(1, {
      answers: {
        scope: { answers: ["main"] },
      },
    });
    expect(result.current.pendingRequestsById["1"]).toBeDefined();

    act(() => {
      protocolState.handlers?.onNotification("serverRequest/resolved", { threadId: "thread-1", requestId: 1 });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["1"]).toBeUndefined();
      expect(protocolState.request).toHaveBeenCalledWith("thread/decrement_elicitation", { threadId: "thread-1" });
    });
  });

  it("keeps pending requests and reports an error when resolve fails", async () => {
    protocolState.resolveServerRequest.mockRejectedValueOnce(new Error("boom"));
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      protocolState.handlers?.onServerRequest(1, "item/tool/requestUserInput", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [],
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["1"]).toBeDefined();
    });

    await act(async () => {
      await result.current.controller.resolveServerRequest({ kind: "userInput", requestId: "1", answers: {} });
    });

    expect(result.current.pendingRequestsById["1"]).toBeDefined();
    expect(result.current.banners[0]).toEqual(expect.objectContaining({
      title: "Failed to submit request response",
      detail: "boom",
    }));
  });

  it("clears stale pending requests and token refresh state after disconnect", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      protocolState.handlers?.onServerRequest("7", "account/chatgptAuthTokens/refresh", {
        reason: "unauthorized",
        previousAccountId: "account-123",
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["7"]).toBeDefined();
      expect(result.current.tokenRefresh).toEqual({
        requestId: "7",
        previousAccountId: "account-123",
        pending: true,
        error: null,
      });
    });

    act(() => {
      protocolState.handlers?.onConnectionChanged("disconnected");
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["7"]).toBeUndefined();
      expect(result.current.tokenRefresh).toEqual({
        requestId: null,
        previousAccountId: null,
        pending: false,
        error: null,
      });
    });
  });

  it("does not rerender for conversation streaming updates outside the controller runtime slice", async () => {
    const hostBridge = createHostBridge();
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useControllerHarness(hostBridge);
    }, { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    const stableRenderCount = renderCount;

    act(() => {
      result.current.dispatch({ type: "conversation/upserted", conversation: createConversation() });
    });
    expect(renderCount).toBe(stableRenderCount);

    act(() => {
      result.current.dispatch({
        type: "conversation/textDeltasFlushed",
        entries: [{
          conversationId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          target: { type: "agentMessage" },
          delta: "delta",
        }],
      });
    });

    expect(renderCount).toBe(stableRenderCount);
  });
});
