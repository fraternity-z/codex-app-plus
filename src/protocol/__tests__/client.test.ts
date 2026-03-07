import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";
import { ProtocolClient } from "../client";

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
      openExternal: vi.fn().mockResolvedValue(undefined),
      openWorkspace: vi.fn().mockResolvedValue(undefined),
      openCodexConfigToml: vi.fn().mockResolvedValue(undefined),
      readGlobalAgentInstructions: vi.fn().mockResolvedValue({
        path: "C:/Users/Administrator/.codex/AGENTS.md",
        content: ""
      }),
      writeGlobalAgentInstructions: vi.fn().mockResolvedValue({
        path: "C:/Users/Administrator/.codex/AGENTS.md",
        content: ""
      }),
      listCodexProviders: vi.fn().mockResolvedValue({ version: 1, providers: [] }),
      upsertCodexProvider: vi.fn().mockResolvedValue({
        id: "provider-1",
        name: "Right Code",
        providerKey: "right_code",
        apiKey: "secret-1",
        baseUrl: "https://right.codes/codex/v1",
        model: "gpt-5.4",
        authJsonText: "{}",
        configTomlText: "",
        createdAt: 1,
        updatedAt: 1
      }),
      deleteCodexProvider: vi.fn().mockResolvedValue({ version: 1, providers: [] }),
      applyCodexProvider: vi.fn().mockResolvedValue({
        providerId: "provider-1",
        providerKey: "right_code",
        authPath: "C:/Users/Administrator/.codex/auth.json",
        configPath: "C:/Users/Administrator/.codex/config.toml"
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
      showNotification: vi.fn().mockResolvedValue(undefined),
      showContextMenu: vi.fn().mockResolvedValue(undefined),
      importOfficialData: vi.fn().mockResolvedValue(undefined),
      listCodexSessions: vi.fn().mockResolvedValue([]),
      readCodexSession: vi.fn().mockResolvedValue({ threadId: "1", messages: [] })
    },
    git: {
      getStatus: vi.fn(),
      getDiff: vi.fn(),
      initRepository: vi.fn(),
      stagePaths: vi.fn(),
      unstagePaths: vi.fn(),
      discardPaths: vi.fn(),
      commit: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      checkout: vi.fn()
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
});
