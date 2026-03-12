import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppServerStartInput,
  AgentEnvironment,
  OpenCodexConfigTomlInput,
  ApplyCodexProviderInput,
  BridgeEventName,
  BridgeEventPayloadMap,
  CodexProviderApplyResult,
  CodexProviderDraft,
  CodexProviderRecord,
  CodexProviderStore,
  DeleteCodexSessionInput,
  DeleteCodexProviderInput,
  GitCheckoutInput,
  GitCommitInput,
  GitDiffInput,
  GitDiffOutput,
  GitDiscardInput,
  GitPathsInput,
  GitRepoInput,
  ChatgptAuthTokensOutput,
  GlobalAgentInstructionsOutput,
  GitStatusOutput,
  HostBridge,
  OpenWorkspaceInput,
  ImportOfficialDataInput,
  UpdateChatgptAuthTokensInput,
  UpdateGlobalAgentInstructionsInput,
  CodexSessionReadInput,
  CodexSessionReadOutput,
  CodexSessionSummaryOutput,
  RpcCancelInput,
  RpcNotifyInput,
  RpcRequestInput,
  RpcRequestOutput,
  ServerRequestResolveInput,
  ShowContextMenuInput,
  ShowNotificationInput,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalCreateOutput,
  TerminalResizeInput,
  TerminalWriteInput
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
      notify: (input: RpcNotifyInput) =>
        invoke("rpc_notify", {
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
      openWorkspace: (input: OpenWorkspaceInput) =>
        invoke("app_open_workspace", {
          input
        }),
      openCodexConfigToml: (input: OpenCodexConfigTomlInput) =>
        invoke("app_open_codex_config_toml", {
          input
        }),
      readGlobalAgentInstructions: (input: { readonly agentEnvironment: AgentEnvironment }) =>
        invoke<GlobalAgentInstructionsOutput>("app_read_global_agent_instructions", {
          input
        }),
      writeGlobalAgentInstructions: (input: UpdateGlobalAgentInstructionsInput) =>
        invoke<GlobalAgentInstructionsOutput>("app_write_global_agent_instructions", {
          input
        }),
      listCodexProviders: () =>
        invoke<CodexProviderStore>("app_list_codex_providers"),
      upsertCodexProvider: (input: CodexProviderDraft) =>
        invoke<CodexProviderRecord>("app_upsert_codex_provider", {
          input
        }),
      deleteCodexProvider: (input: DeleteCodexProviderInput) =>
        invoke<CodexProviderStore>("app_delete_codex_provider", {
          input
        }),
      applyCodexProvider: (input: ApplyCodexProviderInput) =>
        invoke<CodexProviderApplyResult>("app_apply_codex_provider", {
          input
        }),
      readChatgptAuthTokens: () =>
        invoke<ChatgptAuthTokensOutput>("app_read_chatgpt_auth_tokens"),
      writeChatgptAuthTokens: (input: UpdateChatgptAuthTokensInput) =>
        invoke<ChatgptAuthTokensOutput>("app_write_chatgpt_auth_tokens", {
          input
        }),
      clearChatgptAuthState: () =>
        invoke("app_clear_chatgpt_auth_state"),
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
        }),
      listCodexSessions: () =>
        invoke<ReadonlyArray<CodexSessionSummaryOutput>>("app_list_codex_sessions"),
      readCodexSession: (input: CodexSessionReadInput) =>
        invoke<CodexSessionReadOutput>("app_read_codex_session", {
          input
        }),
      deleteCodexSession: (input: DeleteCodexSessionInput) =>
        invoke("app_delete_codex_session", {
          input
        })
    },
    git: {
      getStatus: (input: GitRepoInput) =>
        invoke<GitStatusOutput>("git_get_status", {
          input
        }),
      getDiff: (input: GitDiffInput) =>
        invoke<GitDiffOutput>("git_get_diff", {
          input
        }),
      initRepository: (input: GitRepoInput) =>
        invoke("git_init_repository", {
          input
        }),
      stagePaths: (input: GitPathsInput) =>
        invoke("git_stage_paths", {
          input
        }),
      unstagePaths: (input: GitPathsInput) =>
        invoke("git_unstage_paths", {
          input
        }),
      discardPaths: (input: GitDiscardInput) =>
        invoke("git_discard_paths", {
          input
        }),
      commit: (input: GitCommitInput) =>
        invoke("git_commit", {
          input
        }),
      fetch: (input: GitRepoInput) =>
        invoke("git_fetch", {
          input
        }),
      pull: (input: GitRepoInput) =>
        invoke("git_pull", {
          input
        }),
      push: (input: GitRepoInput) =>
        invoke("git_push", {
          input
        }),
      checkout: (input: GitCheckoutInput) =>
        invoke("git_checkout", {
          input
        })
    },
    terminal: {
      createSession: (input?: TerminalCreateInput) =>
        invoke<TerminalCreateOutput>("terminal_create_session", {
          input: input ?? {}
        }),
      write: (input: TerminalWriteInput) =>
        invoke("terminal_write", {
          input
        }),
      resize: (input: TerminalResizeInput) =>
        invoke("terminal_resize", {
          input
        }),
      closeSession: (input: TerminalCloseInput) =>
        invoke("terminal_close_session", {
          input
        })
    },
    subscribe: async <E extends BridgeEventName>(
      eventName: E,
      handler: (payload: BridgeEventPayloadMap[E]) => void
    ) => {
      const unlisten = await listen<BridgeEventPayloadMap[E]>(eventName, (event) => {
        handler(mustDefined(event.payload, `${eventName} payload 不能为空`));
      });
      return unlisten;
    }
  };
}
