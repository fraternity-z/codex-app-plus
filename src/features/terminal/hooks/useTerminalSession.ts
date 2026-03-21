import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { EmbeddedTerminalShell, HostBridge } from "../../../bridge/types";
import type { ResolvedTheme } from "../../../domain/theme";
import { readTerminalFontSettingsFromDocument } from "../../settings/model/fontCssVars";
import type { TerminalStatus } from "../model/terminalRuntime";

const MAX_BUFFER_CHARS = 200_000;
const EMPTY_MESSAGE = "Open a terminal to start a session.";
const PREPARING_MESSAGE = "Preparing terminal...";
const STARTING_MESSAGE = "Starting terminal session...";
const READY_MESSAGE = "Terminal ready.";
const FAILURE_MESSAGE = "Failed to start terminal session.";
const TERMINAL_EVENT_SUBSCRIPTION_FAILURE = "Failed to subscribe terminal events.";

interface UseTerminalSessionOptions {
  readonly activeRootKey: string;
  readonly activeRootPath: string | null;
  readonly activeTerminalId: string | null;
  readonly focusRequestVersion: number;
  readonly hostBridge: HostBridge;
  readonly isVisible: boolean;
  readonly shell: EmbeddedTerminalShell;
  readonly enforceUtf8: boolean;
  readonly resolvedTheme: ResolvedTheme;
  readonly onSessionExit?: (rootKey: string, terminalId: string) => void;
}

export interface TerminalSessionState {
  readonly containerRef: RefCallback<HTMLDivElement>;
  readonly focusTerminal: () => void;
  readonly message: string;
  readonly restartSession: () => Promise<void>;
  readonly status: TerminalStatus;
  readonly closeTerminalSession: (tabKey: string) => Promise<void>;
}

function buildTabKey(rootKey: string, terminalId: string): string {
  return `${rootKey}:${terminalId}`;
}

function parseTabKey(tabKey: string): { readonly rootKey: string; readonly terminalId: string } {
  const separatorIndex = tabKey.lastIndexOf(":");
  if (separatorIndex === -1) {
    return { rootKey: "", terminalId: tabKey };
  }
  return {
    rootKey: tabKey.slice(0, separatorIndex),
    terminalId: tabKey.slice(separatorIndex + 1),
  };
}

function appendBuffer(existing: string | undefined, data: string): string {
  const next = `${existing ?? ""}${data}`;
  if (next.length <= MAX_BUFFER_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_BUFFER_CHARS);
}

function createTerminalAppearance(theme: ResolvedTheme) {
  if (theme === "dark") {
    return {
      background: "#181818",
      foreground: "#f3f3f3",
      cursor: "#f1f1f1",
      selectionBackground: "#3a3a3a",
    };
  }
  return {
    background: "#ffffff",
    foreground: "#24292f",
    cursor: "#1f1f1f",
    selectionBackground: "#dbeafe",
  };
}

export function useTerminalSession(options: UseTerminalSessionOptions): TerminalSessionState {
  const {
    activeRootKey,
    activeRootPath,
    activeTerminalId,
    focusRequestVersion,
    hostBridge,
    isVisible,
    shell,
    enforceUtf8,
    resolvedTheme,
    onSessionExit,
  } = options;
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const outputBuffersRef = useRef<Map<string, string>>(new Map());
  const pendingSessionTabKeysRef = useRef<Set<string>>(new Set());
  const sessionIdByTabKeyRef = useRef<Map<string, string>>(new Map());
  const tabKeyBySessionIdRef = useRef<Map<string, string>>(new Map());
  const orphanOutputBySessionIdRef = useRef<Map<string, string>>(new Map());
  const onSessionExitRef = useRef(onSessionExit);
  const activeTabKeyRef = useRef<string | null>(null);
  const renderedTabKeyRef = useRef<string | null>(null);
  const pendingFocusRef = useRef(false);
  const fitFrameRef = useRef<number | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [sessionResetVersion, setSessionResetVersion] = useState(0);
  const [containerVersion, setContainerVersion] = useState(0);

  const activeTabKey = useMemo(() => {
    if (activeTerminalId === null) {
      return null;
    }
    return buildTabKey(activeRootKey, activeTerminalId);
  }, [activeRootKey, activeTerminalId]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node;
    setContainerVersion((previous) => previous + 1);
  }, []);

  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const focusTerminalIfRequested = useCallback(() => {
    if (!pendingFocusRef.current) {
      return;
    }
    pendingFocusRef.current = false;
    focusTerminal();
  }, [focusTerminal]);

  const refreshTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (terminal === null) {
      return;
    }
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
    focusTerminalIfRequested();
  }, [focusTerminalIfRequested]);

  const syncActiveBuffer = useCallback(
    (tabKey: string) => {
      const terminal = terminalRef.current;
      if (terminal === null) {
        return;
      }
      terminal.reset();
      const buffered = outputBuffersRef.current.get(tabKey);
      if (buffered) {
        terminal.write(buffered);
      }
      refreshTerminal();
    },
    [refreshTerminal],
  );

  const scheduleFit = useCallback((callback?: () => void) => {
    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current);
    }
    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
      fitAddonRef.current?.fit();
      callback?.();
    });
  }, []);

  const syncTerminalSize = useCallback((sessionId: string) => {
    const terminal = terminalRef.current;
    if (terminal === null) {
      return;
    }
    void hostBridge.terminal.resize({
      cols: terminal.cols,
      rows: terminal.rows,
      sessionId,
    }).catch(() => undefined);
  }, [hostBridge]);

  const scheduleSessionLayout = useCallback((sessionId: string) => {
    scheduleFit(() => {
      refreshTerminal();
      syncTerminalSize(sessionId);
    });
  }, [refreshTerminal, scheduleFit, syncTerminalSize]);

  const cleanupTerminalTab = useCallback(
    (tabKey: string) => {
      const sessionId = sessionIdByTabKeyRef.current.get(tabKey);
      outputBuffersRef.current.delete(tabKey);
      pendingSessionTabKeysRef.current.delete(tabKey);
      sessionIdByTabKeyRef.current.delete(tabKey);
      if (renderedTabKeyRef.current === tabKey) {
        renderedTabKeyRef.current = null;
      }
      if (sessionId) {
        tabKeyBySessionIdRef.current.delete(sessionId);
        orphanOutputBySessionIdRef.current.delete(sessionId);
      }
      setSessionResetVersion((previous) => previous + 1);
      if (activeTabKeyRef.current === tabKey) {
        terminalRef.current?.reset();
        setStatus("idle");
        setMessage(EMPTY_MESSAGE);
      }
    },
    [],
  );

  const closeTerminalSession = useCallback(
    async (tabKey: string) => {
      const sessionId = sessionIdByTabKeyRef.current.get(tabKey);
      cleanupTerminalTab(tabKey);
      if (sessionId !== undefined) {
        await hostBridge.terminal.closeSession({ sessionId });
      }
    },
    [cleanupTerminalTab, hostBridge],
  );

  const restartSession = useCallback(async () => {
    if (activeTabKey === null) {
      return;
    }
    const sessionId = sessionIdByTabKeyRef.current.get(activeTabKey);
    cleanupTerminalTab(activeTabKey);
    if (sessionId !== undefined) {
      await hostBridge.terminal.closeSession({ sessionId });
    }
  }, [activeTabKey, cleanupTerminalTab, hostBridge]);

  useEffect(() => {
    activeTabKeyRef.current = activeTabKey;
  }, [activeTabKey]);

  useEffect(() => {
    onSessionExitRef.current = onSessionExit;
  }, [onSessionExit]);

  useEffect(() => {
    let disposed = false;
    let disposeOutput: (() => void) | null = null;
    let disposeExit: (() => void) | null = null;

    const handleOutput = (payload: { readonly sessionId: string; readonly data: string }) => {
      const tabKey = tabKeyBySessionIdRef.current.get(payload.sessionId);
      if (tabKey === undefined) {
        const orphan = appendBuffer(
          orphanOutputBySessionIdRef.current.get(payload.sessionId),
          payload.data,
        );
        orphanOutputBySessionIdRef.current.set(payload.sessionId, orphan);
        return;
      }
      const next = appendBuffer(outputBuffersRef.current.get(tabKey), payload.data);
      outputBuffersRef.current.set(tabKey, next);
      if (activeTabKeyRef.current === tabKey) {
        terminalRef.current?.write(payload.data);
      }
    };

    const handleExit = (payload: { readonly sessionId: string }) => {
      const tabKey = tabKeyBySessionIdRef.current.get(payload.sessionId);
      if (tabKey === undefined) {
        orphanOutputBySessionIdRef.current.delete(payload.sessionId);
        return;
      }
      tabKeyBySessionIdRef.current.delete(payload.sessionId);
      orphanOutputBySessionIdRef.current.delete(payload.sessionId);
      cleanupTerminalTab(tabKey);
      const parsed = parseTabKey(tabKey);
      onSessionExitRef.current?.(parsed.rootKey, parsed.terminalId);
    };

    void Promise.all([
      hostBridge.subscribe("terminal-output", handleOutput),
      hostBridge.subscribe("terminal-exit", handleExit),
    ]).then(([nextDisposeOutput, nextDisposeExit]) => {
      if (disposed) {
        nextDisposeOutput();
        nextDisposeExit();
        return;
      }
      disposeOutput = nextDisposeOutput;
      disposeExit = nextDisposeExit;
    }).catch((error) => {
      console.error("terminal event subscription failed", error);
      if (disposed) {
        return;
      }
      setStatus("error");
      setMessage(TERMINAL_EVENT_SUBSCRIPTION_FAILURE);
    });

    return () => {
      disposed = true;
      disposeOutput?.();
      disposeExit?.();
    };
  }, [cleanupTerminalTab, hostBridge]);

  useEffect(() => {
    if (!isVisible) {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      renderedTabKeyRef.current = null;
      return;
    }
    if (terminalRef.current !== null || containerElementRef.current === null) {
      return;
    }
    const terminalFonts = readTerminalFontSettingsFromDocument();
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: terminalFonts.fontSize,
      fontFamily: terminalFonts.fontFamily,
      allowTransparency: false,
      theme: createTerminalAppearance(resolvedTheme),
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerElementRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    scheduleFit();
    setContainerVersion((previous) => previous + 1);
    inputDisposableRef.current = terminal.onData((data) => {
      const key = activeTabKeyRef.current;
      if (key === null) {
        return;
      }
      const sessionId = sessionIdByTabKeyRef.current.get(key);
      if (sessionId === undefined) {
        return;
      }
      void hostBridge.terminal.write({ data, sessionId }).catch(() => {
        sessionIdByTabKeyRef.current.delete(key);
      });
    });
  }, [containerVersion, hostBridge, isVisible, resolvedTheme, scheduleFit]);

  useEffect(() => {
    return () => {
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
      }
      inputDisposableRef.current?.dispose();
      terminalRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setMessage(EMPTY_MESSAGE);
      return;
    }
    if (activeRootPath === null || activeTerminalId === null) {
      setStatus("idle");
      setMessage(EMPTY_MESSAGE);
      return;
    }
    if (terminalRef.current === null || fitAddonRef.current === null) {
      setStatus("idle");
      setMessage(PREPARING_MESSAGE);
      return;
    }
    const tabKey = buildTabKey(activeRootKey, activeTerminalId);
    const existingSessionId = sessionIdByTabKeyRef.current.get(tabKey);
    if (existingSessionId !== undefined) {
      setStatus("ready");
      setMessage(READY_MESSAGE);
      if (renderedTabKeyRef.current !== tabKey) {
        syncActiveBuffer(tabKey);
        renderedTabKeyRef.current = tabKey;
      }
      scheduleSessionLayout(existingSessionId);
      return;
    }
    if (pendingSessionTabKeysRef.current.has(tabKey)) {
      setStatus("starting");
      setMessage(STARTING_MESSAGE);
      return;
    }

    const openSession = async () => {
      pendingSessionTabKeysRef.current.add(tabKey);
      setStatus("starting");
      setMessage(STARTING_MESSAGE);
      const terminal = terminalRef.current;
      if (terminal === null) {
        return;
      }
      scheduleFit();
      const result = await hostBridge.terminal.createSession({
        cwd: activeRootPath,
        cols: terminal.cols,
        rows: terminal.rows,
        shell,
        enforceUtf8,
      });
      if (!pendingSessionTabKeysRef.current.has(tabKey)) {
        await hostBridge.terminal.closeSession({ sessionId: result.sessionId });
        return;
      }
      sessionIdByTabKeyRef.current.set(tabKey, result.sessionId);
      tabKeyBySessionIdRef.current.set(result.sessionId, tabKey);
      const orphan = orphanOutputBySessionIdRef.current.get(result.sessionId);
      if (orphan) {
        outputBuffersRef.current.set(tabKey, orphan);
        orphanOutputBySessionIdRef.current.delete(result.sessionId);
      }
      setStatus("ready");
      setMessage(READY_MESSAGE);
      syncActiveBuffer(tabKey);
      renderedTabKeyRef.current = tabKey;
      scheduleSessionLayout(result.sessionId);
    };

    void openSession().catch(() => {
      setStatus("error");
      setMessage(FAILURE_MESSAGE);
    }).finally(() => {
      pendingSessionTabKeysRef.current.delete(tabKey);
    });
  }, [
    activeRootKey,
    activeRootPath,
    activeTerminalId,
    enforceUtf8,
    hostBridge,
    isVisible,
    refreshTerminal,
    sessionResetVersion,
    shell,
    syncActiveBuffer,
    containerVersion,
    scheduleSessionLayout,
    scheduleFit,
  ]);

  useEffect(() => {
    if (!isVisible || focusRequestVersion === 0) {
      return;
    }
    pendingFocusRef.current = true;
    focusTerminalIfRequested();
  }, [focusRequestVersion, focusTerminalIfRequested, isVisible]);

  useEffect(() => {
    if (!isVisible || activeTabKey === null || fitAddonRef.current === null) {
      return;
    }
    scheduleFit(refreshTerminal);
  }, [activeTabKey, isVisible, refreshTerminal, scheduleFit]);

  useEffect(() => {
    if (!isVisible || activeTabKey === null || activeTerminalId === null || activeRootPath === null) {
      return;
    }
    const fitAddon = fitAddonRef.current;
    const terminal = terminalRef.current;
    if (fitAddon === null || terminal === null || containerElementRef.current === null) {
      return;
    }
    const resize = () => {
      fitAddon.fit();
      const sessionId = sessionIdByTabKeyRef.current.get(activeTabKey);
      if (sessionId === undefined) {
        return;
      }
      void hostBridge.terminal.resize({
        cols: terminal.cols,
        rows: terminal.rows,
        sessionId,
      });
    };
    const observer = new ResizeObserver(() => resize());
    observer.observe(containerElementRef.current);
    scheduleFit(resize);
    return () => observer.disconnect();
  }, [activeRootPath, activeTabKey, activeTerminalId, hostBridge, isVisible, scheduleFit]);

  return {
    closeTerminalSession,
    containerRef,
    focusTerminal,
    message,
    restartSession,
    status,
  };
}
