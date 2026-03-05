import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppServerStartInput,
  BridgeEventName,
  BridgeEventPayloadMap,
  HostBridge,
  ImportOfficialDataInput,
  RpcCancelInput,
  RpcRequestInput,
  RpcRequestOutput,
  ServerRequestResolveInput,
  ShowContextMenuInput,
  ShowNotificationInput
} from "./types";

function mustDefined<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

export function createTauriHostBridge(): HostBridge {
  return {
    appServer: {
      start: (input?: AppServerStartInput) =>
        invoke("app_server_start", {
          input: input ?? {}
        }),
      stop: () => invoke("app_server_stop"),
      restart: (input?: AppServerStartInput) =>
        invoke("app_server_restart", {
          input: input ?? {}
        })
    },
    rpc: {
      request: (input: RpcRequestInput) =>
        invoke<RpcRequestOutput>("rpc_request", {
          input
        }),
      cancel: (input: RpcCancelInput) =>
        invoke("rpc_cancel", {
          input
        })
    },
    serverRequest: {
      resolve: (input: ServerRequestResolveInput) =>
        invoke("server_request_resolve", {
          input
        })
    },
    app: {
      openExternal: (url: string) =>
        invoke("app_open_external", {
          url
        }),
      openCodexConfigToml: () =>
        invoke("app_open_codex_config_toml"),
      showNotification: (input: ShowNotificationInput) =>
        invoke("app_show_notification", {
          input
        }),
      showContextMenu: (input: ShowContextMenuInput) =>
        invoke("app_show_context_menu", {
          input
        }),
      importOfficialData: (input: ImportOfficialDataInput) =>
        invoke("app_import_official_data", {
          input
        })
    },
    subscribe: async <E extends BridgeEventName>(
      eventName: E,
      handler: (payload: BridgeEventPayloadMap[E]) => void
    ) => {
      const unlisten = await listen<BridgeEventPayloadMap[E]>(eventName, (event) => {
        handler(mustDefined(event.payload, `${eventName} payload 为空`));
      });
      return unlisten;
    }
  };
}
