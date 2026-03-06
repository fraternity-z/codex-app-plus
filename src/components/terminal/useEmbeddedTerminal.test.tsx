import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../bridge/types";

const openTerminalSpy = vi.fn().mockResolvedValue(undefined);
const scheduleTerminalLayoutSpy = vi.fn();
let terminalEventsReady = false;

vi.mock("./terminalRuntime", () => ({
  buildSubTitle: (shellLabel: string, cwdLabel: string) => `${shellLabel} - ${cwdLabel}`,
  getStatusLabel: () => "Idle",
  useMountedTerminal: () => ({
    containerRef: { current: null },
    fitAddonRef: { current: null },
    mountedRef: { current: true },
    terminalRef: { current: null }
  }),
  useResizeObserver: () => undefined,
  useScheduledLayout: () => scheduleTerminalLayoutSpy,
  useTerminalEvents: () => terminalEventsReady,
  useTerminalOpenAction: () => openTerminalSpy,
  useTerminalSyncSize: () => vi.fn().mockResolvedValue(undefined)
}));

import { useEmbeddedTerminal } from "./useEmbeddedTerminal";

function createHostBridge(): HostBridge {
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
      openCodexConfigToml: vi.fn(),
      showNotification: vi.fn(),
      showContextMenu: vi.fn(),
      importOfficialData: vi.fn(),
      listCodexSessions: vi.fn(),
      readCodexSession: vi.fn()
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
      createSession: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      closeSession: vi.fn()
    },
    subscribe: vi.fn()
  } as unknown as HostBridge;
}

describe("useEmbeddedTerminal", () => {
  it("waits for terminal event subscriptions before opening a session", async () => {
    terminalEventsReady = false;
    openTerminalSpy.mockClear();
    scheduleTerminalLayoutSpy.mockClear();
    const hostBridge = createHostBridge();
    const { rerender } = renderHook(() =>
      useEmbeddedTerminal({
        cwd: "E:/code/project",
        cwdLabel: "project",
        hostBridge,
        open: true,
        shell: "powerShell"
      })
    );

    expect(openTerminalSpy).not.toHaveBeenCalled();
    expect(scheduleTerminalLayoutSpy).not.toHaveBeenCalled();

    terminalEventsReady = true;
    await act(async () => {
      rerender();
    });

    expect(openTerminalSpy).toHaveBeenCalledTimes(1);
    expect(scheduleTerminalLayoutSpy).toHaveBeenCalledTimes(1);
  });
});
