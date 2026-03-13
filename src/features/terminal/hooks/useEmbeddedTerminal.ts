import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EmbeddedTerminalShell, HostBridge } from "../../../bridge/types";
import {
  buildSubTitle,
  getStatusLabel,
  type TerminalStatus,
  useMountedTerminal,
  useResizeObserver,
  useScheduledLayout,
  useTerminalEvents,
  useTerminalOpenAction,
  useTerminalSyncSize
} from "../model/terminalRuntime";

interface UseEmbeddedTerminalOptions {
  readonly cwd: string | null;
  readonly cwdLabel: string;
  readonly hostBridge: HostBridge;
  readonly open: boolean;
  readonly shell: EmbeddedTerminalShell;
}

export interface EmbeddedTerminalController {
  readonly className: string;
  readonly containerRef: MutableRefObject<HTMLDivElement | null>;
  readonly errorMessage: string | null;
  readonly focusTerminal: () => void;
  readonly openTerminal: () => Promise<void>;
  readonly shellLabel: string;
  readonly showRestartAction: boolean;
  readonly status: TerminalStatus;
  readonly statusLabel: string;
  readonly subtitle: string;
}

interface UseTerminalSessionResetOptions {
  readonly hostBridge: HostBridge;
  readonly reportError: (title: string, error: unknown) => void;
  readonly sessionIdRef: MutableRefObject<string | null>;
  readonly sessionKey: string;
  readonly setErrorMessage: Dispatch<SetStateAction<string | null>>;
  readonly setShellLabel: Dispatch<SetStateAction<string>>;
  readonly setStatus: Dispatch<SetStateAction<TerminalStatus>>;
  readonly shell: EmbeddedTerminalShell;
  readonly terminalRef: MutableRefObject<{ reset(): void } | null>;
}

function getEmbeddedTerminalShellLabel(shell: EmbeddedTerminalShell): string {
  if (shell === "commandPrompt") {
    return "Command Prompt";
  }
  if (shell === "gitBash") {
    return "Git Bash";
  }
  return "PowerShell";
}

function useTerminalSessionReset(options: UseTerminalSessionResetOptions): void {
  const { hostBridge, reportError, sessionIdRef, sessionKey, setErrorMessage, setShellLabel, setStatus, shell, terminalRef } = options;
  const lastSessionKeyRef = useRef(sessionKey);

  useEffect(() => {
    if (lastSessionKeyRef.current === sessionKey) {
      return;
    }
    lastSessionKeyRef.current = sessionKey;
    setErrorMessage(null);
    setShellLabel(getEmbeddedTerminalShellLabel(shell));
    setStatus("idle");
    terminalRef.current?.reset();
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId !== null) {
      void hostBridge.terminal.closeSession({ sessionId }).catch((error) => reportError("failed to close previous terminal session", error));
    }
  }, [hostBridge.terminal, reportError, sessionIdRef, sessionKey, setErrorMessage, setShellLabel, setStatus, shell, terminalRef]);
}

export function useEmbeddedTerminal(options: UseEmbeddedTerminalOptions): EmbeddedTerminalController {
  const { cwd, cwdLabel, hostBridge, open, shell } = options;
  const sessionKey = `${cwd ?? ""}::${shell}`;
  const sessionIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shellLabel, setShellLabel] = useState(() => getEmbeddedTerminalShellLabel(shell));
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const reportError = useCallback((title: string, error: unknown) => {
    const message = `${title}: ${error instanceof Error ? error.message : String(error)}`;
    setStatus("error");
    setErrorMessage(message);
    terminalRef.current?.writeln(`\r\n${message}`);
  }, []);
  const { containerRef, fitAddonRef, mountedRef, terminalRef } = useMountedTerminal({ hostBridge, reportError, sessionIdRef });
  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, [terminalRef]);
  const syncTerminalSize = useTerminalSyncSize({ fitAddonRef, hostBridge, open, reportError, sessionIdRef, terminalRef });
  const openTerminal = useTerminalOpenAction({ creatingRef, cwd, fitAddonRef, hostBridge, mountedRef, open, reportError, sessionIdRef, setErrorMessage, setShellLabel, setStatus, shell, syncTerminalSize, terminalRef });
  const scheduleTerminalLayout = useScheduledLayout({ focusTerminal, syncTerminalSize });

  const terminalEventsReady = useTerminalEvents({ hostBridge, reportError, sessionIdRef, setStatus, terminalRef });
  useResizeObserver({ containerRef, open, scheduleTerminalLayout });
  useTerminalSessionReset({
    hostBridge,
    reportError,
    sessionIdRef,
    sessionKey,
    setErrorMessage,
    setShellLabel,
    setStatus,
    shell,
    terminalRef
  });

  useEffect(() => {
    if (open && terminalEventsReady) {
      scheduleTerminalLayout();
      void openTerminal();
    }
  }, [open, openTerminal, scheduleTerminalLayout, sessionKey, terminalEventsReady]);

  return {
    className: open ? "replica-terminal" : "replica-terminal replica-terminal-hidden",
    containerRef,
    errorMessage,
    focusTerminal,
    openTerminal,
    shellLabel,
    showRestartAction: status === "idle" || status === "exited" || status === "error",
    status,
    statusLabel: getStatusLabel(status),
    subtitle: buildSubTitle(shellLabel, cwdLabel)
  };
}
