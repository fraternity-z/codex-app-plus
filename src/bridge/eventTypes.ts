import type { RequestId } from "../protocol/generated/RequestId";
import type { ShowNotificationInput } from "./appTypes";
import type { TerminalExitEventPayload, TerminalOutputEventPayload } from "./terminalTypes";

export type BridgeEventName =
  | "connection-changed"
  | "codex-session-index-updated"
  | "browser-sidebar-open-requested"
  | "app-notification-requested"
  | "notification-received"
  | "server-request-received"
  | "fatal-error"
  | "terminal-output"
  | "terminal-exit";

export interface ConnectionChangedPayload {
  readonly status: "disconnected" | "connecting" | "connected" | "error";
}

export interface NotificationEventPayload {
  readonly method: string;
  readonly params: unknown;
}

export interface ServerRequestEventPayload {
  readonly id: RequestId;
  readonly method: string;
  readonly params: unknown;
}

export interface FatalErrorPayload {
  readonly message: string;
}

export interface CodexSessionIndexUpdatedPayload {
  readonly agentEnvironment: "windowsNative" | "wsl";
  readonly durationMs: number;
  readonly sessionCount: number;
}

export interface BrowserSidebarOpenRequestedPayload {
  readonly url: string | null;
}

export type BridgeEventPayloadMap = {
  "connection-changed": ConnectionChangedPayload;
  "codex-session-index-updated": CodexSessionIndexUpdatedPayload;
  "browser-sidebar-open-requested": BrowserSidebarOpenRequestedPayload;
  "app-notification-requested": ShowNotificationInput;
  "notification-received": NotificationEventPayload;
  "server-request-received": ServerRequestEventPayload;
  "fatal-error": FatalErrorPayload;
  "terminal-output": TerminalOutputEventPayload;
  "terminal-exit": TerminalExitEventPayload;
};
