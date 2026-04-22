import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import type { RequestId } from "../../protocol/generated/RequestId";
import { AppStoreProvider, useAppSelector } from "../../state/store";

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
  initializeConnection: vi.fn().mockResolvedValue(undefined),
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

    initializeConnection(): Promise<void> {
      return protocolState.initializeConnection();
    }

    request(method: string, params: unknown): Promise<unknown> {
      return protocolState.request(method, params);
    }
  },
}));

vi.mock("../../features/settings/config/configOperations", () => ({
  listAllExperimentalFeatures: vi.fn().mockResolvedValue([]),
  listAllMcpServerStatuses: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../features/workspace/model/threadCatalog", () => ({
  loadThreadCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../features/settings/sandbox/windowsSandboxSetup", () => ({
  refreshConfigAfterWindowsSandboxSetup: vi.fn().mockResolvedValue(undefined),
  startWindowsSandboxSetupRequest: vi.fn().mockResolvedValue({ started: true }),
}));

import { useAppController } from "./useAppController";

function createHostBridge(): HostBridge {
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
      readGlobalAgentInstructions: vi.fn(),
      writeGlobalAgentInstructions: vi.fn(),
      listCodexProviders: vi.fn(),
      upsertCodexProvider: vi.fn(),
      deleteCodexProvider: vi.fn(),
      applyCodexProvider: vi.fn(),
      getCodexAuthModeState: vi.fn(),
      activateCodexChatgpt: vi.fn(),
      captureCodexOauthSnapshot: vi.fn().mockResolvedValue({
        activeMode: "chatgpt",
        activeProviderId: null,
        activeProviderKey: null,
        oauthSnapshotAvailable: true,
      }),
      readChatgptAuthTokens: vi.fn(),
      writeChatgptAuthTokens: vi.fn(),
      clearChatgptAuthState: vi.fn(),
      showNotification: vi.fn().mockResolvedValue(undefined),
      showContextMenu: vi.fn().mockResolvedValue(undefined),
      importOfficialData: vi.fn().mockResolvedValue(undefined),
      listCodexSessions: vi.fn().mockResolvedValue([]),
      readCodexSession: vi.fn(),
      deleteCodexSession: vi.fn().mockResolvedValue(undefined),
    },
    appServer: {
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
    },
    rpc: {
      request: vi.fn(),
      notify: vi.fn(),
      cancel: vi.fn(),
    },
    serverRequest: {
      resolve: vi.fn(),
    },
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    git: {} as HostBridge["git"],
    terminal: {} as HostBridge["terminal"],
  } as unknown as HostBridge;
}

function createRequestStub() {
  return vi.fn(async (method: string) => {
    switch (method) {
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

function useControllerHarness(hostBridge: HostBridge) {
  const controller = useAppController(hostBridge, DEFAULT_AGENT_ENVIRONMENT);
  const initialized = useAppSelector((state) => state.initialized);
  return { controller, initialized };
}

describe("useAppController retry gating", () => {
  beforeEach(() => {
    vi.useRealTimers();
    protocolState.handlers = null;
    protocolState.request = createRequestStub();
    protocolState.startAppServer.mockClear();
    protocolState.restartAppServer.mockClear();
    protocolState.initializeConnection.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries only after fatal errors", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() => useControllerHarness(hostBridge), { wrapper });

    await waitFor(() => {
      expect(result.current.initialized).toBe(true);
    });

    vi.useFakeTimers();
    protocolState.restartAppServer.mockClear();

    act(() => {
      protocolState.handlers?.onConnectionChanged("error");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(protocolState.restartAppServer).not.toHaveBeenCalled();

    act(() => {
      protocolState.handlers?.onFatalError("boom");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(protocolState.restartAppServer).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(protocolState.restartAppServer).toHaveBeenCalledTimes(1);
  }, 10_000);
});
