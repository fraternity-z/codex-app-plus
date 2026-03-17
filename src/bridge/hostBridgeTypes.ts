import type {
  AppServerStartInput,
  ApplyCodexProviderInput,
  ChatgptAuthTokensOutput,
  CodexProviderApplyResult,
  CodexProviderDraft,
  CodexProviderRecord,
  CodexProviderStore,
  CodexSessionReadInput,
  CodexSessionReadOutput,
  CodexSessionSummaryOutput,
  DeleteCodexProviderInput,
  DeleteCodexSessionInput,
  GlobalAgentInstructionsOutput,
  ImportOfficialDataInput,
  ListCodexSessionsInput,
  OpenCodexConfigTomlInput,
  OpenWorkspaceInput,
  RpcCancelInput,
  RpcNotifyInput,
  RpcRequestInput,
  RpcRequestOutput,
  ServerRequestResolveInput,
  ShowContextMenuInput,
  ShowNotificationInput,
  WindowChromeAction,
  WindowTheme,
  UpdateChatgptAuthTokensInput,
  UpdateGlobalAgentInstructionsInput,
} from "./appTypes";
import type { BridgeEventName, BridgeEventPayloadMap } from "./eventTypes";
import type {
  GitBranchRef,
  GitCheckoutInput,
  GitCommitInput,
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
    controlWindow(action: WindowChromeAction): Promise<void>;
    openExternal(url: string): Promise<void>;
    openWorkspace(input: OpenWorkspaceInput): Promise<void>;
    openCodexConfigToml(input: OpenCodexConfigTomlInput): Promise<void>;
    readGlobalAgentInstructions(input: {
      readonly agentEnvironment: AgentEnvironment;
    }): Promise<GlobalAgentInstructionsOutput>;
    writeGlobalAgentInstructions(
      input: UpdateGlobalAgentInstructionsInput
    ): Promise<GlobalAgentInstructionsOutput>;
    listCodexProviders(): Promise<CodexProviderStore>;
    upsertCodexProvider(input: CodexProviderDraft): Promise<CodexProviderRecord>;
    deleteCodexProvider(input: DeleteCodexProviderInput): Promise<CodexProviderStore>;
    applyCodexProvider(input: ApplyCodexProviderInput): Promise<CodexProviderApplyResult>;
    readChatgptAuthTokens(): Promise<ChatgptAuthTokensOutput>;
    writeChatgptAuthTokens(input: UpdateChatgptAuthTokensInput): Promise<ChatgptAuthTokensOutput>;
    clearChatgptAuthState(): Promise<void>;
    showNotification(input: ShowNotificationInput): Promise<void>;
    showContextMenu(input: ShowContextMenuInput): Promise<void>;
    importOfficialData(input: ImportOfficialDataInput): Promise<void>;
    listCodexSessions(input: ListCodexSessionsInput): Promise<ReadonlyArray<CodexSessionSummaryOutput>>;
    readCodexSession(input: CodexSessionReadInput): Promise<CodexSessionReadOutput>;
    deleteCodexSession(input: DeleteCodexSessionInput): Promise<void>;
  };
  readonly git: {
    getStatusSnapshot(input: GitRepoInput): Promise<GitStatusSnapshotOutput>;
    getBranchRefs(input: GitRepoInput): Promise<ReadonlyArray<GitBranchRef>>;
    getRemoteUrl(input: GitRemoteInput): Promise<string | null>;
    getDiff(input: GitDiffInput): Promise<GitDiffOutput>;
    getWorkspaceDiffs(input: GitWorkspaceDiffsInput): Promise<ReadonlyArray<GitWorkspaceDiffOutput>>;
    initRepository(input: GitRepoInput): Promise<void>;
    stagePaths(input: GitPathsInput): Promise<void>;
    unstagePaths(input: GitPathsInput): Promise<void>;
    discardPaths(input: GitDiscardInput): Promise<void>;
    commit(input: GitCommitInput): Promise<void>;
    fetch(input: GitRepoInput): Promise<void>;
    pull(input: GitRepoInput): Promise<void>;
    push(input: GitPushInput): Promise<void>;
    checkout(input: GitCheckoutInput): Promise<void>;
  };
  readonly terminal: {
    createSession(input?: TerminalCreateInput): Promise<TerminalCreateOutput>;
    write(input: TerminalWriteInput): Promise<void>;
    resize(input: TerminalResizeInput): Promise<void>;
    closeSession(input: TerminalCloseInput): Promise<void>;
  };
  subscribe<E extends BridgeEventName>(
    eventName: E,
    handler: (payload: BridgeEventPayloadMap[E]) => void
  ): Promise<() => void>;
}
