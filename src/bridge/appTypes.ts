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
  readonly activeProviderId: string | null;
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

export interface OpenWorkspaceInput {
  readonly path: string;
  readonly opener: WorkspaceOpener;
}

export interface RememberCommandApprovalRuleInput {
  readonly agentEnvironment: AgentEnvironment;
  readonly command: ReadonlyArray<string>;
}

export interface RememberCommandApprovalRuleOutput {
  readonly rulesPath: string;
}
