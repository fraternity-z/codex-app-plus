import type { MutableRefObject } from "react";
import type { AgentEnvironment, HostBridge } from "../../bridge/types";
import type { AppAction } from "../../domain/types";
import type { CommandApprovalRequest, ServerRequestApprovalResolution } from "../../domain/serverRequests";
import { ProtocolClient } from "../../protocol/client";
import {
  appendCommandApprovalPrefix,
  buildCommandApprovalScopeKey,
  extractCommandApprovalCommand,
  extractRememberedCommandPrefix,
  isRememberCommandDecision,
  matchesCommandApprovalAllowlist,
  type CommandApprovalAllowlist,
} from "../../features/shared/utils/commandApprovalRules";
import { reportServerRequestError } from "./appControllerServerRequests";

type Dispatch = (action: AppAction) => void;

interface TryAutoApproveCommandRequestArgs {
  readonly agentEnvironment: AgentEnvironment;
  readonly allowlistRef: MutableRefObject<CommandApprovalAllowlist>;
  readonly client: ProtocolClient;
  readonly dispatch: Dispatch;
  readonly request: CommandApprovalRequest;
}

interface ResolveRememberedCommandApprovalArgs {
  readonly agentEnvironment: AgentEnvironment;
  readonly allowlistRef: MutableRefObject<CommandApprovalAllowlist>;
  readonly client: ProtocolClient;
  readonly dispatch: Dispatch;
  readonly hostBridge: HostBridge;
  readonly request: CommandApprovalRequest;
  readonly resolution: ServerRequestApprovalResolution;
}

export async function tryAutoApproveCommandRequest({
  agentEnvironment,
  allowlistRef,
  client,
  dispatch,
  request,
}: TryAutoApproveCommandRequestArgs): Promise<boolean> {
  const command = extractCommandApprovalCommand(request.params);
  if (command === null) {
    return false;
  }
  const scopeKey = buildCommandApprovalScopeKey(agentEnvironment, request);
  if (!matchesCommandApprovalAllowlist(allowlistRef.current, scopeKey, command.tokens)) {
    return false;
  }
  try {
    await client.resolveServerRequest(request.rpcId, { decision: "accept" });
    return true;
  } catch (error) {
    reportServerRequestError(dispatch, request, "Failed to auto-approve remembered command", error);
    return false;
  }
}

export async function resolveRememberedCommandApproval({
  agentEnvironment,
  allowlistRef,
  client,
  dispatch,
  hostBridge,
  request,
  resolution,
}: ResolveRememberedCommandApprovalArgs): Promise<boolean> {
  if (!isRememberCommandDecision(resolution.decision)) {
    return false;
  }
  const prefix = extractRememberedCommandPrefix(request.params);
  if (prefix === null || prefix.length === 0) {
    reportServerRequestError(
      dispatch,
      request,
      "Failed to remember command approval rule",
      new Error("Approval request is missing a reusable command prefix."),
    );
    return true;
  }
  try {
    await hostBridge.app.rememberCommandApprovalRule({
      agentEnvironment,
      command: [...prefix],
    });
    await client.resolveServerRequest(request.rpcId, { decision: "accept" });
    const scopeKey = buildCommandApprovalScopeKey(agentEnvironment, request);
    allowlistRef.current = appendCommandApprovalPrefix(allowlistRef.current, scopeKey, prefix);
  } catch (error) {
    reportServerRequestError(dispatch, request, "Failed to remember command approval rule", error);
  }
  return true;
}
