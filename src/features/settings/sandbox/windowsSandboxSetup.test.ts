import { describe, expect, it, vi } from "vitest";
import type { AppAction } from "../../../domain/types";
import type { ProtocolClient } from "../../../protocol/client";
import {
  createWindowsSandboxConfigWriteParams,
  refreshConfigAfterWindowsSandboxSetup,
  startWindowsSandboxSetupRequest,
} from "./windowsSandboxSetup";

function createClient(request = vi.fn()) {
  return { request } as unknown as ProtocolClient;
}

describe("windowsSandboxSetup helpers", () => {
  it("writes the user config when enabling Windows Sandbox", () => {
    const params = createWindowsSandboxConfigWriteParams({
      config: {},
      origins: {},
      layers: [{ name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" }, version: "7", config: {}, disabledReason: null }],
    }, true);

    expect(params).toEqual({
      edits: [{ keyPath: "windows.sandbox", mergeStrategy: "replace", value: "unelevated" }],
      expectedVersion: "7",
      filePath: "C:/Users/Administrator/.codex/config.toml",
      reloadUserConfig: true,
    });
  });

  it("clears user and legacy Windows Sandbox keys when disabling", () => {
    const params = createWindowsSandboxConfigWriteParams({ config: {}, origins: {}, layers: [] }, false);

    expect(params.edits).toEqual([
      { keyPath: "windows.sandbox", mergeStrategy: "replace", value: null },
      { keyPath: "features.experimental_windows_sandbox", mergeStrategy: "replace", value: null },
      { keyPath: "features.enable_experimental_windows_sandbox", mergeStrategy: "replace", value: null },
      { keyPath: "features.elevated_windows_sandbox", mergeStrategy: "replace", value: null },
    ]);
    expect(params.reloadUserConfig).toBe(true);
  });

  it("starts setup with the requested mode", async () => {
    const request = vi.fn().mockResolvedValue({ started: true });
    const dispatch = vi.fn<(action: AppAction) => void>();

    const response = await startWindowsSandboxSetupRequest(createClient(request), dispatch, "unelevated");

    expect(response).toEqual({ started: true });
    expect(request).toHaveBeenCalledWith("windowsSandbox/setupStart", { mode: "unelevated" });
    expect(dispatch).toHaveBeenCalledWith({ type: "windowsSandbox/setupStarted", mode: "unelevated" });
  });

  it("surfaces request failures and records them in state", async () => {
    const request = vi.fn().mockRejectedValue(new Error("setup failed"));
    const dispatch = vi.fn<(action: AppAction) => void>();

    await expect(startWindowsSandboxSetupRequest(createClient(request), dispatch, "elevated")).rejects.toThrow("setup failed");

    expect(dispatch).toHaveBeenNthCalledWith(1, { type: "windowsSandbox/setupStarted", mode: "elevated" });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: "windowsSandbox/setupCompleted", mode: "elevated", success: false, error: "setup failed" });
  });

  it("refreshes config snapshot after a successful completion notification", async () => {
    const config = { config: {}, origins: {}, layers: [] };
    const request = vi.fn().mockResolvedValue(config);
    const dispatch = vi.fn<(action: AppAction) => void>();

    await refreshConfigAfterWindowsSandboxSetup(createClient(request), dispatch, { mode: "unelevated", success: true, error: null });

    expect(request).toHaveBeenCalledWith("config/read", { includeLayers: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "config/loaded", config });
  });

  it("skips config refresh after a failed completion notification", async () => {
    const request = vi.fn();
    const dispatch = vi.fn<(action: AppAction) => void>();

    await refreshConfigAfterWindowsSandboxSetup(createClient(request), dispatch, { mode: "unelevated", success: false, error: "boom" });

    expect(request).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
