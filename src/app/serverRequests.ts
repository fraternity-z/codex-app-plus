import type { CommandExecutionRequestApprovalParams } from "../protocol/generated/v2/CommandExecutionRequestApprovalParams";
import type { FileChangeRequestApprovalParams } from "../protocol/generated/v2/FileChangeRequestApprovalParams";
import type { ToolRequestUserInputParams } from "../protocol/generated/v2/ToolRequestUserInputParams";
import type {
  CommandApprovalRequest,
  FileChangeApprovalRequest,
  ReceivedServerRequest,
  ServerRequestResolution,
  ToolCallRequest,
  ToolRequestUserInputRequest,
  UnknownServerRequest,
} from "../domain/timeline";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function normalizeServerRequest(id: string, method: string, params: unknown): ReceivedServerRequest {
  if (method === "item/commandExecution/requestApproval") {
    const input = params as CommandExecutionRequestApprovalParams;
    const request: CommandApprovalRequest = {
      kind: "commandApproval",
      id,
      method,
      threadId: input.threadId,
      turnId: input.turnId,
      itemId: input.itemId,
      params: input
    };
    return request;
  }

  if (method === "item/fileChange/requestApproval") {
    const input = params as FileChangeRequestApprovalParams;
    const request: FileChangeApprovalRequest = {
      kind: "fileApproval",
      id,
      method,
      threadId: input.threadId,
      turnId: input.turnId,
      itemId: input.itemId,
      params: input
    };
    return request;
  }

  if (method === "item/tool/requestUserInput") {
    const input = params as ToolRequestUserInputParams;
    const request: ToolRequestUserInputRequest = {
      kind: "userInput",
      id,
      method,
      threadId: input.threadId,
      turnId: input.turnId,
      itemId: input.itemId,
      params: input,
      questions: input.questions
    };
    return request;
  }

  if (method === "item/tool/call") {
    const record = asRecord(params);
    const request: ToolCallRequest = {
      kind: "toolCall",
      id,
      method,
      threadId: readString(record, "threadId"),
      turnId: readString(record, "turnId"),
      itemId: readString(record, "itemId"),
      params
    };
    return request;
  }

  const record = asRecord(params);
  const unknownRequest: UnknownServerRequest = {
    kind: "unknown",
    id,
    method,
    threadId: readString(record, "threadId"),
    turnId: readString(record, "turnId"),
    itemId: readString(record, "itemId"),
    params
  };
  return unknownRequest;
}

export function createServerRequestPayload(resolution: ServerRequestResolution): unknown {
  if (resolution.kind === "commandApproval") {
    return { decision: resolution.decision };
  }

  if (resolution.kind === "fileApproval") {
    return { decision: resolution.decision };
  }

  return {
    answers: Object.fromEntries(
      Object.entries(resolution.answers).map(([questionId, answers]) => [questionId, { answers: [...answers] }])
    )
  };
}
