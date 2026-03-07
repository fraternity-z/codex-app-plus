import type { ReviewDecision } from "../protocol/generated/ReviewDecision";
import type { ApplyPatchApprovalParams } from "../protocol/generated/ApplyPatchApprovalParams";
import type { ExecCommandApprovalParams } from "../protocol/generated/ExecCommandApprovalParams";
import type { CommandExecutionApprovalDecision } from "../protocol/generated/v2/CommandExecutionApprovalDecision";
import type { ChatgptAuthTokensRefreshParams } from "../protocol/generated/v2/ChatgptAuthTokensRefreshParams";
import type { ChatgptAuthTokensRefreshResponse } from "../protocol/generated/v2/ChatgptAuthTokensRefreshResponse";
import type { CommandExecutionRequestApprovalParams } from "../protocol/generated/v2/CommandExecutionRequestApprovalParams";
import type { DynamicToolCallParams } from "../protocol/generated/v2/DynamicToolCallParams";
import type { FileChangeRequestApprovalParams } from "../protocol/generated/v2/FileChangeRequestApprovalParams";
import type { ToolRequestUserInputParams } from "../protocol/generated/v2/ToolRequestUserInputParams";
import type { ToolRequestUserInputQuestion } from "../protocol/generated/v2/ToolRequestUserInputQuestion";

interface RequestBase {
  readonly id: string;
  readonly threadId: string | null;
  readonly turnId: string | null;
  readonly itemId: string | null;
}

export interface CommandApprovalRequest extends RequestBase {
  readonly kind: "commandApproval";
  readonly method: "item/commandExecution/requestApproval";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: CommandExecutionRequestApprovalParams;
}

export interface FileChangeApprovalRequest extends RequestBase {
  readonly kind: "fileApproval";
  readonly method: "item/fileChange/requestApproval";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: FileChangeRequestApprovalParams;
}

export interface LegacyPatchApprovalRequest extends RequestBase {
  readonly kind: "legacyPatchApproval";
  readonly method: "applyPatchApproval";
  readonly threadId: string;
  readonly turnId: null;
  readonly itemId: string | null;
  readonly params: ApplyPatchApprovalParams;
}

export interface LegacyExecCommandApprovalRequest extends RequestBase {
  readonly kind: "legacyCommandApproval";
  readonly method: "execCommandApproval";
  readonly threadId: string;
  readonly turnId: null;
  readonly itemId: string | null;
  readonly params: ExecCommandApprovalParams;
}

export interface ToolRequestUserInputRequest extends RequestBase {
  readonly kind: "userInput";
  readonly method: "item/tool/requestUserInput";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: ToolRequestUserInputParams;
  readonly questions: ReadonlyArray<ToolRequestUserInputQuestion>;
}

export interface ToolCallRequest extends RequestBase {
  readonly kind: "toolCall";
  readonly method: "item/tool/call";
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly params: DynamicToolCallParams;
  readonly tool: string;
  readonly arguments: unknown;
}

export interface TokenRefreshRequest extends RequestBase {
  readonly kind: "tokenRefresh";
  readonly method: "account/chatgptAuthTokens/refresh";
  readonly threadId: null;
  readonly turnId: null;
  readonly itemId: null;
  readonly params: ChatgptAuthTokensRefreshParams;
}

export interface UnknownServerRequest extends RequestBase {
  readonly kind: "unknown";
  readonly method: string;
  readonly params: unknown;
}

export type ReceivedServerRequest =
  | CommandApprovalRequest
  | FileChangeApprovalRequest
  | LegacyPatchApprovalRequest
  | LegacyExecCommandApprovalRequest
  | ToolRequestUserInputRequest
  | ToolCallRequest
  | TokenRefreshRequest
  | UnknownServerRequest;

export interface ServerRequestApprovalResolution {
  readonly kind: "commandApproval";
  readonly requestId: string;
  readonly decision: CommandExecutionApprovalDecision;
}

export interface ServerRequestFileResolution {
  readonly kind: "fileApproval";
  readonly requestId: string;
  readonly decision: "accept" | "decline";
}

export interface ServerRequestLegacyApprovalResolution {
  readonly kind: "legacyApproval";
  readonly requestId: string;
  readonly decision: ReviewDecision;
}

export interface ServerRequestUserInputResolution {
  readonly kind: "userInput";
  readonly requestId: string;
  readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
}

export interface ServerRequestToolCallResolution {
  readonly kind: "toolCall";
  readonly requestId: string;
  readonly result: unknown;
}

export interface ServerRequestTokenRefreshResolution {
  readonly kind: "tokenRefresh";
  readonly requestId: string;
  readonly result: ChatgptAuthTokensRefreshResponse;
}

export type ServerRequestResolution =
  | ServerRequestApprovalResolution
  | ServerRequestFileResolution
  | ServerRequestLegacyApprovalResolution
  | ServerRequestUserInputResolution
  | ServerRequestToolCallResolution
  | ServerRequestTokenRefreshResolution;
