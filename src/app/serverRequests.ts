import type { ApplyPatchApprovalParams } from "../protocol/generated/ApplyPatchApprovalParams";
import type { ExecCommandApprovalParams } from "../protocol/generated/ExecCommandApprovalParams";
import type { ReviewDecision } from "../protocol/generated/ReviewDecision";
import type { ChatgptAuthTokensRefreshParams } from "../protocol/generated/v2/ChatgptAuthTokensRefreshParams";
import type { CommandExecutionRequestApprovalParams } from "../protocol/generated/v2/CommandExecutionRequestApprovalParams";
import type { DynamicToolCallParams } from "../protocol/generated/v2/DynamicToolCallParams";
import type { FileChangeRequestApprovalParams } from "../protocol/generated/v2/FileChangeRequestApprovalParams";
import type { ToolRequestUserInputParams } from "../protocol/generated/v2/ToolRequestUserInputParams";
import type {
  CommandApprovalRequest,
  FileChangeApprovalRequest,
  LegacyExecCommandApprovalRequest,
  LegacyPatchApprovalRequest,
  ReceivedServerRequest,
  ServerRequestResolution,
  TokenRefreshRequest,
  ToolCallRequest,
  ToolRequestUserInputRequest,
  UnknownServerRequest,
} from "../domain/serverRequests";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapLegacyDecision(decision: ReviewDecision): ReviewDecision {
  return decision;
}

export function normalizeServerRequest(id: string, method: string, params: unknown): ReceivedServerRequest {
  if (method === "item/commandExecution/requestApproval") {
    const input = params as CommandExecutionRequestApprovalParams;
    const request: CommandApprovalRequest = { kind: "commandApproval", id, method, threadId: input.threadId, turnId: input.turnId, itemId: input.itemId, params: input };
    return request;
  }

  if (method === "item/fileChange/requestApproval") {
    const input = params as FileChangeRequestApprovalParams;
    const request: FileChangeApprovalRequest = { kind: "fileApproval", id, method, threadId: input.threadId, turnId: input.turnId, itemId: input.itemId, params: input };
    return request;
  }

  if (method === "applyPatchApproval") {
    const input = params as ApplyPatchApprovalParams;
    const request: LegacyPatchApprovalRequest = { kind: "legacyPatchApproval", id, method, threadId: input.conversationId, turnId: null, itemId: input.callId, params: input };
    return request;
  }

  if (method === "execCommandApproval") {
    const input = params as ExecCommandApprovalParams;
    const request: LegacyExecCommandApprovalRequest = { kind: "legacyCommandApproval", id, method, threadId: input.conversationId, turnId: null, itemId: input.approvalId ?? input.callId, params: input };
    return request;
  }

  if (method === "item/tool/requestUserInput") {
    const input = params as ToolRequestUserInputParams;
    const request: ToolRequestUserInputRequest = { kind: "userInput", id, method, threadId: input.threadId, turnId: input.turnId, itemId: input.itemId, params: input, questions: input.questions };
    return request;
  }

  if (method === "item/tool/call") {
    const input = params as DynamicToolCallParams;
    const request: ToolCallRequest = { kind: "toolCall", id, method, threadId: input.threadId, turnId: input.turnId, itemId: input.callId, params: input, tool: input.tool, arguments: input.arguments };
    return request;
  }

  if (method === "account/chatgptAuthTokens/refresh") {
    const input = params as ChatgptAuthTokensRefreshParams;
    const request: TokenRefreshRequest = { kind: "tokenRefresh", id, method, threadId: null, turnId: null, itemId: null, params: input };
    return request;
  }

  const record = asRecord(params);
  const unknownRequest: UnknownServerRequest = { kind: "unknown", id, method, threadId: readString(record, "threadId"), turnId: readString(record, "turnId"), itemId: readString(record, "itemId"), params };
  return unknownRequest;
}

export function createServerRequestPayload(resolution: ServerRequestResolution): unknown {
  if (resolution.kind === "commandApproval") {
    return { decision: resolution.decision };
  }

  if (resolution.kind === "fileApproval") {
    return { decision: resolution.decision };
  }

  if (resolution.kind === "legacyApproval") {
    return { decision: mapLegacyDecision(resolution.decision) };
  }

  if (resolution.kind === "toolCall") {
    return resolution.result;
  }

  if (resolution.kind === "tokenRefresh") {
    return resolution.result;
  }

  return {
    answers: Object.fromEntries(
      Object.entries(resolution.answers).map(([questionId, answers]) => [questionId, { answers: [...answers] }]),
    ),
  };
}
