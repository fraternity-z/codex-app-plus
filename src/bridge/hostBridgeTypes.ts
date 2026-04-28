import type {
  ActivateCodexChatgptInput,
  AgentsSettingsOutput,
  AppServerStartInput,
  BrowserOpenInput,
  BrowserSidebarBoundsInput,
  BrowserSidebarOpenInput,
  BrowserUseApprovalModeInput,
  BrowserUseOriginInput,
  BrowserUseSettingsOutput,
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
  DeleteManagedPromptInput,
  DeleteCodexSessionInput,
  GlobalAgentInstructionsOutput,
  GetCodexAuthModeStateInput,
  ImportOfficialDataInput,
  ListCodexSessionsInput,
  ListManagedPromptsInput,
  ManagedPromptOutput,
  SearchCodexSessionsInput,
  ReadAgentConfigInput,
  ReadAgentConfigOutput,
  ReadCustomPromptsInput,
  OpenCodexConfigTomlInput,
  OpenFileInEditorInput,
  OpenWorkspaceInput,
  ReadProxySettingsInput,
  ReadProxySettingsOutput,
  RevealPathInFolderInput,
  RpcCancelInput,
  RpcNotifyInput,
  RpcRequestInput,
  RpcRequestOutput,
  RememberCommandApprovalRuleInput,
  RememberCommandApprovalRuleOutput,
  WorkspacePersistenceState,
  ServerRequestResolveInput,
  SetAgentsCoreInput,
  ShowContextMenuInput,
  ShowNotificationInput,
  UpdateAgentInput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
  WindowChromeAction,
  WindowTheme,
  SetUserModelInstructionsFileInput,
  UpdateChatgptAuthTokensInput,
  UpdateGlobalAgentInstructionsInput,
  UpsertManagedPromptInput,
  WriteAgentConfigInput,
  WriteAgentConfigOutput,
} from "./appTypes";
import type { BridgeEventName, BridgeEventPayloadMap } from "./eventTypes";
import type {
  GitBranchRef,
  GitCheckoutInput,
  GitCommitInput,
  GitGenerateCommitMessageInput,
  GitGenerateCommitMessageOutput,
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
} from "./gitTypes";
import type {
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalCreateOutput,
  TerminalResizeInput,
  TerminalWriteInput,
} from "./terminalTypes";
import type { AgentEnvironment } from "./sharedTypes";

export interface HostBridge {
  readonly appServer: {
    start(input?: AppServerStartInput): Promise<void>;
    stop(): Promise<void>;
    restart(input?: AppServerStartInput): Promise<void>;
  };
  readonly rpc: {
    request(input: RpcRequestInput): Promise<RpcRequestOutput>;
    notify(input: RpcNotifyInput): Promise<void>;
    cancel(input: RpcCancelInput): Promise<void>;
  };
  readonly serverRequest: {
    resolve(input: ServerRequestResolveInput): Promise<void>;
  };
  readonly app: {
    setWindowTheme(theme: WindowTheme): Promise<void>;
    startWindowDragging(): Promise<void>;
    controlWindow(action: WindowChromeAction): Promise<void>;
    openExternal(url: string): Promise<void>;
    openWorkspace(input: OpenWorkspaceInput): Promise<void>;
    openFileInEditor(input: OpenFileInEditorInput): Promise<void>;
    openBrowser(input: BrowserOpenInput): Promise<void>;
    openBrowserSidebar(input: BrowserSidebarOpenInput): Promise<void>;
    updateBrowserSidebarBounds(input: BrowserSidebarBoundsInput): Promise<void>;
    hideBrowserSidebar(): Promise<void>;
    clearBrowserBrowsingData(): Promise<void>;
    readBrowserUseSettings(): Promise<BrowserUseSettingsOutput>;
    writeBrowserUseApprovalMode(
      input: BrowserUseApprovalModeInput
    ): Promise<BrowserUseSettingsOutput>;
    addBrowserUseOrigin(input: BrowserUseOriginInput): Promise<BrowserUseSettingsOutput>;
    removeBrowserUseOrigin(input: BrowserUseOriginInput): Promise<BrowserUseSettingsOutput>;
    openCodexConfigToml(input: OpenCodexConfigTomlInput): Promise<void>;
    revealPathInFolder(input: RevealPathInFolderInput): Promise<void>;
    readWorkspaceState(): Promise<WorkspacePersistenceState | null>;
    writeWorkspaceState(input: WorkspacePersistenceState): Promise<void>;
    listCustomPrompts(input: ReadCustomPromptsInput): Promise<ReadonlyArray<CustomPromptOutput>>;
    listManagedPrompts(input: ListManagedPromptsInput): Promise<ReadonlyArray<ManagedPromptOutput>>;
    upsertManagedPrompt(input: UpsertManagedPromptInput): Promise<ManagedPromptOutput>;
    deleteManagedPrompt(input: DeleteManagedPromptInput): Promise<void>;
    setUserModelInstructionsFile(input: SetUserModelInstructionsFileInput): Promise<void>;
    readGlobalAgentInstructions(input: {
      readonly agentEnvironment: AgentEnvironment;
    }): Promise<GlobalAgentInstructionsOutput>;
    getAgentsSettings(input: { readonly agentEnvironment?: AgentEnvironment }): Promise<AgentsSettingsOutput>;
    setAgentsCore(input: SetAgentsCoreInput): Promise<AgentsSettingsOutput>;
    createAgent(input: CreateAgentInput): Promise<AgentsSettingsOutput>;
    updateAgent(input: UpdateAgentInput): Promise<AgentsSettingsOutput>;
    deleteAgent(input: DeleteAgentInput): Promise<AgentsSettingsOutput>;
    readAgentConfig(input: ReadAgentConfigInput): Promise<ReadAgentConfigOutput>;
    writeAgentConfig(input: WriteAgentConfigInput): Promise<WriteAgentConfigOutput>;
    readProxySettings(input: ReadProxySettingsInput): Promise<ReadProxySettingsOutput>;
    writeGlobalAgentInstructions(
      input: UpdateGlobalAgentInstructionsInput
    ): Promise<GlobalAgentInstructionsOutput>;
    writeProxySettings(input: UpdateProxySettingsInput): Promise<UpdateProxySettingsOutput>;
    getCodexAuthModeState(input: GetCodexAuthModeStateInput): Promise<CodexAuthModeStateOutput>;
    activateCodexChatgpt(input: ActivateCodexChatgptInput): Promise<CodexAuthSwitchResult>;
    captureCodexOauthSnapshot(
      input: CaptureCodexOauthSnapshotInput
    ): Promise<CodexAuthModeStateOutput>;
    readChatgptAuthTokens(): Promise<ChatgptAuthTokensOutput>;
    writeChatgptAuthTokens(input: UpdateChatgptAuthTokensInput): Promise<ChatgptAuthTokensOutput>;
    clearChatgptAuthState(): Promise<void>;
    showNotification(input: ShowNotificationInput): Promise<void>;
    showContextMenu(input: ShowContextMenuInput): Promise<void>;
    importOfficialData(input: ImportOfficialDataInput): Promise<void>;
    listCodexSessions(input: ListCodexSessionsInput): Promise<ReadonlyArray<CodexSessionSummaryOutput>>;
    readCodexSession(input: CodexSessionReadInput): Promise<CodexSessionReadOutput>;
    searchCodexSessions(input: SearchCodexSessionsInput): Promise<ReadonlyArray<CodexSessionSearchResultOutput>>;
    deleteCodexSession(input: DeleteCodexSessionInput): Promise<void>;
    rememberCommandApprovalRule(
      input: RememberCommandApprovalRuleInput
    ): Promise<RememberCommandApprovalRuleOutput>;
  };
  readonly git: {
    getStatusSnapshot(input: GitRepoInput): Promise<GitStatusSnapshotOutput>;
    getBranchRefs(input: GitRepoInput): Promise<ReadonlyArray<GitBranchRef>>;
    getRemoteUrl(input: GitRemoteInput): Promise<string | null>;
    getDiff(input: GitDiffInput): Promise<GitDiffOutput>;
    getWorkspaceDiffs(input: GitWorkspaceDiffsInput): Promise<ReadonlyArray<GitWorkspaceDiffOutput>>;
    getWorktrees(input: GitRepoInput): Promise<ReadonlyArray<GitWorktreeEntry>>;
    addWorktree(input: GitWorktreeAddInput): Promise<GitWorktreeEntry>;
    removeWorktree(input: GitWorktreeRemoveInput): Promise<void>;
    initRepository(input: GitRepoInput): Promise<void>;
    stagePaths(input: GitPathsInput): Promise<void>;
    unstagePaths(input: GitPathsInput): Promise<void>;
    discardPaths(input: GitDiscardInput): Promise<void>;
    commit(input: GitCommitInput): Promise<void>;
    generateCommitMessage(input: GitGenerateCommitMessageInput): Promise<GitGenerateCommitMessageOutput>;
    fetch(input: GitRepoInput): Promise<void>;
    pull(input: GitRepoInput): Promise<void>;
    push(input: GitPushInput): Promise<void>;
    checkout(input: GitCheckoutInput): Promise<void>;
    deleteBranch(input: GitDeleteBranchInput): Promise<void>;
  };
  readonly terminal: {
    createSession(input: TerminalCreateInput): Promise<TerminalCreateOutput>;
    write(input: TerminalWriteInput): Promise<void>;
    resize(input: TerminalResizeInput): Promise<void>;
    closeSession(input: TerminalCloseInput): Promise<void>;
  };
  subscribe<E extends BridgeEventName>(
    eventName: E,
    handler: (payload: BridgeEventPayloadMap[E]) => void
  ): Promise<() => void>;
}
