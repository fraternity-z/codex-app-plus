import type { RequestId } from "../protocol/generated/RequestId";
import type { AgentEnvironment, WorkspaceOpener } from "./sharedTypes";

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

export type WindowTheme = "light" | "dark";
export type WindowChromeAction = "minimize" | "toggleMaximize" | "close";

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

export interface AgentSummaryOutput {
  readonly name: string;
  readonly description: string | null;
  readonly configFile: string;
  readonly resolvedPath: string;
  readonly managedByApp: boolean;
  readonly fileExists: boolean;
}

export interface AgentsSettingsOutput {
  readonly configPath: string;
  readonly multiAgentEnabled: boolean;
  readonly maxThreads: number;
  readonly maxDepth: number;
  readonly agents: ReadonlyArray<AgentSummaryOutput>;
}

export interface SetAgentsCoreInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly multiAgentEnabled: boolean;
  readonly maxThreads: number;
  readonly maxDepth: number;
}

export interface CreateAgentInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly name: string;
  readonly description: string | null;
}

export interface UpdateAgentInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly originalName: string;
  readonly name: string;
  readonly description: string | null;
}

export interface DeleteAgentInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly name: string;
}

export interface ReadAgentConfigInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly name: string;
}

export interface WriteAgentConfigInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly name: string;
  readonly content: string;
}

export interface ReadAgentConfigOutput {
  readonly content: string;
}

export interface WriteAgentConfigOutput {
  readonly content: string;
}

export interface ReadCustomPromptsInput {
  readonly agentEnvironment: AgentEnvironment;
}

export interface CustomPromptOutput {
  readonly name: string;
  readonly path: string;
  readonly content: string;
  readonly description: string | null;
  readonly argumentHint: string | null;
}

export interface UpdateGlobalAgentInstructionsInput {
  readonly agentEnvironment?: AgentEnvironment;
  readonly content: string;
}

export type ProxyMode = "disabled" | "system" | "custom";

export interface ProxySettings {
  readonly mode: ProxyMode;
  readonly httpProxy: string;
  readonly httpsProxy: string;
  readonly noProxy: string;
}

export interface ReadProxySettingsInput {
  readonly agentEnvironment: AgentEnvironment;
}

export interface ReadProxySettingsOutput {
  readonly settings: ProxySettings;
}

export interface UpdateProxySettingsInput extends ProxySettings {
  readonly agentEnvironment: AgentEnvironment;
}

export interface UpdateProxySettingsOutput {
  readonly settings: ProxySettings;
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

export type CodexAuthMode = "chatgpt" | "apikey";

export interface ActivateCodexChatgptInput {
  readonly agentEnvironment?: AgentEnvironment;
}

export interface GetCodexAuthModeStateInput {
  readonly agentEnvironment?: AgentEnvironment;
}

export interface CaptureCodexOauthSnapshotInput {
  readonly agentEnvironment?: AgentEnvironment;
}

export interface CodexAuthModeStateOutput {
  readonly activeMode: CodexAuthMode;
  readonly activeProviderKey: string | null;
  readonly oauthSnapshotAvailable: boolean;
}

export interface CodexAuthSwitchResult {
  readonly mode: CodexAuthMode;
  readonly providerId: string | null;
  readonly providerKey: string | null;
  readonly authPath: string;
  readonly configPath: string;
  readonly restoredFromSnapshot: boolean;
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

export interface OpenWorkspaceInput {
  readonly path: string;
  readonly opener: WorkspaceOpener;
}

export interface OpenFileInEditorInput {
  readonly path: string;
  readonly agentEnvironment?: AgentEnvironment;
  readonly line?: number | null;
  readonly column?: number | null;
}

export interface WorkspaceLaunchScriptState {
  readonly id: string;
  readonly script: string;
  readonly icon: string;
  readonly label: string | null;
}

export interface WorkspaceRootState {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly launchScript?: string | null;
  readonly launchScripts?: ReadonlyArray<WorkspaceLaunchScriptState> | null;
}

export interface ManagedWorktreeState {
  readonly path: string;
  readonly repoPath: string;
  readonly branch: string | null;
  readonly createdAt: string;
}

export interface WorkspacePersistenceState {
  readonly version: number;
  readonly roots: ReadonlyArray<WorkspaceRootState>;
  readonly managedWorktrees: ReadonlyArray<ManagedWorktreeState>;
  readonly selectedRootId: string | null;
}

export interface RememberCommandApprovalRuleInput {
  readonly agentEnvironment: AgentEnvironment;
  readonly command: ReadonlyArray<string>;
}

export interface RememberCommandApprovalRuleOutput {
  readonly rulesPath: string;
}
