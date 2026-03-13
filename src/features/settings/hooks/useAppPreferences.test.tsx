import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  useAppPreferences
} from "./useAppPreferences";

describe("useAppPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the default preference values", () => {
    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.agentEnvironment).toBe(DEFAULT_APP_PREFERENCES.agentEnvironment);
    expect(result.current.workspaceOpener).toBe(DEFAULT_APP_PREFERENCES.workspaceOpener);
    expect(result.current.embeddedTerminalShell).toBe(DEFAULT_APP_PREFERENCES.embeddedTerminalShell);
    expect(result.current.uiLanguage).toBe(DEFAULT_APP_PREFERENCES.uiLanguage);
    expect(result.current.threadDetailLevel).toBe(DEFAULT_APP_PREFERENCES.threadDetailLevel);
    expect(result.current.composerPermissionLevel).toBe(DEFAULT_APP_PREFERENCES.composerPermissionLevel);
  });

  it("persists updated preferences after remount", async () => {
    const first = renderHook(() => useAppPreferences());

    act(() => {
      first.result.current.setAgentEnvironment("wsl");
      first.result.current.setWorkspaceOpener("explorer");
      first.result.current.setEmbeddedTerminalShell("gitBash");
      first.result.current.setUiLanguage("en-US");
      first.result.current.setThreadDetailLevel("full");
      first.result.current.setComposerPermissionLevel("full");
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).not.toBeNull();
    });

    first.unmount();

    const second = renderHook(() => useAppPreferences());

    expect(second.result.current.agentEnvironment).toBe("wsl");
    expect(second.result.current.workspaceOpener).toBe("explorer");
    expect(second.result.current.embeddedTerminalShell).toBe("gitBash");
    expect(second.result.current.uiLanguage).toBe("en-US");
    expect(second.result.current.threadDetailLevel).toBe("full");
    expect(second.result.current.composerPermissionLevel).toBe("full");
  });

  it("falls back invalid stored values to defaults", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        agentEnvironment: "linux",
        workspaceOpener: "unknown",
        embeddedTerminalShell: "bad-shell",
        uiLanguage: "fr-FR",
        threadDetailLevel: "verbose",
        composerPermissionLevel: "admin"
      })
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.agentEnvironment).toBe(DEFAULT_APP_PREFERENCES.agentEnvironment);
    expect(result.current.workspaceOpener).toBe(DEFAULT_APP_PREFERENCES.workspaceOpener);
    expect(result.current.embeddedTerminalShell).toBe(DEFAULT_APP_PREFERENCES.embeddedTerminalShell);
    expect(result.current.uiLanguage).toBe(DEFAULT_APP_PREFERENCES.uiLanguage);
    expect(result.current.threadDetailLevel).toBe(DEFAULT_APP_PREFERENCES.threadDetailLevel);
    expect(result.current.composerPermissionLevel).toBe(DEFAULT_APP_PREFERENCES.composerPermissionLevel);
  });
});
