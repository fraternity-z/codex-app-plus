import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ActivateCodexChatgptInput,
  AgentEnvironment,
  AgentsSettingsOutput,
  AppServerStartInput,
  BridgeEventName,
  BridgeEventPayloadMap,
  CaptureCodexOauthSnapshotInput,
  ChatgptAuthTokensOutput,
  CodexAuthModeStateOutput,
  CodexAuthSwitchResult,
  CreateAgentInput,
  CustomPromptOutput,
  CodexSessionReadInput,
  CodexSessionReadOutput,
  CodexSessionSearchResultOutput,
  CodexSessionSummaryOutput,
  DeleteAgentInput,
  DeleteCodexSessionInput,
  GitBranchRef,
  GitCheckoutInput,
  GitCommitInput,
  GitDeleteBranchInput,
  GitDiffInput,
  GitDiffOutput,
  GitDiscardInput,
  GitPathsInput,
  GitPushInput,
  GitRemoteInput,
  GitRepoInput,
  GitStatusSnapshotOutput,
  GitWorkspaceDiffOutput,
  GitWorkspaceDiffsInput,
  GitWorktreeAddInput,
  GitWorktreeEntry,
  GitWorktreeRemoveInput,
  GlobalAgentInstructionsOutput,
  GetCodexAuthModeStateInput,
  HostBridge,
  ImportOfficialDataInput,
  ListCodexSessionsInput,
  SearchCodexSessionsInput,
  ReadAgentConfigInput,
  ReadAgentConfigOutput,
  ReadCustomPromptsInput,
  OpenCodexConfigTomlInput,
  OpenFileInEditorInput,
  OpenWorkspaceInput,
  ReadProxySettingsInput,
  ReadProxySettingsOutput,
  RememberCommandApprovalRuleInput,
  RememberCommandApprovalRuleOutput,
  RevealPathInFolderInput,
  WorkspacePersistenceState,
  RpcCancelInput,
  RpcNotifyInput,
  RpcRequestInput,
  RpcRequestOutput,
  ServerRequestResolveInput,
  SetAgentsCoreInput,
  ShowContextMenuInput,
  ShowNotificationInput,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalCreateOutput,
  TerminalResizeInput,
  TerminalWriteInput,
  UpdateAgentInput,
  UpdateChatgptAuthTokensInput,
  UpdateGlobalAgentInstructionsInput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
  WriteAgentConfigInput,
  WriteAgentConfigOutput,
} from "./types";

type TauriPayload = Readonly<Record<string, unknown>>;

function mustDefined<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

function invokeCommand<TResult = void>(
  command: string,
  payload?: TauriPayload
): Promise<TResult> {
  return invoke<TResult>(command, payload);
}

function invokeWithInput<TInput, TResult = void>(
  command: string,
  input: TInput
): Promise<TResult> {
  return invokeCommand<TResult>(command, { input });
}

function invokeWithOptionalInput<TInput extends object, TResult = void>(
  command: string,
  input?: TInput
): Promise<TResult> {
  return invokeCommand<TResult>(command, { input: input ?? {} });
}

export function createTauriHostBridge(): HostBridge {
  return {
    appServer: {
      start: (input?: AppServerStartInput) =>
        invokeWithOptionalInput("app_server_start", input),
      stop: () => invokeCommand("app_server_stop"),
      restart: (input?: AppServerStartInput) =>
        invokeWithOptionalInput("app_server_restart", input)
    },
    rpc: {
      request: (input: RpcRequestInput) =>
        invokeWithInput<RpcRequestInput, RpcRequestOutput>("rpc_request", input),
      notify: (input: RpcNotifyInput) => invokeWithInput("rpc_notify", input),
      cancel: (input: RpcCancelInput) => invokeWithInput("rpc_cancel", input)
    },
    serverRequest: {
      resolve: (input: ServerRequestResolveInput) =>
        invokeWithInput("server_request_resolve", input)
    },
    app: {
      setWindowTheme: (theme) => invokeCommand("app_set_window_theme", { theme }),
      startWindowDragging: () => invokeCommand("app_start_window_dragging"),
      controlWindow: (action) => invokeCommand("app_control_window", { action }),
      openExternal: (url: string) => invokeCommand("app_open_external", { url }),
      openWorkspace: (input: OpenWorkspaceInput) =>
        invokeWithInput("app_open_workspace", input),
      openFileInEditor: (input: OpenFileInEditorInput) =>
        invokeWithInput("app_open_file_in_editor", input),
      openCodexConfigToml: (input: OpenCodexConfigTomlInput) =>
        invokeWithInput("app_open_codex_config_toml", input),
      revealPathInFolder: (input: RevealPathInFolderInput) =>
        invokeWithInput("app_reveal_path_in_folder", input),
      readWorkspaceState: () =>
        invokeCommand<WorkspacePersistenceState | null>("app_read_workspace_state"),
      writeWorkspaceState: (input: WorkspacePersistenceState) =>
        invokeWithInput<WorkspacePersistenceState>("app_write_workspace_state", input),
      listCustomPrompts: (input: ReadCustomPromptsInput) =>
        invokeWithInput<ReadCustomPromptsInput, ReadonlyArray<CustomPromptOutput>>(
          "app_list_custom_prompts",
          input
        ),
      readGlobalAgentInstructions: (input: { readonly agentEnvironment: AgentEnvironment }) =>
        invokeWithInput<
          { readonly agentEnvironment: AgentEnvironment },
          GlobalAgentInstructionsOutput
        >("app_read_global_agent_instructions", input),
      getAgentsSettings: (input: { readonly agentEnvironment?: AgentEnvironment }) =>
        invokeWithInput<{ readonly agentEnvironment?: AgentEnvironment }, AgentsSettingsOutput>(
          "app_get_agents_settings",
          input
        ),
      setAgentsCore: (input: SetAgentsCoreInput) =>
        invokeWithInput<SetAgentsCoreInput, AgentsSettingsOutput>(
          "app_set_agents_core",
          input
        ),
      createAgent: (input: CreateAgentInput) =>
        invokeWithInput<CreateAgentInput, AgentsSettingsOutput>("app_create_agent", input),
      updateAgent: (input: UpdateAgentInput) =>
        invokeWithInput<UpdateAgentInput, AgentsSettingsOutput>("app_update_agent", input),
      deleteAgent: (input: DeleteAgentInput) =>
        invokeWithInput<DeleteAgentInput, AgentsSettingsOutput>("app_delete_agent", input),
      readAgentConfig: (input: ReadAgentConfigInput) =>
        invokeWithInput<ReadAgentConfigInput, ReadAgentConfigOutput>(
          "app_read_agent_config",
          input
        ),
      writeAgentConfig: (input: WriteAgentConfigInput) =>
        invokeWithInput<WriteAgentConfigInput, WriteAgentConfigOutput>(
          "app_write_agent_config",
          input
        ),
      readProxySettings: (input: ReadProxySettingsInput) =>
        invokeWithInput<ReadProxySettingsInput, ReadProxySettingsOutput>(
          "app_read_proxy_settings",
          input
        ),
      writeGlobalAgentInstructions: (input: UpdateGlobalAgentInstructionsInput) =>
        invokeWithInput<
          UpdateGlobalAgentInstructionsInput,
          GlobalAgentInstructionsOutput
        >("app_write_global_agent_instructions", input),
      writeProxySettings: (input: UpdateProxySettingsInput) =>
        invokeWithInput<UpdateProxySettingsInput, UpdateProxySettingsOutput>(
          "app_write_proxy_settings",
          input
        ),
      getCodexAuthModeState: (input: GetCodexAuthModeStateInput) =>
        invokeWithInput<GetCodexAuthModeStateInput, CodexAuthModeStateOutput>(
          "app_get_codex_auth_mode_state",
          input
        ),
      activateCodexChatgpt: (input: ActivateCodexChatgptInput) =>
        invokeWithInput<ActivateCodexChatgptInput, CodexAuthSwitchResult>(
          "app_activate_codex_chatgpt",
          input
        ),
      captureCodexOauthSnapshot: (input: CaptureCodexOauthSnapshotInput) =>
        invokeWithInput<CaptureCodexOauthSnapshotInput, CodexAuthModeStateOutput>(
          "app_capture_codex_oauth_snapshot",
          input
        ),
      readChatgptAuthTokens: () =>
        invokeCommand<ChatgptAuthTokensOutput>("app_read_chatgpt_auth_tokens"),
      writeChatgptAuthTokens: (input: UpdateChatgptAuthTokensInput) =>
        invokeWithInput<UpdateChatgptAuthTokensInput, ChatgptAuthTokensOutput>(
          "app_write_chatgpt_auth_tokens",
          input
        ),
      clearChatgptAuthState: () => invokeCommand("app_clear_chatgpt_auth_state"),
      showNotification: (input: ShowNotificationInput) =>
        invokeWithInput("app_show_notification", input),
      showContextMenu: (input: ShowContextMenuInput) =>
        invokeWithInput("app_show_context_menu", input),
      importOfficialData: (input: ImportOfficialDataInput) =>
        invokeWithInput("app_import_official_data", input),
      listCodexSessions: (input: ListCodexSessionsInput) =>
        invokeWithInput<ListCodexSessionsInput, ReadonlyArray<CodexSessionSummaryOutput>>(
          "app_list_codex_sessions",
          input
        ),
      readCodexSession: (input: CodexSessionReadInput) =>
        invokeWithInput<CodexSessionReadInput, CodexSessionReadOutput>(
          "app_read_codex_session",
          input
        ),
      searchCodexSessions: (input: SearchCodexSessionsInput) =>
        invokeWithInput<SearchCodexSessionsInput, ReadonlyArray<CodexSessionSearchResultOutput>>(
          "app_search_codex_sessions",
          input
        ),
      deleteCodexSession: (input: DeleteCodexSessionInput) =>
        invokeWithInput("app_delete_codex_session", input),
      rememberCommandApprovalRule: (input: RememberCommandApprovalRuleInput) =>
        invokeWithInput<
          RememberCommandApprovalRuleInput,
          RememberCommandApprovalRuleOutput
        >("app_remember_command_approval_rule", input)
    },
    git: {
      getStatusSnapshot: (input: GitRepoInput) =>
        invokeWithInput<GitRepoInput, GitStatusSnapshotOutput>(
          "git_get_status_snapshot",
          input
        ),
      getBranchRefs: (input: GitRepoInput) =>
        invokeWithInput<GitRepoInput, ReadonlyArray<GitBranchRef>>(
          "git_get_branch_refs",
          input
        ),
      getRemoteUrl: (input: GitRemoteInput) =>
        invokeWithInput<GitRemoteInput, string | null>("git_get_remote_url", input),
      getDiff: (input: GitDiffInput) =>
        invokeWithInput<GitDiffInput, GitDiffOutput>("git_get_diff", input),
      getWorkspaceDiffs: (input: GitWorkspaceDiffsInput) =>
        invokeWithInput<GitWorkspaceDiffsInput, ReadonlyArray<GitWorkspaceDiffOutput>>(
          "git_get_workspace_diffs",
          input
        ),
      getWorktrees: (input: GitRepoInput) =>
        invokeWithInput<GitRepoInput, ReadonlyArray<GitWorktreeEntry>>(
          "git_get_worktrees",
          input
        ),
      addWorktree: (input: GitWorktreeAddInput) =>
        invokeWithInput<GitWorktreeAddInput, GitWorktreeEntry>("git_add_worktree", input),
      removeWorktree: (input: GitWorktreeRemoveInput) =>
        invokeWithInput("git_remove_worktree", input),
      initRepository: (input: GitRepoInput) =>
        invokeWithInput("git_init_repository", input),
      stagePaths: (input: GitPathsInput) => invokeWithInput("git_stage_paths", input),
      unstagePaths: (input: GitPathsInput) => invokeWithInput("git_unstage_paths", input),
      discardPaths: (input: GitDiscardInput) => invokeWithInput("git_discard_paths", input),
      commit: (input: GitCommitInput) => invokeWithInput("git_commit", input),
      fetch: (input: GitRepoInput) => invokeWithInput("git_fetch", input),
      pull: (input: GitRepoInput) => invokeWithInput("git_pull", input),
      push: (input: GitPushInput) => invokeWithInput("git_push", input),
      checkout: (input: GitCheckoutInput) => invokeWithInput("git_checkout", input),
      deleteBranch: (input: GitDeleteBranchInput) =>
        invokeWithInput("git_delete_branch", input)
    },
    terminal: {
      createSession: (input: TerminalCreateInput) =>
        invokeWithInput<TerminalCreateInput, TerminalCreateOutput>(
          "terminal_create_session",
          input
        ),
      write: (input: TerminalWriteInput) => invokeWithInput("terminal_write", input),
      resize: (input: TerminalResizeInput) => invokeWithInput("terminal_resize", input),
      closeSession: (input: TerminalCloseInput) =>
        invokeWithInput("terminal_close_session", input)
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
