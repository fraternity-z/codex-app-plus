import type { EmbeddedTerminalShell } from "./sharedTypes";

export interface TerminalCreateInput {
  readonly rootKey: string;
  readonly terminalId: string;
  readonly cwd?: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly shell?: EmbeddedTerminalShell;
  readonly enforceUtf8?: boolean;
}

export interface TerminalCreateOutput {
  readonly sessionId: string;
  readonly shell: string;
}

export interface TerminalWriteInput {
  readonly sessionId: string;
  readonly data: string;
}

export interface TerminalResizeInput {
  readonly sessionId: string;
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalCloseInput {
  readonly sessionId: string;
}

export interface TerminalOutputEventPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface TerminalExitEventPayload {
  readonly sessionId: string;
  readonly exitCode?: number | null;
}
