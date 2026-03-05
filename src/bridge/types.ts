export type BridgeEventName =
  | "connection.changed"
  | "notification.received"
  | "serverRequest.received"
  | "fatal.error";

export interface ConnectionChangedPayload {
  readonly status: "disconnected" | "connecting" | "connected" | "error";
}

export interface NotificationEventPayload {
  readonly method: string;
  readonly params: unknown;
}

export interface ServerRequestEventPayload {
  readonly id: string;
  readonly method: string;
  readonly params: unknown;
}

export interface FatalErrorPayload {
  readonly message: string;
}

export interface AppServerStartInput {
  readonly codexPath?: string;
}

export interface RpcRequestInput {
  readonly method: string;
  readonly params: unknown;
  readonly timeoutMs?: number;
}

export interface RpcRequestOutput {
  readonly requestId: string;
  readonly result: unknown;
}

export interface RpcCancelInput {
  readonly requestId: string;
}

export interface ServerRequestResolveInput {
  readonly requestId: string;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface ShowNotificationInput {
  readonly title: string;
  readonly body: string;
}

export interface ShowContextMenuInput {
  readonly x: number;
  readonly y: number;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }>;
}

export interface ImportOfficialDataInput {
  readonly sourcePath: string;
}

export type BridgeEventPayloadMap = {
  "connection.changed": ConnectionChangedPayload;
  "notification.received": NotificationEventPayload;
  "serverRequest.received": ServerRequestEventPayload;
  "fatal.error": FatalErrorPayload;
};

export interface HostBridge {
  readonly appServer: {
    start(input?: AppServerStartInput): Promise<void>;
    stop(): Promise<void>;
    restart(input?: AppServerStartInput): Promise<void>;
  };
  readonly rpc: {
    request(input: RpcRequestInput): Promise<RpcRequestOutput>;
    cancel(input: RpcCancelInput): Promise<void>;
  };
  readonly serverRequest: {
    resolve(input: ServerRequestResolveInput): Promise<void>;
  };
  readonly app: {
    openExternal(url: string): Promise<void>;
    openCodexConfigToml(): Promise<void>;
    showNotification(input: ShowNotificationInput): Promise<void>;
    showContextMenu(input: ShowContextMenuInput): Promise<void>;
    importOfficialData(input: ImportOfficialDataInput): Promise<void>;
  };
  subscribe<E extends BridgeEventName>(
    eventName: E,
    handler: (payload: BridgeEventPayloadMap[E]) => void
  ): Promise<() => void>;
}
