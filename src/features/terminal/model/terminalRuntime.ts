import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { EmbeddedTerminalShell, HostBridge } from "../../../bridge/types";
import type { ResolvedTheme } from "../../../domain/theme";
import { readTerminalFontSettingsFromDocument } from "../../settings/model/fontCssVars";

const DEFAULT_COLUMNS = 120;
const DEFAULT_ROWS = 32;

export type TerminalStatus = "idle" | "starting" | "ready" | "exited" | "error";

interface UseMountedTerminalOptions {
  readonly hostBridge: HostBridge;
  readonly reportError: (title: string, error: unknown) => void;
  readonly sessionIdRef: MutableRefObject<string | null>;
  readonly theme: ResolvedTheme;
}

interface UseResizeObserverOptions {
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly scheduleTerminalLayout: () => void;
}

interface UseTerminalSyncSizeOptions {
  readonly fitAddonRef: MutableRefObject<FitAddon | null>;
  readonly hostBridge: HostBridge;
  readonly open: boolean;
  readonly reportError: (title: string, error: unknown) => void;
  readonly sessionIdRef: MutableRefObject<string | null>;
  readonly terminalRef: MutableRefObject<Terminal | null>;
}

interface UseTerminalOpenActionOptions {
  readonly creatingRef: MutableRefObject<boolean>;
  readonly cwd: string | null;
  readonly enforceUtf8: boolean;
  readonly fitAddonRef: MutableRefObject<FitAddon | null>;
  readonly hostBridge: HostBridge;
  readonly mountedRef: MutableRefObject<boolean>;
  readonly open: boolean;
  readonly reportError: (title: string, error: unknown) => void;
  readonly sessionIdRef: MutableRefObject<string | null>;
  readonly onSessionCreated: (sessionId: string, shellLabel: string) => void;
  readonly onStatusChange: (status: TerminalStatus) => void;
  readonly onErrorMessage: (message: string | null) => void;
  readonly shell: EmbeddedTerminalShell;
  readonly syncTerminalSize: () => Promise<void>;
  readonly terminalRef: MutableRefObject<Terminal | null>;
}

interface UseScheduledLayoutOptions {
  readonly focusTerminal: () => void;
  readonly syncTerminalSize: () => Promise<void>;
}

function buildTerminalCreateInput(
  cwd: string | null,
  shell: EmbeddedTerminalShell,
  enforceUtf8: boolean,
  size: { readonly cols: number; readonly rows: number },
) {
  return {
    cwd: cwd ?? undefined,
    cols: size.cols,
    rows: size.rows,
    shell,
    enforceUtf8,
  };
}

function createTerminalTheme(theme: ResolvedTheme): ITheme {
  if (theme === "dark") {
    return {
      background: "#181818",
      foreground: "#f3f3f3",
      cursor: "#f1f1f1",
      selectionBackground: "#3a3a3a",
      black: "#181818",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#4f8cff",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#d4d4d4",
      brightBlack: "#525252",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#78a8ff",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    };
  }

  return {
    background: "#ffffff",
    foreground: "#24292f",
    cursor: "#1f1f1f",
    selectionBackground: "#dbeafe",
    black: "#24292f",
    red: "#cf222e",
    green: "#116329",
    yellow: "#4d2d00",
    blue: "#0550ae",
    magenta: "#8250df",
    cyan: "#0f766e",
    white: "#ffffff",
    brightBlack: "#57606a",
    brightRed: "#ff8182",
    brightGreen: "#3fb950",
    brightYellow: "#d29922",
    brightBlue: "#79c0ff",
    brightMagenta: "#bc8cff",
    brightCyan: "#39c5cf",
    brightWhite: "#f6f8fa",
  };
}

function createTerminalInstance(
  theme: ResolvedTheme,
): { readonly terminal: Terminal; readonly fitAddon: FitAddon } {
  const terminalFonts = readTerminalFontSettingsFromDocument();
  const terminal = new Terminal({
    allowTransparency: false,
    convertEol: true,
    cursorBlink: true,
    fontFamily: terminalFonts.fontFamily,
    fontSize: terminalFonts.fontSize,
    scrollback: 5000,
    theme: createTerminalTheme(theme),
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  return { fitAddon, terminal };
}

function readTerminalSize(
  terminal: Terminal,
): { readonly cols: number; readonly rows: number } {
  return {
    cols: Math.max(terminal.cols, DEFAULT_COLUMNS),
    rows: Math.max(terminal.rows, DEFAULT_ROWS),
  };
}

function readInitialTerminalSize(
  terminalRef: MutableRefObject<Terminal | null>,
  fitAddonRef: MutableRefObject<FitAddon | null>,
): { readonly cols: number; readonly rows: number } {
  const terminal = terminalRef.current;
  const fitAddon = fitAddonRef.current;
  if (terminal === null || fitAddon === null) {
    return { cols: DEFAULT_COLUMNS, rows: DEFAULT_ROWS };
  }
  fitAddon.fit();
  return readTerminalSize(terminal);
}

export function getStatusLabel(status: TerminalStatus): string {
  if (status === "starting") return "Starting";
  if (status === "ready") return "Running";
  if (status === "exited") return "Exited";
  if (status === "error") return "Error";
  return "Idle";
}

export function buildSubTitle(shellLabel: string, cwdLabel: string): string {
  if (cwdLabel.trim().length === 0) {
    return shellLabel;
  }
  return `${shellLabel} - ${cwdLabel}`;
}

export function useMountedTerminal(options: UseMountedTerminalOptions) {
  const { hostBridge, reportError, sessionIdRef, theme } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    const { fitAddon, terminal } = createTerminalInstance(theme);
    const disposable = terminal.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (sessionId === null) {
        return;
      }
      void hostBridge.terminal
        .write({ data, sessionId })
        .catch((error) => reportError("failed to write terminal input", error));
    });
    terminal.open(container);
    fitAddonRef.current = fitAddon;
    terminalRef.current = terminal;

    return () => {
      mountedRef.current = false;
      disposable.dispose();
      terminal.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
    };
  }, [hostBridge.terminal, reportError, sessionIdRef]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal === null) {
      return;
    }
    terminal.options.theme = createTerminalTheme(theme);
  }, [theme]);

  return { containerRef, fitAddonRef, mountedRef, terminalRef };
}

export function useResizeObserver(options: UseResizeObserverOptions): void {
  const { containerRef, open, scheduleTerminalLayout } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (open) {
        scheduleTerminalLayout();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, open, scheduleTerminalLayout]);
}

export function useTerminalSyncSize(options: UseTerminalSyncSizeOptions) {
  const {
    fitAddonRef,
    hostBridge,
    open,
    reportError,
    sessionIdRef,
    terminalRef,
  } = options;

  return useCallback(async () => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const sessionId = sessionIdRef.current;
    if (!open || terminal === null || fitAddon === null || sessionId === null) {
      return;
    }
    fitAddon.fit();
    const { cols, rows } = readTerminalSize(terminal);
    try {
      await hostBridge.terminal.resize({ cols, rows, sessionId });
    } catch (error) {
      reportError("failed to sync terminal size", error);
    }
  }, [fitAddonRef, hostBridge.terminal, open, reportError, sessionIdRef, terminalRef]);
}

export function useTerminalOpenAction(options: UseTerminalOpenActionOptions) {
  const {
    creatingRef,
    cwd,
    enforceUtf8,
    fitAddonRef,
    hostBridge,
    mountedRef,
    open,
    reportError,
    sessionIdRef,
    onSessionCreated,
    onStatusChange,
    onErrorMessage,
    shell,
    syncTerminalSize,
    terminalRef,
  } = options;

  return useCallback(async () => {
    if (!open || creatingRef.current || sessionIdRef.current !== null) {
      return;
    }
    creatingRef.current = true;
    onStatusChange("starting");
    onErrorMessage(null);
    try {
      const size = readInitialTerminalSize(terminalRef, fitAddonRef);
      const result = await hostBridge.terminal.createSession(
        buildTerminalCreateInput(cwd, shell, enforceUtf8, size),
      );
      if (!mountedRef.current) {
        await hostBridge.terminal.closeSession({ sessionId: result.sessionId });
        return;
      }
      sessionIdRef.current = result.sessionId;
      onSessionCreated(result.sessionId, result.shell);
      await syncTerminalSize();
    } catch (error) {
      reportError("failed to start terminal", error);
    } finally {
      creatingRef.current = false;
    }
  }, [
    creatingRef,
    cwd,
    enforceUtf8,
    fitAddonRef,
    hostBridge.terminal,
    mountedRef,
    open,
    reportError,
    sessionIdRef,
    onSessionCreated,
    onStatusChange,
    onErrorMessage,
    shell,
    syncTerminalSize,
    terminalRef,
  ]);
}

export function useScheduledLayout(options: UseScheduledLayoutOptions): () => void {
  const { focusTerminal, syncTerminalSize } = options;
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      void syncTerminalSize();
      focusTerminal();
    });
  }, [focusTerminal, syncTerminalSize]);
}
