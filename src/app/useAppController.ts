import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HostBridge } from "../bridge/types";
import type { TimelineItem } from "../domain/types";
import type { InitializeParams } from "../protocol/generated/InitializeParams";
import type { ModelListParams } from "../protocol/generated/v2/ModelListParams";
import type { ModelListResponse } from "../protocol/generated/v2/ModelListResponse";
import type { ThreadListParams } from "../protocol/generated/v2/ThreadListParams";
import type { ThreadListResponse } from "../protocol/generated/v2/ThreadListResponse";
import type { ThreadStartParams } from "../protocol/generated/v2/ThreadStartParams";
import type { ThreadStartResponse } from "../protocol/generated/v2/ThreadStartResponse";
import type { TurnStartParams } from "../protocol/generated/v2/TurnStartParams";
import { ProtocolClient } from "../protocol/client";
import { mapModelListResponse, mapThreadListResponse } from "../protocol/mappers";
import { useAppStore } from "../state/store";

const APP_VERSION = "0.1.0";
const OFFICIAL_DATA_PATH = "C:\\Users\\%USERNAME%\\AppData\\Local\\Packages\\OpenAI.Codex_2p2nqsd0c76g0";

function makeSystemItem(text: string): TimelineItem {
  return {
    id: crypto.randomUUID(),
    role: "system",
    text
  };
}

function parseDelta(method: string, params: unknown): TimelineItem | null {
  if (method !== "item/agentMessage/delta") {
    return null;
  }
  const payload = params as { threadId?: string; delta?: string } | undefined;
  if (payload?.delta === undefined || payload.threadId === undefined) {
    return null;
  }
  return {
    id: `${payload.threadId}-${crypto.randomUUID()}`,
    role: "assistant",
    text: payload.delta
  };
}

interface AppController {
  readonly state: ReturnType<typeof useAppStore>["state"];
  setView: (view: ReturnType<typeof useAppStore>["state"]["activeView"]) => void;
  setInput: (text: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  initialize: () => Promise<void>;
  login: () => Promise<void>;
  loadThreads: () => Promise<void>;
  loadModels: () => Promise<void>;
  readConfig: () => Promise<void>;
  createThread: () => Promise<void>;
  sendTurn: () => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  importOfficialData: () => Promise<void>;
  selectThread: (threadId: string) => void;
}

export function useAppController(hostBridge: HostBridge): AppController {
  const { state, dispatch } = useAppStore();
  const clientRef = useRef<ProtocolClient | null>(null);

  const runBusy = useCallback(
    async (runner: () => Promise<void>) => {
      dispatch({ type: "busy/changed", busy: true });
      try {
        await runner();
      } finally {
        dispatch({ type: "busy/changed", busy: false });
      }
    },
    [dispatch]
  );

  const client = useMemo(() => {
    if (clientRef.current !== null) {
      return clientRef.current;
    }
    clientRef.current = new ProtocolClient(hostBridge, {
      onConnectionChanged: (status) => dispatch({ type: "connection/changed", status }),
      onNotification: (method, params) => {
        dispatch({ type: "notification/received", notification: { method, params } });
        const deltaItem = parseDelta(method, params);
        if (deltaItem !== null) {
          dispatch({ type: "timeline/appended", item: deltaItem });
        }
      },
      onServerRequest: (id, method, params) =>
        dispatch({ type: "serverRequest/received", request: { id, method, params } }),
      onFatalError: (message) => dispatch({ type: "fatal/error", message })
    });
    return clientRef.current;
  }, [dispatch, hostBridge]);

  useEffect(() => {
    void client.attach();
    return () => {
      client.detach();
    };
  }, [client]);

  const start = useCallback(() => runBusy(() => client.startAppServer()), [client, runBusy]);

  const stop = useCallback(() => runBusy(() => client.stopAppServer()), [client, runBusy]);

  const initialize = useCallback(async () => {
    await runBusy(async () => {
      const params: InitializeParams = {
        clientInfo: {
          name: "codex-app-plus",
          title: "Codex App Plus",
          version: APP_VERSION
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null
        }
      };
      await client.request("initialize", params);
      dispatch({ type: "timeline/appended", item: makeSystemItem("initialize 完成") });
    });
  }, [client, dispatch, runBusy]);

  const login = useCallback(async () => {
    await runBusy(async () => {
      await client.request("account/login/start", { type: "chatgpt" });
      dispatch({ type: "timeline/appended", item: makeSystemItem("已触发 ChatGPT 登录流程") });
    });
  }, [client, dispatch, runBusy]);

  const loadThreads = useCallback(async () => {
    await runBusy(async () => {
      const params: ThreadListParams = { archived: false };
      const response = (await client.request("thread/list", params)) as ThreadListResponse;
      const threads = mapThreadListResponse(response);
      dispatch({ type: "threads/loaded", threads });
      dispatch({ type: "timeline/appended", item: makeSystemItem(`线程数量: ${threads.length}`) });
    });
  }, [client, dispatch, runBusy]);

  const loadModels = useCallback(async () => {
    await runBusy(async () => {
      const params: ModelListParams = {};
      const response = (await client.request("model/list", params)) as ModelListResponse;
      dispatch({ type: "models/loaded", models: mapModelListResponse(response) });
    });
  }, [client, dispatch, runBusy]);

  const readConfig = useCallback(async () => {
    await runBusy(async () => {
      const config = await client.request("config/read", {
        includeLayers: true
      });
      dispatch({ type: "config/loaded", config });
    });
  }, [client, dispatch, runBusy]);

  const createThread = useCallback(async () => {
    await runBusy(async () => {
      const params: ThreadStartParams = {
        experimentalRawEvents: false,
        persistExtendedHistory: true
      };
      const response = (await client.request("thread/start", params)) as ThreadStartResponse;
      dispatch({ type: "thread/selected", threadId: response.thread.id });
      dispatch({ type: "timeline/appended", item: makeSystemItem(`已创建线程 ${response.thread.id}`) });
    });
  }, [client, dispatch, runBusy]);

  const sendTurn = useCallback(async () => {
    const threadId = state.selectedThreadId;
    const text = state.inputText.trim();
    if (threadId === null || text.length === 0) {
      return;
    }
    await runBusy(async () => {
      const params: TurnStartParams = {
        threadId,
        input: [
          {
            type: "text",
            text,
            text_elements: []
          }
        ]
      };
      await client.request("turn/start", params);
      dispatch({
        type: "timeline/appended",
        item: {
          id: crypto.randomUUID(),
          role: "user",
          text
        }
      });
      dispatch({ type: "input/changed", value: "" });
    });
  }, [client, dispatch, runBusy, state.inputText, state.selectedThreadId]);

  const approveRequest = useCallback(
    async (requestId: string) => {
      await runBusy(async () => {
        await client.resolveServerRequest(requestId, { approved: true });
        dispatch({ type: "serverRequest/resolved", requestId });
      });
    },
    [client, dispatch, runBusy]
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      await runBusy(async () => {
        await client.rejectServerRequest(requestId, 4001, "Rejected by user");
        dispatch({ type: "serverRequest/resolved", requestId });
      });
    },
    [client, dispatch, runBusy]
  );

  const importOfficialData = useCallback(async () => {
    await runBusy(async () => {
      await hostBridge.app.importOfficialData({
        sourcePath: OFFICIAL_DATA_PATH
      });
      dispatch({ type: "timeline/appended", item: makeSystemItem("官方数据导入完成") });
    });
  }, [dispatch, hostBridge.app, runBusy]);

  return {
    state,
    setView: (view) => dispatch({ type: "view/changed", view }),
    setInput: (text) => dispatch({ type: "input/changed", value: text }),
    start,
    stop,
    initialize,
    login,
    loadThreads,
    loadModels,
    readConfig,
    createThread,
    sendTurn,
    approveRequest,
    rejectRequest,
    importOfficialData,
    selectThread: (threadId) => dispatch({ type: "thread/selected", threadId })
  };
}
