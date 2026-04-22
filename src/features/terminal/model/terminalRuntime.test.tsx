import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { act, renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { useTerminalOpenAction } from "./terminalRuntime";

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class FitAddon {
    fit(): void {}
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class Terminal {
    cols = 120;
    rows = 32;
    loadAddon(): void {}
    onData() {
      return { dispose(): void {} };
    }
    open(): void {}
    focus(): void {}
    reset(): void {}
    write(): void {}
    writeln(): void {}
    dispose(): void {}
  }
}));

function createHostBridge(createSession: ReturnType<typeof vi.fn>): HostBridge {
  return {
    appServer: {
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn()
    },
    rpc: {
      request: vi.fn(),
      notify: vi.fn(),
      cancel: vi.fn()
    },
    serverRequest: {
      resolve: vi.fn()
    },
    app: {
      openExternal: vi.fn(),
      openWorkspace: vi.fn(),
      openFileInEditor: vi.fn(),
      openCodexConfigToml: vi.fn(),
      revealPathInFolder: vi.fn(),
      showNotification: vi.fn(),
    showContextMenu: vi.fn(),
    importOfficialData: vi.fn(),
    listCodexSessions: vi.fn(),
    readCodexSession: vi.fn(),
    deleteCodexSession: vi.fn()
    },
    git: {
      getStatusSnapshot: vi.fn(),
      getBranchRefs: vi.fn(),
      getRemoteUrl: vi.fn(),
      getDiff: vi.fn(),
      getWorkspaceDiffs: vi.fn(),
      initRepository: vi.fn(),
      stagePaths: vi.fn(),
      unstagePaths: vi.fn(),
      discardPaths: vi.fn(),
      commit: vi.fn(),
      fetch: vi.fn(),
      pull: vi.fn(),
      push: vi.fn(),
      checkout: vi.fn(),
      deleteBranch: vi.fn()
    },
    terminal: {
      createSession,
      write: vi.fn(),
      resize: vi.fn(),
      closeSession: vi.fn().mockResolvedValue(undefined)
    },
    subscribe: vi.fn()
  } as unknown as HostBridge;
}

describe("useTerminalOpenAction", () => {
  it("fits the terminal before creating the session", async () => {
    const createSession = vi.fn().mockResolvedValue({ sessionId: "terminal-1", shell: "Git Bash" });
    const fit = vi.fn();
    const onErrorMessage = vi.fn();
    const onSessionCreated = vi.fn();
    const onStatusChange = vi.fn();
    const syncTerminalSize = vi.fn().mockResolvedValue(undefined);
    const terminalState = {
      cols: 80,
      rows: 20
    };
    const terminalRef: MutableRefObject<Terminal | null> = {
      current: terminalState as Terminal
    };
    const fitAddonRef: MutableRefObject<FitAddon | null> = {
      current: {
        fit: () => {
          fit();
          terminalState.cols = 140;
          terminalState.rows = 36;
        }
      } as FitAddon
    };
    const { result } = renderHook(() =>
      useTerminalOpenAction({
        creatingRef: { current: false },
        cwd: "E:/code/project",
        enforceUtf8: true,
        fitAddonRef,
        hostBridge: createHostBridge(createSession),
        mountedRef: { current: true },
        open: true,
        reportError: vi.fn(),
        sessionIdRef: { current: null },
        onSessionCreated,
        onStatusChange,
        onErrorMessage,
        shell: "gitBash",
        syncTerminalSize,
        terminalRef
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(createSession).toHaveBeenCalledWith({
      rootKey: "E:/code/project",
      terminalId: "terminal",
      cwd: "E:/code/project",
      cols: 140,
      rows: 36,
      shell: "gitBash",
      enforceUtf8: true
    });
    expect(fit).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith("starting");
    expect(onErrorMessage).toHaveBeenCalledWith(null);
    expect(onSessionCreated).toHaveBeenCalledWith("terminal-1", "Git Bash");
    expect(syncTerminalSize).toHaveBeenCalled();
  });

  it("passes the utf-8 toggle state when disabled", async () => {
    const createSession = vi.fn().mockResolvedValue({ sessionId: "terminal-1", shell: "PowerShell" });
    const { result } = renderHook(() =>
      useTerminalOpenAction({
        creatingRef: { current: false },
        cwd: null,
        enforceUtf8: false,
        fitAddonRef: { current: null },
        hostBridge: createHostBridge(createSession),
        mountedRef: { current: true },
        open: true,
        reportError: vi.fn(),
        sessionIdRef: { current: null },
        onSessionCreated: vi.fn(),
        onStatusChange: vi.fn(),
        onErrorMessage: vi.fn(),
        shell: "powerShell",
        syncTerminalSize: vi.fn().mockResolvedValue(undefined),
        terminalRef: { current: null }
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(createSession).toHaveBeenCalledWith({
      rootKey: "__terminal-root__",
      terminalId: "terminal",
      cwd: undefined,
      cols: 120,
      rows: 32,
      shell: "powerShell",
      enforceUtf8: false
    });
  });
});
