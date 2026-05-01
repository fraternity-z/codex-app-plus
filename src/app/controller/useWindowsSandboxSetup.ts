import { useEffect, useRef } from "react";
import type { AgentEnvironment } from "../../bridge/types";
import type { ProtocolClient } from "../../protocol/client";
import type { AppStoreApi } from "../../state/store";
import {
  readWindowsSandboxConfigView,
  startWindowsSandboxSetupRequest,
} from "../../features/settings";
import { WINDOWS_SANDBOX_STATE_IDLE_RESET_MS } from "./appControllerTypes";

function readWindowsSandboxAutoSetupTarget(
  configSnapshot: unknown,
  agentEnvironment: AgentEnvironment,
): { readonly key: string; readonly mode: "elevated" | "unelevated" } | null {
  if (agentEnvironment !== "windowsNative") {
    return null;
  }
  const view = readWindowsSandboxConfigView(configSnapshot);
  if (!view.enabled || view.mode === null) {
    return null;
  }
  return {
    key: `${agentEnvironment}:${view.mode}:${view.source ?? "windows.sandbox"}`,
    mode: view.mode,
  };
}

export function useWindowsSandboxSetup(
  client: ProtocolClient,
  dispatch: AppStoreApi["dispatch"],
  agentEnvironment: AgentEnvironment,
  configSnapshot: unknown,
  windowsSandboxSetup: { readonly pending: boolean; readonly mode: string | null; readonly success: boolean | null },
): void {
  const windowsSandboxResetTimerRef = useRef<number | null>(null);
  const windowsSandboxAutoSetupKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (windowsSandboxResetTimerRef.current !== null) {
      window.clearTimeout(windowsSandboxResetTimerRef.current);
      windowsSandboxResetTimerRef.current = null;
    }
    if (
      windowsSandboxSetup.pending
      || windowsSandboxSetup.mode === null
      || windowsSandboxSetup.success === null
    ) {
      return;
    }
    windowsSandboxResetTimerRef.current = window.setTimeout(() => {
      windowsSandboxResetTimerRef.current = null;
      dispatch({ type: "windowsSandbox/setupCleared" });
    }, WINDOWS_SANDBOX_STATE_IDLE_RESET_MS);
    return () => {
      if (windowsSandboxResetTimerRef.current !== null) {
        window.clearTimeout(windowsSandboxResetTimerRef.current);
        windowsSandboxResetTimerRef.current = null;
      }
    };
  }, [dispatch, windowsSandboxSetup]);

  useEffect(() => {
    const target = readWindowsSandboxAutoSetupTarget(configSnapshot, agentEnvironment);
    if (target === null) {
      windowsSandboxAutoSetupKeyRef.current = null;
      return;
    }
    if (windowsSandboxSetup.pending || windowsSandboxAutoSetupKeyRef.current === target.key) {
      return;
    }
    windowsSandboxAutoSetupKeyRef.current = target.key;
    void startWindowsSandboxSetupRequest(client, dispatch, target.mode).catch((error) => {
      console.error("自动启用 Windows 沙盒失败", error);
    });
  }, [agentEnvironment, client, configSnapshot, dispatch, windowsSandboxSetup.pending]);

  useEffect(() => {
    return () => {
      if (windowsSandboxResetTimerRef.current !== null) {
        window.clearTimeout(windowsSandboxResetTimerRef.current);
        windowsSandboxResetTimerRef.current = null;
      }
    };
  }, []);
}
