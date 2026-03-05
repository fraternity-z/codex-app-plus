import type { HostBridge } from "../bridge/types";
import { parseConnectionStatus, parseNotificationEnvelope, parseServerRequestEnvelope } from "./guards";
import type { ClientRequest } from "./generated/ClientRequest";

type ClientMethod = ClientRequest["method"];
type ParamsByMethod<M extends ClientMethod> = Extract<ClientRequest, { method: M }>["params"];

type ProtocolHandlers = {
  onConnectionChanged: (status: "disconnected" | "connecting" | "connected" | "error") => void;
  onNotification: (method: string, params: unknown) => void;
  onServerRequest: (id: string, method: string, params: unknown) => void;
  onFatalError: (message: string) => void;
};

export class ProtocolClient {
  readonly #hostBridge: HostBridge;
  readonly #handlers: ProtocolHandlers;
  readonly #unsubscribers: Array<() => void> = [];

  constructor(hostBridge: HostBridge, handlers: ProtocolHandlers) {
    this.#hostBridge = hostBridge;
    this.#handlers = handlers;
  }

  async attach(): Promise<void> {
    const unlistenConnection = await this.#hostBridge.subscribe("connection.changed", (payload) => {
      this.#handlers.onConnectionChanged(parseConnectionStatus(payload.status));
    });
    const unlistenNotification = await this.#hostBridge.subscribe("notification.received", (payload) => {
      const envelope = parseNotificationEnvelope(payload);
      this.#handlers.onNotification(envelope.method, envelope.params);
    });
    const unlistenServerRequest = await this.#hostBridge.subscribe("serverRequest.received", (payload) => {
      const envelope = parseServerRequestEnvelope(payload);
      this.#handlers.onServerRequest(envelope.id, envelope.method, envelope.params);
    });
    const unlistenFatal = await this.#hostBridge.subscribe("fatal.error", (payload) => {
      this.#handlers.onFatalError(payload.message);
    });
    this.#unsubscribers.push(unlistenConnection, unlistenNotification, unlistenServerRequest, unlistenFatal);
  }

  detach(): void {
    while (this.#unsubscribers.length > 0) {
      const fn = this.#unsubscribers.pop();
      if (fn) {
        fn();
      }
    }
  }

  startAppServer(codexPath?: string): Promise<void> {
    return this.#hostBridge.appServer.start({ codexPath });
  }

  stopAppServer(): Promise<void> {
    return this.#hostBridge.appServer.stop();
  }

  async request<M extends ClientMethod>(method: M, params: ParamsByMethod<M>): Promise<unknown> {
    const response = await this.#hostBridge.rpc.request({
      method,
      params
    });
    return response.result;
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
}
