import type { AppAction } from "../../../domain/types";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ProtocolClient } from "../../../protocol/client";
import type { WindowsSandboxSetupCompletedNotification } from "../../../protocol/generated/v2/WindowsSandboxSetupCompletedNotification";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";
import type { WindowsSandboxSetupStartResponse } from "../../../protocol/generated/v2/WindowsSandboxSetupStartResponse";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import { readConfigSnapshot } from "../config/configOperations";

type Dispatch = (action: AppAction) => void;

const DEFAULT_WINDOWS_SANDBOX_MODE: WindowsSandboxSetupMode = "unelevated";
const WINDOWS_SANDBOX_CONFIG_KEY = "windows.sandbox";
const WINDOWS_SANDBOX_LEGACY_KEYS = [
  "features.experimental_windows_sandbox",
  "features.enable_experimental_windows_sandbox",
  "features.elevated_windows_sandbox",
] as const;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDisableEdits(): ConfigBatchWriteParams["edits"] {
  return [
    { keyPath: WINDOWS_SANDBOX_CONFIG_KEY, mergeStrategy: "replace", value: null },
    ...WINDOWS_SANDBOX_LEGACY_KEYS.map((keyPath) => ({
      keyPath,
      mergeStrategy: "replace" as const,
      value: null,
    })),
  ];
}

export function createWindowsSandboxConfigWriteParams(
  snapshot: unknown,
  enabled: boolean,
): ConfigBatchWriteParams {
  const writeTarget = readUserConfigWriteTarget(snapshot);
  return {
    edits: enabled
      ? [{ keyPath: WINDOWS_SANDBOX_CONFIG_KEY, mergeStrategy: "replace", value: DEFAULT_WINDOWS_SANDBOX_MODE }]
      : createDisableEdits(),
    expectedVersion: writeTarget.expectedVersion,
    filePath: writeTarget.filePath,
    reloadUserConfig: true,
  };
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
