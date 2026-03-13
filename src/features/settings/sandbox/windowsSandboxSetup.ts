import type { AppAction } from "../../../domain/types";
import type { ProtocolClient } from "../../../protocol/client";
import type { WindowsSandboxSetupCompletedNotification } from "../../../protocol/generated/v2/WindowsSandboxSetupCompletedNotification";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";
import type { WindowsSandboxSetupStartResponse } from "../../../protocol/generated/v2/WindowsSandboxSetupStartResponse";
import { readConfigSnapshot } from "../config/configOperations";

type Dispatch = (action: AppAction) => void;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function startWindowsSandboxSetupRequest(
  client: ProtocolClient,
  dispatch: Dispatch,
  mode: WindowsSandboxSetupMode,
): Promise<WindowsSandboxSetupStartResponse> {
  dispatch({ type: "windowsSandbox/setupStarted", mode });
  try {
    return (await client.request("windowsSandbox/setupStart", { mode })) as WindowsSandboxSetupStartResponse;
  } catch (error) {
    dispatch({ type: "windowsSandbox/setupCompleted", mode, success: false, error: toErrorMessage(error) });
    throw error;
  }
}

export async function refreshConfigAfterWindowsSandboxSetup(
  client: ProtocolClient,
  dispatch: Dispatch,
  payload: WindowsSandboxSetupCompletedNotification,
): Promise<void> {
  if (!payload.success) {
    return;
  }
  await readConfigSnapshot(client, dispatch);
}
