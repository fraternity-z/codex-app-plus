import type { RequestId } from "../protocol/generated/RequestId";

export type BridgeEventName =
  | "connection-changed"
  | "notification-received"
  | "server-request-received"
  | "fatal-error"
  | "terminal-output"
  | "terminal-exit";

export interface ConnectionChangedPayload {
  readonly status: "disconnected" | "connecting" | "connected" | "error";
}

export interface NotificationEventPayload {
  readonly method: string;
  readonly params: unknown;
}

export interface ServerRequestEventPayload {
  readonly id: RequestId;
  readonly method: string;
  readonly params: unknown;
}

export interface FatalErrorPayload {
  readonly message: string;
}

export interface TerminalCreateInput {
  readonly cwd?: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly shell?: EmbeddedTerminalShell;
}

export interface TerminalCreateOutput {
  readonly sessionId: string;
  readonly shell: string;
}

export interface TerminalWriteInput {
  readonly sessionId: string;
  readonly data: string;
}

export interface TerminalResizeInput {
  readonly sessionId: string;
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalCloseInput {
  readonly sessionId: string;
}

export interface TerminalOutputEventPayload {
  readonly sessionId: string;
  readonly data: string;
}

export interface TerminalExitEventPayload {
  readonly sessionId: string;
  readonly exitCode?: number | null;
}

export interface AppServerStartInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly codexPath?: string;
}

export interface OpenCodexConfigTomlInput {
  readonly agentEnvironment: AgentEnvironment;
  readonly filePath?: string | null;
}

export interface RpcRequestInput {
  readonly method: string;
  readonly params: unknown;
  readonly timeoutMs?: number;
}

export interface RpcNotifyInput {
  readonly method: string;
  readonly params?: unknown;
}

export interface RpcRequestOutput {
  readonly requestId: string;
  readonly result: unknown;
}

export interface RpcCancelInput {
  readonly requestId: string;
}

export interface ServerRequestResolveInput {
  readonly requestId: RequestId;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface ShowNotificationInput {
  readonly title: string;
  readonly body: string;
}

export interface ShowContextMenuInput {
  readonly x: number;
  readonly y: number;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }>;
}

export interface ImportOfficialDataInput {
  readonly sourcePath: string;
}

export interface GlobalAgentInstructionsOutput {
  readonly path: string;
  readonly content: string;
}

export interface UpdateGlobalAgentInstructionsInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly content: string;
}

export interface ChatgptAuthTokensOutput {
  readonly accessToken: string;
  readonly chatgptAccountId: string;
  readonly chatgptPlanType: string | null;
  readonly source: "cache" | "imported";
}

export interface UpdateChatgptAuthTokensInput {
  readonly accessToken: string;
  readonly chatgptAccountId: string;
  readonly chatgptPlanType: string | null;
}

export interface CodexProviderDraft {
  readonly id?: string | null;
  readonly name: string;
  readonly providerKey: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly authJsonText: string;
  readonly configTomlText: string;
}

export interface CodexProviderRecord {
  readonly id: string;
  readonly name: string;
  readonly providerKey: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly authJsonText: string;
  readonly configTomlText: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CodexProviderStore {
  readonly version: number;
  readonly providers: ReadonlyArray<CodexProviderRecord>;
}

export interface DeleteCodexProviderInput {
  readonly id: string;
}

export interface ApplyCodexProviderInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly id: string;
}

export interface CodexProviderApplyResult {
  readonly providerId: string;
  readonly providerKey: string;
  readonly authPath: string;
  readonly configPath: string;
}

export interface CodexSessionSummaryOutput {
  readonly id: string;
  readonly title: string;
  readonly cwd: string;
  readonly updatedAt: string;
  readonly agentEnvironment: AgentEnvironment;
}

export interface ListCodexSessionsInput {
  readonly agentEnvironment: AgentEnvironment;
}

export interface CodexSessionReadInput {
  readonly threadId: string;
  readonly agentEnvironment: AgentEnvironment;
}

export interface DeleteCodexSessionInput {
  readonly threadId: string;
  readonly agentEnvironment: AgentEnvironment;
}

export interface CodexSessionMessageOutput {
  readonly id: string;
  readonly role: string;
  readonly text: string;
}

export interface CodexSessionReadOutput {
  readonly threadId: string;
  readonly messages: ReadonlyArray<CodexSessionMessageOutput>;
}


export type WorkspaceOpener =
  | "vscode"
  | "visualStudio"
  | "githubDesktop"
  | "explorer"
  | "terminal"
  | "gitBash";

export type AgentEnvironment = "windowsNative" | "wsl";

export type EmbeddedTerminalShell = "powerShell" | "commandPrompt" | "gitBash";

export interface OpenWorkspaceInput {
  readonly path: string;
  readonly opener: WorkspaceOpener;
}

export interface GitRepoInput {
  readonly repoPath: string;
}

export interface GitPathsInput extends GitRepoInput {
  readonly paths: ReadonlyArray<string>;
}

export interface GitDiscardInput extends GitPathsInput {
  readonly deleteUntracked: boolean;
}

export interface GitDiffInput extends GitRepoInput {
  readonly path: string;
  readonly staged: boolean;
}

export type GitWorkspaceDiffScope = "unstaged" | "staged" | "all";

export interface GitWorkspaceDiffsInput extends GitRepoInput {
  readonly scope: GitWorkspaceDiffScope;
  readonly ignoreWhitespaceChanges?: boolean;
}

export interface GitCommitInput extends GitRepoInput {
  readonly message: string;
}

export interface GitPushInput extends GitRepoInput {
  readonly forceWithLease?: boolean;
}

export interface GitCheckoutInput extends GitRepoInput {
  readonly branchName: string;
  readonly create: boolean;
}

export interface GitRemoteInput extends GitRepoInput {
  readonly remoteName: string;
}

export interface GitBranchSummary {
  readonly head: string | null;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly detached: boolean;
}

export interface GitBranchRef {
  readonly name: string;
  readonly upstream: string | null;
  readonly isCurrent: boolean;
}

export interface GitStatusEntry {
  readonly path: string;
  readonly originalPath: string | null;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
}

export interface GitStatusSnapshotOutput {
  readonly isRepository: boolean;
  readonly repoRoot: string | null;
  readonly branch: GitBranchSummary | null;
  readonly remoteName: string | null;
  readonly staged: ReadonlyArray<GitStatusEntry>;
  readonly unstaged: ReadonlyArray<GitStatusEntry>;
  readonly untracked: ReadonlyArray<GitStatusEntry>;
  readonly conflicted: ReadonlyArray<GitStatusEntry>;
  readonly isClean: boolean;
}

export interface GitStatusOutput {
  readonly isRepository: boolean;
  readonly repoRoot: string | null;
  readonly branch: GitBranchSummary | null;
  readonly remoteName: string | null;
  readonly remoteUrl: string | null;
  readonly branches: ReadonlyArray<GitBranchRef>;
  readonly staged: ReadonlyArray<GitStatusEntry>;
  readonly unstaged: ReadonlyArray<GitStatusEntry>;
  readonly untracked: ReadonlyArray<GitStatusEntry>;
  readonly conflicted: ReadonlyArray<GitStatusEntry>;
  readonly isClean: boolean;
}

export interface GitDiffOutput {
  readonly path: string;
  readonly staged: boolean;
  readonly diff: string;
}

export type GitWorkspaceDiffSection =
  | "unstaged"
  | "staged"
  | "untracked"
  | "conflicted";

export interface GitWorkspaceDiffOutput {
  readonly path: string;
  readonly displayPath: string;
  readonly originalPath: string | null;
  readonly status: string;
  readonly staged: boolean;
  readonly section: GitWorkspaceDiffSection;
  readonly diff: string;
  readonly additions: number;
  readonly deletions: number;
}

export type BridgeEventPayloadMap = {
  "connection-changed": ConnectionChangedPayload;
  "notification-received": NotificationEventPayload;
  "server-request-received": ServerRequestEventPayload;
  "fatal-error": FatalErrorPayload;
  "terminal-output": TerminalOutputEventPayload;
  "terminal-exit": TerminalExitEventPayload;
};

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
