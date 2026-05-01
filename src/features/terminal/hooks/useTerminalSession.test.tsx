import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
import { useTerminalSession } from "./useTerminalSession";

type CapturedTerminal = {
  readonly openNodes: Array<HTMLElement>;
  readonly writes: Array<string>;
  disposeCount: number;
};

const { capturedTerminalOptions, capturedTerminals } = vi.hoisted(() => ({
  capturedTerminalOptions: [] as Array<Record<string, unknown>>,
  capturedTerminals: [] as Array<CapturedTerminal>,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class FitAddon {
    fit(): void {}
  }
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class Terminal {
    private readonly captured: CapturedTerminal;

    constructor(options: Record<string, unknown>) {
      capturedTerminalOptions.push(options);
      this.captured = {
        disposeCount: 0,
        openNodes: [],
        writes: [],
      };
      capturedTerminals.push(this.captured);
    }
    cols = 120;
    rows = 32;
    loadAddon(): void {}
    onData() {
      return { dispose(): void {} };
    }
    open(node: HTMLElement): void {
      this.captured.openNodes.push(node);
    }
    focus(): void {}
    reset(): void {}
    write(data: string): void {
      this.captured.writes.push(data);
    }
    refresh(): void {}
    dispose(): void {
      this.captured.disposeCount += 1;
    }
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
        sessionId: "root-1:terminal-1",
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
    capturedTerminals.length = 0;
    document.documentElement.style.removeProperty("--app-code-font-family");
    document.documentElement.style.removeProperty("--app-code-font-size");
  });

  it("uses the configured terminal font settings when opening xterm", async () => {
    document.documentElement.style.setProperty("--app-code-font-family", "Fira Code");
    document.documentElement.style.setProperty("--app-code-font-size", "16px");
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
        rootKey: "root-1",
        terminalId: "terminal-1",
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
        sessionId: "root-1:terminal-1",
      });
    });
    expect(result.current.readyKey).toBe("root-1:terminal-1");
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

  it("does not retain a stale readyKey after switching to a different tab", async () => {
    const hostBridge = createHostBridge();
    vi.mocked(hostBridge.terminal.createSession)
      .mockResolvedValueOnce({ sessionId: "root-1:terminal-1", shell: "PowerShell" })
      .mockResolvedValueOnce({ sessionId: "root-1:launch", shell: "PowerShell" });
    const { result, rerender } = renderHook(
      ({ activeTerminalId }: { readonly activeTerminalId: string }) =>
        useTerminalSession({
          activeRootKey: "root-1",
          activeRootPath: "E:/code/codex-app-plus",
          activeTerminalId,
          focusRequestVersion: 0,
          hostBridge,
          isVisible: true,
          shell: "powerShell",
          enforceUtf8: true,
          resolvedTheme: "dark",
        }),
      {
        initialProps: {
          activeTerminalId: "terminal-1",
        },
      },
    );

    await act(async () => {
      result.current.containerRef(document.createElement("div"));
    });
    await waitFor(() => {
      expect(result.current.readyKey).toBe("root-1:terminal-1");
    });

    rerender({ activeTerminalId: "launch" });

    await waitFor(() => {
      expect(result.current.readyKey).toBe("root-1:launch");
    });
  });

  it("recreates the xterm view and replays buffered output when returning to a workspace", async () => {
    type WorkspaceTerminalProps = {
      readonly activeRootKey: string;
      readonly activeRootPath: string | null;
      readonly activeTerminalId: string | null;
    };
    let outputHandler: ((payload: { readonly sessionId: string; readonly data: string }) => void) | null = null;
    const hostBridge = createHostBridge({
      subscribe: vi.fn((eventName, handler) => {
        if (eventName === "terminal-output") {
          outputHandler = handler as typeof outputHandler;
        }
        return Promise.resolve(() => undefined);
      }),
    });
    const initialProps: WorkspaceTerminalProps = {
      activeRootKey: "root-1",
      activeRootPath: "E:/code/project-a",
      activeTerminalId: "terminal-1",
    };
    const { result, rerender } = renderHook(
      (props: WorkspaceTerminalProps) =>
        useTerminalSession({
          activeRootKey: props.activeRootKey,
          activeRootPath: props.activeRootPath,
          activeTerminalId: props.activeTerminalId,
          focusRequestVersion: 0,
          hostBridge,
          isVisible: true,
          shell: "powerShell",
          enforceUtf8: true,
          resolvedTheme: "dark",
        }),
      {
        initialProps,
      },
    );

    const firstContainer = document.createElement("div");
    await act(async () => {
      result.current.containerRef(firstContainer);
    });
    await waitFor(() => {
      expect(result.current.readyKey).toBe("root-1:terminal-1");
    });

    await act(async () => {
      outputHandler?.({
        data: "dev server ready\r\n",
        sessionId: "root-1:terminal-1",
      });
    });

    rerender({
      activeRootKey: "root-2",
      activeRootPath: "E:/code/project-b",
      activeTerminalId: null,
    });
    await act(async () => {
      result.current.containerRef(null);
    });
    await waitFor(() => {
      expect(capturedTerminals[0]?.disposeCount).toBe(1);
    });

    const secondContainer = document.createElement("div");
    rerender({
      activeRootKey: "root-1",
      activeRootPath: "E:/code/project-a",
      activeTerminalId: "terminal-1",
    });
    await act(async () => {
      result.current.containerRef(secondContainer);
    });

    await waitFor(() => {
      expect(capturedTerminals).toHaveLength(2);
    });
    await waitFor(() => {
      expect(result.current.readyKey).toBe("root-1:terminal-1");
    });

    expect(hostBridge.terminal.createSession).toHaveBeenCalledTimes(1);
    expect(hostBridge.terminal.closeSession).not.toHaveBeenCalled();
    expect(capturedTerminals[1]?.openNodes).toEqual([secondContainer]);
    expect(capturedTerminals[1]?.writes).toContain("dev server ready\r\n");
  });
});
