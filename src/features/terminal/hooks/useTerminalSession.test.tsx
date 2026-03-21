import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { useTerminalSession } from "./useTerminalSession";

const { capturedTerminalOptions } = vi.hoisted(() => ({
  capturedTerminalOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class FitAddon {
    fit(): void {}
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class Terminal {
    constructor(options: Record<string, unknown>) {
      capturedTerminalOptions.push(options);
    }
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
    refresh(): void {}
    dispose(): void {}
  }
}));

vi.stubGlobal("ResizeObserver", class ResizeObserver {
  disconnect(): void {}
  observe(): void {}
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createHostBridge(overrides: Partial<HostBridge> = {}): HostBridge {
  return {
    terminal: {
      createSession: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        shell: "PowerShell",
      }),
      write: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
    subscribe: vi.fn().mockResolvedValue(() => undefined),
    ...overrides,
  } as unknown as HostBridge;
}

describe("useTerminalSession", () => {
  beforeEach(() => {
    capturedTerminalOptions.length = 0;
    document.documentElement.style.removeProperty("--app-terminal-font-family");
    document.documentElement.style.removeProperty("--app-terminal-font-size");
  });

  it("uses the configured terminal font settings when opening xterm", async () => {
    document.documentElement.style.setProperty("--app-terminal-font-family", "Fira Code");
    document.documentElement.style.setProperty("--app-terminal-font-size", "16px");
    const hostBridge = createHostBridge();

    const { result } = renderHook(() =>
      useTerminalSession({
        activeRootKey: "root-1",
        activeRootPath: "E:/code/codex-app-plus",
        activeTerminalId: "terminal-1",
        focusRequestVersion: 0,
        hostBridge,
        isVisible: true,
        shell: "powerShell",
        enforceUtf8: true,
        resolvedTheme: "dark",
      }),
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    expect(capturedTerminalOptions.at(-1)).toEqual(
      expect.objectContaining({
        fontFamily: "Fira Code",
        fontSize: 16,
      }),
    );
  });

  it("does not create a session while the terminal is hidden", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() =>
      useTerminalSession({
        activeRootKey: "root-1",
        activeRootPath: "E:/code/codex-app-plus",
        activeTerminalId: "terminal-1",
        focusRequestVersion: 0,
        hostBridge,
        isVisible: false,
        shell: "powerShell",
        enforceUtf8: true,
        resolvedTheme: "dark",
      }),
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    expect(hostBridge.terminal.createSession).not.toHaveBeenCalled();
  });

  it("initializes the terminal after the container ref is attached", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() =>
      useTerminalSession({
        activeRootKey: "root-1",
        activeRootPath: "E:/code/codex-app-plus",
        activeTerminalId: "terminal-1",
        focusRequestVersion: 0,
        hostBridge,
        isVisible: true,
        shell: "powerShell",
        enforceUtf8: true,
        resolvedTheme: "dark",
      }),
    );

    expect(result.current.message).toBe("Preparing terminal...");

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    await waitFor(() => {
      expect(hostBridge.terminal.createSession).toHaveBeenCalledWith({
        cwd: "E:/code/codex-app-plus",
        cols: 120,
        rows: 32,
        shell: "powerShell",
        enforceUtf8: true,
      });
    });
  });

  it("creates the first session even when terminal subscriptions resolve later", async () => {
    const outputSubscription = createDeferred<() => void>();
    const exitSubscription = createDeferred<() => void>();
    const hostBridge = createHostBridge({
      subscribe: vi.fn((eventName) => {
        if (eventName === "terminal-output") {
          return outputSubscription.promise;
        }
        return exitSubscription.promise;
      }),
    });
    const { result } = renderHook(() =>
      useTerminalSession({
        activeRootKey: "root-1",
        activeRootPath: "E:/code/codex-app-plus",
        activeTerminalId: "terminal-1",
        focusRequestVersion: 0,
        hostBridge,
        isVisible: true,
        shell: "powerShell",
        enforceUtf8: true,
        resolvedTheme: "dark",
      }),
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    await waitFor(() => {
      expect(hostBridge.terminal.createSession).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      outputSubscription.resolve(() => undefined);
      exitSubscription.resolve(() => undefined);
      await Promise.resolve();
    });
  });

  it("syncs terminal size after the first session starts", async () => {
    const hostBridge = createHostBridge();
    const { result } = renderHook(() =>
      useTerminalSession({
        activeRootKey: "root-1",
        activeRootPath: "E:/code/codex-app-plus",
        activeTerminalId: "terminal-1",
        focusRequestVersion: 0,
        hostBridge,
        isVisible: true,
        shell: "powerShell",
        enforceUtf8: true,
        resolvedTheme: "dark",
      }),
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    await waitFor(() => {
      expect(hostBridge.terminal.resize).toHaveBeenCalledWith({
        cols: 120,
        rows: 32,
        sessionId: "session-1",
      });
    });
  });

  it("keeps the existing session when the panel is hidden and shown again", async () => {
    const hostBridge = createHostBridge();
    const { result, rerender } = renderHook(
      ({ isVisible }: { readonly isVisible: boolean }) =>
        useTerminalSession({
          activeRootKey: "root-1",
          activeRootPath: "E:/code/codex-app-plus",
          activeTerminalId: "terminal-1",
          focusRequestVersion: 0,
          hostBridge,
          isVisible,
          shell: "powerShell",
          enforceUtf8: true,
          resolvedTheme: "dark",
        }),
      {
        initialProps: {
          isVisible: true,
        },
      },
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });

    await waitFor(() => {
      expect(hostBridge.terminal.createSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    rerender({ isVisible: false });
    rerender({ isVisible: true });

    await waitFor(() => {
      expect(hostBridge.terminal.createSession).toHaveBeenCalledTimes(1);
    });
    expect(hostBridge.terminal.closeSession).not.toHaveBeenCalled();
  });
});
