import type { HostBridge } from "../../../bridge/types";
import type { ClientRequest } from "../../../protocol/generated/ClientRequest";
import type { FuzzyFileSearchSessionStartParams } from "../../../protocol/generated/FuzzyFileSearchSessionStartParams";
import type { FuzzyFileSearchSessionStopParams } from "../../../protocol/generated/FuzzyFileSearchSessionStopParams";
import type { FuzzyFileSearchSessionUpdateParams } from "../../../protocol/generated/FuzzyFileSearchSessionUpdateParams";

type ClientMethod = ClientRequest["method"];
type ParamsByMethod<M extends ClientMethod> = Extract<ClientRequest, { method: M }> extends {
  params: infer Params;
}
  ? Params
  : never;

export interface ComposerCommandBridge {
  startFuzzySession(params: FuzzyFileSearchSessionStartParams): Promise<void>;
  updateFuzzySession(params: FuzzyFileSearchSessionUpdateParams): Promise<void>;
  stopFuzzySession(params: FuzzyFileSearchSessionStopParams): Promise<void>;
  request<M extends ClientMethod>(method: M, params: ParamsByMethod<M>): Promise<unknown>;
}

export const COMPOSER_FUZZY_SESSION_PREFIX = "composer:";

export function createComposerCommandBridge(hostBridge: HostBridge): ComposerCommandBridge {
  return {
    startFuzzySession: async (params) => {
      await hostBridge.rpc.request({ method: "fuzzyFileSearch/sessionStart", params });
    },
    updateFuzzySession: async (params) => {
      await hostBridge.rpc.request({ method: "fuzzyFileSearch/sessionUpdate", params });
    },
    stopFuzzySession: async (params) => {
      await hostBridge.rpc.request({ method: "fuzzyFileSearch/sessionStop", params });
    },
    request: async (method, params) => {
      const response = await hostBridge.rpc.request({ method, params });
      return response.result;
    },
  };
}

export function createComposerFuzzySessionId(): string {
  return `${COMPOSER_FUZZY_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isComposerFuzzySessionId(sessionId: string): boolean {
  return sessionId.startsWith(COMPOSER_FUZZY_SESSION_PREFIX);
}
