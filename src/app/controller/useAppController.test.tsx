import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import type { ConversationState } from "../../domain/conversation";
import type { RequestId } from "../../protocol/generated/RequestId";
import { AppStoreProvider, useAppDispatch, useAppSelector } from "../../state/store";
import { loadThreadCatalog } from "../../features/workspace/model/threadCatalog";
import { startWindowsSandboxSetupRequest } from "../../features/settings/sandbox/windowsSandboxSetup";

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
  ensureChatgptModeForLogin,
  isChatgptLoginDisabledError,
  loginWithStoredTokens,
  logoutWithLocalCleanup,
  openChatgptLogin,
  useAppController,
} from "./useAppController";

function createHostBridge(overrides?: Partial<HostBridge["app"]>): HostBridge {
  return {
    app: {
      setWindowTheme: vi.fn().mockResolvedValue(undefined),
      startWindowDragging: vi.fn().mockResolvedValue(undefined),
      controlWindow: vi.fn().mockResolvedValue(undefined),
      openExternal: vi.fn().mockResolvedValue(undefined),
      openWorkspace: vi.fn().mockResolvedValue(undefined),
      openFileInEditor: vi.fn().mockResolvedValue(undefined),
      openCodexConfigToml: vi.fn().mockResolvedValue(undefined),
      revealPathInFolder: vi.fn().mockResolvedValue(undefined),
      readWorkspaceState: vi.fn().mockResolvedValue(null),
      writeWorkspaceState: vi.fn().mockResolvedValue(undefined),
      readGlobalAgentInstructions: vi.fn(),
      writeGlobalAgentInstructions: vi.fn(),
      listCodexProviders: vi.fn(),
      upsertCodexProvider: vi.fn(),
      deleteCodexProvider: vi.fn(),
      applyCodexProvider: vi.fn(),
      getCodexAuthModeState: vi.fn().mockResolvedValue({
        activeMode: "chatgpt",
        activeProviderId: null,
        activeProviderKey: null,
        oauthSnapshotAvailable: true,
      }),
      activateCodexChatgpt: vi.fn().mockResolvedValue({
        mode: "chatgpt",
        providerId: null,
        providerKey: null,
        authPath: "C:/Users/Administrator/.codex/auth.json",
        configPath: "C:/Users/Administrator/.codex/config.toml",
        restoredFromSnapshot: true,
      }),
      captureCodexOauthSnapshot: vi.fn().mockResolvedValue({
        activeMode: "chatgpt",
        activeProviderId: null,
        activeProviderKey: null,
        oauthSnapshotAvailable: true,
      }),
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
      searchCodexSessions: vi.fn().mockResolvedValue([]),
      deleteCodexSession: vi.fn().mockResolvedValue(undefined),
      rememberCommandApprovalRule: vi.fn().mockResolvedValue({
        rulesPath: "C:/Users/Administrator/.codex/rules/default.rules",
      }),
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
      case "config/value/write":
        return { ok: true };
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

function useControllerHarness(
  hostBridge: HostBridge,
  agentEnvironment: "windowsNative" | "wsl" = DEFAULT_AGENT_ENVIRONMENT,
) {
  const controller = useAppController(hostBridge, agentEnvironment);
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
    vi.mocked(startWindowsSandboxSetupRequest).mockReset();
    vi.mocked(startWindowsSandboxSetupRequest).mockResolvedValue({ started: true });
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

  it("switches back to ChatGPT mode before login when API key mode is active", async () => {
    const client = { request: vi.fn().mockResolvedValue({ ok: true }) };
    const hostBridge = createHostBridge({
      getCodexAuthModeState: vi.fn().mockResolvedValue({
        activeMode: "apikey",
        activeProviderId: "provider-1",
        activeProviderKey: "right_code",
        oauthSnapshotAvailable: false,
      }),
    });

    await ensureChatgptModeForLogin(
      client as never,
      hostBridge as never,
      DEFAULT_AGENT_ENVIRONMENT,
    );

    expect(hostBridge.app.activateCodexChatgpt).toHaveBeenCalledWith({
      agentEnvironment: DEFAULT_AGENT_ENVIRONMENT,
    });
    expect(client.request).toHaveBeenCalledWith("config/read", { includeLayers: true });
    expect(client.request).toHaveBeenCalledWith(
      "config/value/write",
      expect.objectContaining({
        keyPath: "forced_login_method",
        value: "chatgpt",
      }),
    );
  });

  it("does not switch mode again when ChatGPT mode is already active", async () => {
    const client = { request: vi.fn().mockResolvedValue({ ok: true }) };
    const hostBridge = createHostBridge();

    await ensureChatgptModeForLogin(
      client as never,
      hostBridge as never,
      DEFAULT_AGENT_ENVIRONMENT,
    );

    expect(hostBridge.app.activateCodexChatgpt).not.toHaveBeenCalled();
  });

  it("recognizes the protocol error for disabled ChatGPT login", () => {
    expect(
      isChatgptLoginDisabledError(
        new Error("协议错误: [-32600] ChatGPT login is disabled. Use API key login instead."),
      ),
    ).toBe(true);
    expect(isChatgptLoginDisabledError(new Error("boom"))).toBe(false);
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

  it("reloads the conversation catalog after the session index refresh event", async () => {
    type SessionIndexHandler = (payload: {
      readonly agentEnvironment: "windowsNative" | "wsl";
      readonly durationMs: number;
      readonly sessionCount: number;
    }) => void;
    const sessionIndexHandlers: Array<SessionIndexHandler> = [];
    const hostBridge = createHostBridge();
    vi.mocked(hostBridge.subscribe).mockImplementation(async (eventName, handler) => {
      if (eventName === "codex-session-index-updated") {
        sessionIndexHandlers.push(handler as SessionIndexHandler);
      }
      return () => undefined;
    });
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    vi.mocked(loadThreadCatalog).mockClear();

    const emitSessionIndexUpdate = sessionIndexHandlers[0];
    if (emitSessionIndexUpdate === undefined) {
      throw new Error("sessionIndexHandler 未注册");
    }
    emitSessionIndexUpdate({ agentEnvironment: "windowsNative", durationMs: 12, sessionCount: 3 });

    await waitFor(() => {
      expect(loadThreadCatalog).toHaveBeenCalledTimes(1);
    });
  });

  it("auto-starts Windows Sandbox setup after config enables it in the native environment", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      result.current.dispatch({
        type: "config/loaded",
        config: {
          config: { profile: null, windows: { sandbox: "unelevated" } },
          origins: {},
          layers: [],
        } as never,
      });
    });

    await waitFor(() => {
      expect(startWindowsSandboxSetupRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "unelevated",
      );
    });
  });

  it("waits to auto-start Windows Sandbox setup until switching back to Windows native", async () => {
    const hostBridge = createHostBridge();
    const initialProps: { readonly agentEnvironment: "windowsNative" | "wsl" } = {
      agentEnvironment: "wsl",
    };
    const { result, rerender } = renderHook(
      ({ agentEnvironment }: { readonly agentEnvironment: "windowsNative" | "wsl" }) => (
        useControllerHarness(hostBridge, agentEnvironment)
      ),
      {
        initialProps,
        wrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      result.current.dispatch({
        type: "config/loaded",
        config: {
          config: { profile: null, windows: { sandbox: "unelevated" } },
          origins: {},
          layers: [],
        } as never,
      });
    });

    expect(startWindowsSandboxSetupRequest).not.toHaveBeenCalled();

    rerender({ agentEnvironment: "windowsNative" });

    await waitFor(() => {
      expect(startWindowsSandboxSetupRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "unelevated",
      );
    });
  });

  it("controller login switches ChatGPT mode before opening OAuth login", async () => {
    const hostBridge = createHostBridge({
      getCodexAuthModeState: vi.fn().mockResolvedValue({
        activeMode: "apikey",
        activeProviderId: "provider-1",
        activeProviderKey: "right_code",
        oauthSnapshotAvailable: false,
      }),
      readChatgptAuthTokens: vi.fn().mockRejectedValue(new Error("missing tokens")),
    });
    protocolState.request = vi.fn(async (method: string) => {
      switch (method) {
        case "getAuthStatus":
          return { requiresOpenaiAuth: true, authMethod: null };
        case "account/read":
          return { account: null, requiresOpenaiAuth: true };
        case "account/rateLimits/read":
          return { rateLimits: null };
        case "config/read":
          return { config: {}, version: 1, layers: [] };
        case "config/value/write":
          return { ok: true };
        case "collaborationMode/list":
          return { data: [] };
        case "account/login/start":
          return {
            type: "chatgpt",
            loginId: "login-1",
            authUrl: "https://example.com/auth",
          };
        default:
          return {};
      }
    });
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    protocolState.request.mockClear();

    await act(async () => {
      await result.current.controller.login();
    });

    expect(hostBridge.app.activateCodexChatgpt).toHaveBeenCalledWith({
      agentEnvironment: DEFAULT_AGENT_ENVIRONMENT,
    });
    expect(protocolState.request).toHaveBeenCalledWith(
      "config/value/write",
      expect.objectContaining({ keyPath: "forced_login_method", value: "chatgpt" }),
    );
    expect(protocolState.request).toHaveBeenCalledWith("account/login/start", {
      type: "chatgpt",
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

  it("submits acceptForSession for file approvals", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    protocolState.request.mockClear();

    act(() => {
      protocolState.handlers?.onServerRequest("8", "item/fileChange/requestApproval", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        reason: "Review diff",
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["8"]).toBeDefined();
      expect(protocolState.request).toHaveBeenCalledWith("thread/increment_elicitation", { threadId: "thread-1" });
    });

    await act(async () => {
      await result.current.controller.resolveServerRequest({
        kind: "fileApproval",
        requestId: "8",
        decision: "acceptForSession",
      });
    });

    expect(protocolState.resolveServerRequest).toHaveBeenCalledWith("8", {
      decision: "acceptForSession",
    });
    expect(result.current.pendingRequestsById["8"]).toBeDefined();

    act(() => {
      protocolState.handlers?.onNotification("serverRequest/resolved", { threadId: "thread-1", requestId: "8" });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["8"]).toBeUndefined();
      expect(protocolState.request).toHaveBeenCalledWith("thread/decrement_elicitation", { threadId: "thread-1" });
    });
  });

  it("persists remember-command approvals before accepting the request", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });
    protocolState.request.mockClear();

    act(() => {
      protocolState.handlers?.onServerRequest("9", "item/commandExecution/requestApproval", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        command: "Get-Content src/state/appReducer.ts",
        availableDecisions: [{
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["allow read-only scans"],
          },
        }, "decline"],
        proposedExecpolicyAmendment: ["allow read-only scans"],
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["9"]).toBeDefined();
      expect(protocolState.request).toHaveBeenCalledWith("thread/increment_elicitation", { threadId: "thread-1" });
    });

    await act(async () => {
      await result.current.controller.resolveServerRequest({
        kind: "commandApproval",
        requestId: "9",
        decision: {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["allow read-only scans"],
          },
        },
      });
    });

    expect(hostBridge.app.rememberCommandApprovalRule).toHaveBeenCalledWith({
      agentEnvironment: DEFAULT_AGENT_ENVIRONMENT,
      command: ["allow read-only scans"],
    });
    expect(protocolState.resolveServerRequest).toHaveBeenCalledWith("9", {
      decision: "accept",
    });
  });

  it("auto-accepts later command approvals that match a remembered prefix", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    act(() => {
      protocolState.handlers?.onServerRequest("9", "item/commandExecution/requestApproval", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        command: "Get-ChildItem src",
        cwd: "E:/code/codex-app-plus",
        availableDecisions: [{
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["Get-ChildItem"],
          },
        }, "decline"],
        proposedExecpolicyAmendment: ["Get-ChildItem"],
      });
    });

    await waitFor(() => {
      expect(result.current.pendingRequestsById["9"]).toBeDefined();
    });

    await act(async () => {
      await result.current.controller.resolveServerRequest({
        kind: "commandApproval",
        requestId: "9",
        decision: {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["Get-ChildItem"],
          },
        },
      });
    });

    protocolState.resolveServerRequest.mockClear();

    act(() => {
      protocolState.handlers?.onServerRequest("10", "item/commandExecution/requestApproval", {
        threadId: "thread-1",
        turnId: "turn-2",
        itemId: "item-2",
        command: "Get-ChildItem src/features -Force",
        cwd: "E:/code/codex-app-plus",
        availableDecisions: ["accept", "decline"],
      });
    });

    await waitFor(() => {
      expect(protocolState.resolveServerRequest).toHaveBeenCalledWith("10", {
        decision: "accept",
      });
    });
    expect(result.current.pendingRequestsById["10"]).toBeUndefined();
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
