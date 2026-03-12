import type { AppServerStartInput, BridgeEventName, BridgeEventPayloadMap, HostBridge } from "../bridge/types";
import { parseConnectionStatus, parseNotificationEnvelope, parseServerRequestEnvelope } from "./guards";
import type { ClientRequest } from "./generated/ClientRequest";
import type { InitializeParams } from "./generated/InitializeParams";
import type { RequestId } from "./generated/RequestId";
import type { ThreadBackgroundTerminalsCleanResponse } from "./generated/v2/ThreadBackgroundTerminalsCleanResponse";
import type { ThreadUnsubscribeResponse } from "./generated/v2/ThreadUnsubscribeResponse";

type ClientMethod = ClientRequest["method"];
type ParamsByMethod<M extends ClientMethod> = Extract<ClientRequest, { method: M }> extends {
  params: infer Params;
}
  ? Params
  : never;

type ProtocolHandlers = {
  onConnectionChanged: (status: "disconnected" | "connecting" | "connected" | "error") => void;
  onNotification: (method: string, params: unknown) => void;
  onServerRequest: (id: RequestId, method: string, params: unknown) => void;
  onFatalError: (message: string) => void;
};

type AttachPhase = "idle" | "attaching" | "attached";

function normalizeRequestParams(params: unknown): unknown {
  return params === undefined ? null : params;
}

export class ProtocolClient {
  readonly #hostBridge: HostBridge;
  readonly #handlers: ProtocolHandlers;
  readonly #unsubscribers: Array<() => void> = [];
  #attachPhase: AttachPhase = "idle";
  #attachToken = 0;
  #attachPromise: Promise<void> | null = null;
  #initialized = false;

  constructor(hostBridge: HostBridge, handlers: ProtocolHandlers) {
    this.#hostBridge = hostBridge;
    this.#handlers = handlers;
  }

  async attach(): Promise<void> {
    if (this.#attachPhase === "attached") {
      return;
    }
    if (this.#attachPromise !== null) {
      await this.#attachPromise;
      return;
    }
    const token = ++this.#attachToken;
    this.#attachPhase = "attaching";
    this.#attachPromise = this.#runAttach(token);
    await this.#attachPromise;
  }

  detach(): void {
    this.#attachToken += 1;
    this.#attachPhase = "idle";
    this.#attachPromise = null;
    this.#clearUnsubscribers();
  }

  startAppServer(input?: AppServerStartInput): Promise<void> {
    this.#initialized = false;
    return this.#hostBridge.appServer.start(input);
  }

  restartAppServer(input?: AppServerStartInput): Promise<void> {
    this.#initialized = false;
    return this.#hostBridge.appServer.restart(input);
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

  cleanThreadBackgroundTerminals(threadId: string): Promise<ThreadBackgroundTerminalsCleanResponse> {
    return this.request("thread/backgroundTerminals/clean", { threadId }) as Promise<ThreadBackgroundTerminalsCleanResponse>;
  }

  unsubscribeThread(threadId: string): Promise<ThreadUnsubscribeResponse> {
    return this.request("thread/unsubscribe", { threadId }) as Promise<ThreadUnsubscribeResponse>;
  }

  resolveServerRequest(requestId: RequestId, result: unknown): Promise<void> {
    return this.#hostBridge.serverRequest.resolve({
      requestId,
      result
    });
  }

  rejectServerRequest(requestId: RequestId, code: number, message: string): Promise<void> {
    return this.#hostBridge.serverRequest.resolve({
      requestId,
      error: {
        code,
        message
      }
    });
  }

  async #runAttach(token: number): Promise<void> {
    try {
      if (!(await this.#attachSubscription(token, "connection-changed", (payload) => {
        this.#handlers.onConnectionChanged(parseConnectionStatus(payload.status));
      }))) {
        return;
      }
      if (!(await this.#attachSubscription(token, "notification-received", (payload) => {
        const envelope = parseNotificationEnvelope(payload);
        this.#handlers.onNotification(envelope.method, envelope.params);
      }))) {
        return;
      }
      if (!(await this.#attachSubscription(token, "server-request-received", (payload) => {
        const envelope = parseServerRequestEnvelope(payload);
        this.#handlers.onServerRequest(envelope.id, envelope.method, envelope.params);
      }))) {
        return;
      }
      if (!(await this.#attachSubscription(token, "fatal-error", (payload) => {
        this.#handlers.onFatalError(payload.message);
      }))) {
        return;
      }
      if (this.#isAttachTokenActive(token)) {
        this.#attachPhase = "attached";
      }
    } catch (error) {
      if (this.#isAttachTokenActive(token)) {
        this.#attachPhase = "idle";
      }
      throw error;
    } finally {
      if (this.#isAttachTokenActive(token)) {
        this.#attachPromise = null;
      }
    }
  }

  async #attachSubscription<E extends BridgeEventName>(
    token: number,
    eventName: E,
    handler: (payload: BridgeEventPayloadMap[E]) => void,
  ): Promise<boolean> {
    if (!this.#isAttachTokenActive(token)) {
      return false;
    }
    const unlisten = await this.#hostBridge.subscribe(eventName, handler);
    return this.#storeUnsubscriber(token, unlisten);
  }

  #storeUnsubscriber(token: number, unlisten: () => void): boolean {
    if (!this.#isAttachTokenActive(token)) {
      unlisten();
      return false;
    }
    this.#unsubscribers.push(unlisten);
    return true;
  }

  #isAttachTokenActive(token: number): boolean {
    return this.#attachToken === token;
  }

  #clearUnsubscribers(): void {
    while (this.#unsubscribers.length > 0) {
      this.#unsubscribers.pop()?.();
    }
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
