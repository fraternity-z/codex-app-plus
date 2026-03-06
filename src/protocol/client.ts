import type { HostBridge } from "../bridge/types";
import { parseConnectionStatus, parseNotificationEnvelope, parseServerRequestEnvelope } from "./guards";
import type { ClientRequest } from "./generated/ClientRequest";
import type { InitializeParams } from "./generated/InitializeParams";

type ClientMethod = ClientRequest["method"];
type ParamsByMethod<M extends ClientMethod> = Extract<ClientRequest, { method: M }> extends {
  params: infer Params;
}
  ? Params
  : never;

type ProtocolHandlers = {
  onConnectionChanged: (status: "disconnected" | "connecting" | "connected" | "error") => void;
  onNotification: (method: string, params: unknown) => void;
  onServerRequest: (id: string, method: string, params: unknown) => void;
  onFatalError: (message: string) => void;
};

function normalizeRequestParams(params: unknown): unknown {
  return params === undefined ? null : params;
}

export class ProtocolClient {
  readonly #hostBridge: HostBridge;
  readonly #handlers: ProtocolHandlers;
  readonly #unsubscribers: Array<() => void> = [];
  #initialized = false;

  constructor(hostBridge: HostBridge, handlers: ProtocolHandlers) {
    this.#hostBridge = hostBridge;
    this.#handlers = handlers;
  }

  async attach(): Promise<void> {
    const unlistenConnection = await this.#hostBridge.subscribe("connection-changed", (payload) => {
      this.#handlers.onConnectionChanged(parseConnectionStatus(payload.status));
    });
    const unlistenNotification = await this.#hostBridge.subscribe("notification-received", (payload) => {
      const envelope = parseNotificationEnvelope(payload);
      this.#handlers.onNotification(envelope.method, envelope.params);
    });
    const unlistenServerRequest = await this.#hostBridge.subscribe("server-request-received", (payload) => {
      const envelope = parseServerRequestEnvelope(payload);
      this.#handlers.onServerRequest(envelope.id, envelope.method, envelope.params);
    });
    const unlistenFatal = await this.#hostBridge.subscribe("fatal-error", (payload) => {
      this.#handlers.onFatalError(payload.message);
    });
    this.#unsubscribers.push(unlistenConnection, unlistenNotification, unlistenServerRequest, unlistenFatal);
  }

  detach(): void {
    while (this.#unsubscribers.length > 0) {
      this.#unsubscribers.pop()?.();
    }
  }

  startAppServer(codexPath?: string): Promise<void> {
    this.#initialized = false;
    return this.#hostBridge.appServer.start({ codexPath });
  }

  restartAppServer(codexPath?: string): Promise<void> {
    this.#initialized = false;
    return this.#hostBridge.appServer.restart({ codexPath });
  }

  stopAppServer(): Promise<void> {
    this.#initialized = false;
    return this.#hostBridge.appServer.stop();
  }

  async initializeConnection(params: InitializeParams): Promise<void> {
    if (this.#initialized) {
      return;
    }
    await this.requestRaw("initialize", params);
    await this.notify("initialized", {});
    this.#initialized = true;
  }

  async request<M extends ClientMethod>(method: M, params: ParamsByMethod<M>): Promise<unknown> {
    if (!this.#initialized) {
      throw new Error(`Codex app-server 尚未完成 initialize/initialized 握手，无法调用 ${method}`);
    }
    return this.requestRaw(method, params);
  }

  resolveServerRequest(requestId: string, result: unknown): Promise<void> {
    return this.#hostBridge.serverRequest.resolve({
      requestId,
      result
    });
  }

  rejectServerRequest(requestId: string, code: number, message: string): Promise<void> {
    return this.#hostBridge.serverRequest.resolve({
      requestId,
      error: {
        code,
        message
      }
    });
  }

  private async requestRaw(method: string, params: unknown): Promise<unknown> {
    const response = await this.#hostBridge.rpc.request({
      method,
      params: normalizeRequestParams(params)
    });
    return response.result;
  }

  private notify(method: string, params?: unknown): Promise<void> {
    return this.#hostBridge.rpc.notify({ method, params });
  }
}
