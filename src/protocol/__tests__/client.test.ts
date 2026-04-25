import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import { ProtocolClient } from "../client";

function createDeferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function createHostBridge(): HostBridge {
  return {
    appServer: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined)
    },
    rpc: {
      request: vi.fn().mockResolvedValue({ requestId: "1", result: {} }),
      notify: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined)
    },
    serverRequest: {
      resolve: vi.fn().mockResolvedValue(undefined)
    },
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
      listCustomPrompts: vi.fn().mockResolvedValue([]),
      listManagedPrompts: vi.fn().mockResolvedValue([]),
      upsertManagedPrompt: vi.fn().mockResolvedValue({
        name: "system-prompt",
        path: "~/.codex/prompts/codex-app-plus/system-prompt.md",
        content: "",
      }),
      deleteManagedPrompt: vi.fn().mockResolvedValue(undefined),
      setUserModelInstructionsFile: vi.fn().mockResolvedValue(undefined),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue({
        path: "C:/Users/Administrator/.codex/AGENTS.md",
        content: ""
      }),
      getAgentsSettings: vi.fn().mockResolvedValue({
        configPath: "C:/Users/Administrator/.codex/config.toml",
        multiAgentEnabled: false,
        maxThreads: 6,
        maxDepth: 1,
        agents: [],
      }),
      setAgentsCore: vi.fn().mockResolvedValue({
        configPath: "C:/Users/Administrator/.codex/config.toml",
        multiAgentEnabled: false,
        maxThreads: 6,
        maxDepth: 1,
        agents: [],
      }),
      createAgent: vi.fn().mockResolvedValue({
        configPath: "C:/Users/Administrator/.codex/config.toml",
        multiAgentEnabled: false,
        maxThreads: 6,
        maxDepth: 1,
        agents: [],
      }),
      updateAgent: vi.fn().mockResolvedValue({
        configPath: "C:/Users/Administrator/.codex/config.toml",
        multiAgentEnabled: false,
        maxThreads: 6,
        maxDepth: 1,
        agents: [],
      }),
      deleteAgent: vi.fn().mockResolvedValue({
        configPath: "C:/Users/Administrator/.codex/config.toml",
        multiAgentEnabled: false,
        maxThreads: 6,
        maxDepth: 1,
        agents: [],
      }),
      readAgentConfig: vi.fn().mockResolvedValue({ content: "" }),
      writeAgentConfig: vi.fn().mockResolvedValue({ content: "" }),
      readProxySettings: vi.fn().mockResolvedValue({
        settings: {
          mode: "disabled",
          httpProxy: "",
          httpsProxy: "",
          noProxy: ""
        }
      }),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue({
        path: "C:/Users/Administrator/.codex/AGENTS.md",
        content: ""
      }),
      writeProxySettings: vi.fn().mockResolvedValue({
        settings: {
          mode: "disabled",
          httpProxy: "",
          httpsProxy: "",
          noProxy: ""
        }
      }),
      getCodexAuthModeState: vi.fn().mockResolvedValue({
        activeMode: "chatgpt",
        activeProviderId: null,
        activeProviderKey: null,
        oauthSnapshotAvailable: false
      }),
      activateCodexChatgpt: vi.fn().mockResolvedValue({
        mode: "chatgpt",
        providerId: null,
        providerKey: null,
        authPath: "C:/Users/Administrator/.codex/auth.json",
        configPath: "C:/Users/Administrator/.codex/config.toml",
        restoredFromSnapshot: false
      }),
      captureCodexOauthSnapshot: vi.fn().mockResolvedValue({
        activeMode: "chatgpt",
        activeProviderId: null,
        activeProviderKey: null,
        oauthSnapshotAvailable: true
      }),
      readChatgptAuthTokens: vi.fn().mockResolvedValue({
        accessToken: "token",
        chatgptAccountId: "account",
        chatgptPlanType: "plus",
        source: "cache"
      }),
      writeChatgptAuthTokens: vi.fn().mockResolvedValue({
        accessToken: "token",
        chatgptAccountId: "account",
        chatgptPlanType: "plus",
        source: "cache"
      }),
      clearChatgptAuthState: vi.fn().mockResolvedValue(undefined),
      showNotification: vi.fn().mockResolvedValue(undefined),
      showContextMenu: vi.fn().mockResolvedValue(undefined),
      importOfficialData: vi.fn().mockResolvedValue(undefined),
      listCodexSessions: vi.fn().mockResolvedValue([]),
      readCodexSession: vi.fn().mockResolvedValue({ threadId: "1", messages: [] }),
      searchCodexSessions: vi.fn().mockResolvedValue([]),
      deleteCodexSession: vi.fn().mockResolvedValue(undefined),
      rememberCommandApprovalRule: vi.fn().mockResolvedValue({
        rulesPath: "C:/Users/Administrator/.codex/rules/default.rules"
      })
    },
    git: {
      getStatusSnapshot: vi.fn(),
      getBranchRefs: vi.fn(),
      getRemoteUrl: vi.fn(),
      getDiff: vi.fn(),
      getWorkspaceDiffs: vi.fn(),
      getWorktrees: vi.fn(),
      addWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      initRepository: vi.fn(),
      stagePaths: vi.fn(),
      unstagePaths: vi.fn(),
      discardPaths: vi.fn(),
      commit: vi.fn(),
      generateCommitMessage: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      checkout: vi.fn(),
      deleteBranch: vi.fn()
    },
    terminal: {
      createSession: vi.fn().mockResolvedValue({ sessionId: "1", shell: "pwsh" }),
      write: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn().mockResolvedValue(undefined)
    },
    subscribe: vi.fn().mockResolvedValue(() => undefined)
  };
}

describe("ProtocolClient", () => {
  it("sends initialize then initialized notification", async () => {
    const hostBridge = createHostBridge();
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification: vi.fn(),
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    await client.initializeConnection({
      clientInfo: { name: "test", title: "Test", version: "1.0.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: null }
    });

    expect(hostBridge.rpc.request).toHaveBeenCalledWith({
      method: "initialize",
      params: {
        clientInfo: { name: "test", title: "Test", version: "1.0.0" },
        capabilities: { experimentalApi: true, optOutNotificationMethods: null }
      }
    });
    expect(hostBridge.rpc.notify).toHaveBeenCalledWith({ method: "initialized", params: {} });
  });

  it("rejects business requests before initialization", async () => {
    const hostBridge = createHostBridge();
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification: vi.fn(),
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    await expect(client.request("thread/list", { archived: false })).rejects.toThrow(/握手/);
  });

  it("normalizes empty request params to null", async () => {
    const hostBridge = createHostBridge();
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification: vi.fn(),
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    await client.initializeConnection({
      clientInfo: { name: "test", title: "Test", version: "1.0.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: null }
    });
    await client.request("config/mcpServer/reload", undefined);

    expect(hostBridge.rpc.request).toHaveBeenNthCalledWith(2, {
      method: "config/mcpServer/reload",
      params: null
    });
  });

  it("provides typed helpers for thread cleanup requests", async () => {
    const hostBridge = createHostBridge();
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification: vi.fn(),
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    await client.initializeConnection({
      clientInfo: { name: "test", title: "Test", version: "1.0.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: null }
    });
    await client.cleanThreadBackgroundTerminals("thread-1");
    await client.unsubscribeThread("thread-1");

    expect(hostBridge.rpc.request).toHaveBeenNthCalledWith(2, {
      method: "thread/backgroundTerminals/clean",
      params: { threadId: "thread-1" }
    });
    expect(hostBridge.rpc.request).toHaveBeenNthCalledWith(3, {
      method: "thread/unsubscribe",
      params: { threadId: "thread-1" }
    });
  });

  it("cleans up late subscriptions when detach happens during attach", async () => {
    const hostBridge = createHostBridge();
    const connectionDeferred = createDeferred<() => void>();
    const notificationDeferred = createDeferred<() => void>();
    const secondSubscribeDeferred = createDeferred<void>();
    const unlistenConnection = vi.fn();
    const unlistenNotification = vi.fn();
    vi.mocked(hostBridge.subscribe)
      .mockImplementationOnce(() => connectionDeferred.promise)
      .mockImplementationOnce(() => {
        secondSubscribeDeferred.resolve();
        return notificationDeferred.promise;
      })
      .mockResolvedValue(() => undefined);
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification: vi.fn(),
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    const attachPromise = client.attach();
    connectionDeferred.resolve(unlistenConnection);
    await secondSubscribeDeferred.promise;
    expect(hostBridge.subscribe).toHaveBeenCalledTimes(2);

    client.detach();
    expect(unlistenConnection).toHaveBeenCalledTimes(1);

    notificationDeferred.resolve(unlistenNotification);
    await attachPromise;

    expect(unlistenNotification).toHaveBeenCalledTimes(1);
    expect(hostBridge.subscribe).toHaveBeenCalledTimes(2);
  });

  it("keeps a single active listener across detach and reattach", async () => {
    const hostBridge = createHostBridge();
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const onNotification = vi.fn();
    vi.mocked(hostBridge.subscribe).mockImplementation(async (eventName, handler) => {
      const nextListeners = listeners.get(eventName) ?? new Set<(payload: unknown) => void>();
      const listener = handler as (payload: unknown) => void;
      nextListeners.add(listener);
      listeners.set(eventName, nextListeners);
      return () => {
        nextListeners.delete(listener);
        if (nextListeners.size === 0) {
          listeners.delete(eventName);
        }
      };
    });
    const client = new ProtocolClient(hostBridge, {
      onConnectionChanged: vi.fn(),
      onNotification,
      onServerRequest: vi.fn(),
      onFatalError: vi.fn()
    });

    await client.attach();
    client.detach();
    await client.attach();

    expect(listeners.get("notification-received")?.size).toBe(1);
    listeners.get("notification-received")?.forEach((listener) => {
      listener({
        method: "item/agentMessage/delta",
        params: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1", delta: "hello" }
      });
    });

    expect(onNotification).toHaveBeenCalledTimes(1);
  });
});
