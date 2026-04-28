import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  useAppPreferences,
} from "./useAppPreferences";
import {
  DEFAULT_APPEARANCE_COLOR_SCHEME,
} from "../model/appearanceColorScheme";

describe("useAppPreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the default preference values", () => {
    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.agentEnvironment).toBe(DEFAULT_APP_PREFERENCES.agentEnvironment);
    expect(result.current.workspaceOpener).toBe(DEFAULT_APP_PREFERENCES.workspaceOpener);
    expect(result.current.embeddedTerminalShell).toBe(DEFAULT_APP_PREFERENCES.embeddedTerminalShell);
    expect(result.current.embeddedTerminalUtf8).toBe(DEFAULT_APP_PREFERENCES.embeddedTerminalUtf8);
    expect(result.current.notificationDeliveryMode).toBe(DEFAULT_APP_PREFERENCES.notificationDeliveryMode);
    expect(result.current.notificationTriggerMode).toBe(DEFAULT_APP_PREFERENCES.notificationTriggerMode);
    expect(result.current.subagentNotificationsEnabled).toBe(DEFAULT_APP_PREFERENCES.subagentNotificationsEnabled);
    expect(result.current.themeMode).toBe(DEFAULT_APP_PREFERENCES.themeMode);
    expect(result.current.uiLanguage).toBe(DEFAULT_APP_PREFERENCES.uiLanguage);
    expect(result.current.threadDetailLevel).toBe(DEFAULT_APP_PREFERENCES.threadDetailLevel);
    expect(result.current.composerPermissionLevel).toBe(DEFAULT_APP_PREFERENCES.composerPermissionLevel);
    expect(result.current.composerDefaultApprovalPolicy).toBe(DEFAULT_APP_PREFERENCES.composerDefaultApprovalPolicy);
    expect(result.current.composerDefaultSandboxMode).toBe(DEFAULT_APP_PREFERENCES.composerDefaultSandboxMode);
    expect(result.current.composerFullApprovalPolicy).toBe(DEFAULT_APP_PREFERENCES.composerFullApprovalPolicy);
    expect(result.current.composerFullSandboxMode).toBe(DEFAULT_APP_PREFERENCES.composerFullSandboxMode);
    expect(result.current.uiFontFamily).toBe(DEFAULT_APP_PREFERENCES.uiFontFamily);
    expect(result.current.uiFontSize).toBe(DEFAULT_APP_PREFERENCES.uiFontSize);
    expect(result.current.codeFontFamily).toBe(DEFAULT_APP_PREFERENCES.codeFontFamily);
    expect(result.current.codeFontSize).toBe(DEFAULT_APP_PREFERENCES.codeFontSize);
    expect(result.current.gitBranchPrefix).toBe(DEFAULT_APP_PREFERENCES.gitBranchPrefix);
    expect(result.current.gitPushForceWithLease).toBe(DEFAULT_APP_PREFERENCES.gitPushForceWithLease);
    expect(result.current.gitCommitInstructions).toBe(DEFAULT_APP_PREFERENCES.gitCommitInstructions);
    expect(result.current.gitPullRequestMergeMethod).toBe(DEFAULT_APP_PREFERENCES.gitPullRequestMergeMethod);
    expect(result.current.gitDraftPullRequest).toBe(DEFAULT_APP_PREFERENCES.gitDraftPullRequest);
    expect(result.current.gitAutoDeleteWorktrees).toBe(DEFAULT_APP_PREFERENCES.gitAutoDeleteWorktrees);
    expect(result.current.gitAutoDeleteRetention).toBe(DEFAULT_APP_PREFERENCES.gitAutoDeleteRetention);
    expect(result.current.gitPullRequestInstructions).toBe(DEFAULT_APP_PREFERENCES.gitPullRequestInstructions);
    expect(result.current.contrast).toBe(DEFAULT_APP_PREFERENCES.contrast);
    expect(result.current.appearanceColors).toEqual(DEFAULT_APPEARANCE_COLOR_SCHEME);
    expect(result.current.codeStyle).toBe(DEFAULT_APP_PREFERENCES.codeStyle);
  });

  it("persists updated preferences after remount", async () => {
    const first = renderHook(() => useAppPreferences());

    act(() => {
      first.result.current.setAgentEnvironment("wsl");
      first.result.current.setWorkspaceOpener("explorer");
      first.result.current.setEmbeddedTerminalShell("gitBash");
      first.result.current.setEmbeddedTerminalUtf8(false);
      first.result.current.setNotificationDeliveryMode("sound");
      first.result.current.setNotificationTriggerMode("always");
      first.result.current.setSubagentNotificationsEnabled(false);
      first.result.current.setThemeMode("dark");
      first.result.current.setUiLanguage("en-US");
      first.result.current.setThreadDetailLevel("full");
      first.result.current.setComposerPermissionLevel("full");
      first.result.current.setComposerDefaultApprovalPolicy("on-failure");
      first.result.current.setComposerDefaultSandboxMode("read-only");
      first.result.current.setComposerFullApprovalPolicy("untrusted");
      first.result.current.setComposerFullSandboxMode("workspace-write");
      first.result.current.setUiFontFamily("IBM Plex Sans");
      first.result.current.setUiFontSize(15);
      first.result.current.setCodeFontFamily("JetBrains Mono");
      first.result.current.setCodeFontSize(14);
      first.result.current.setGitBranchPrefix("feature/");
      first.result.current.setGitPushForceWithLease(true);
      first.result.current.setGitCommitInstructions("Use Conventional Commits.");
      first.result.current.setGitPullRequestMergeMethod("squash");
      first.result.current.setGitDraftPullRequest(false);
      first.result.current.setGitAutoDeleteWorktrees(false);
      first.result.current.setGitAutoDeleteRetention(8);
      first.result.current.setGitPullRequestInstructions("Summarize test coverage.");
      first.result.current.setContrast(72);
      first.result.current.setAppearanceThemeColors("dark", {
        accent: "#123456",
        background: "#101820",
        foreground: "#F5F7FA",
      });
      first.result.current.setAppearanceThemeColors("light", {
        accent: "#654321",
        background: "#FAFAFA",
        foreground: "#111827",
      });
      first.result.current.setCodeStyle("Dracula");
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).not.toBeNull();
    });

    first.unmount();

    const second = renderHook(() => useAppPreferences());

    expect(second.result.current.agentEnvironment).toBe("wsl");
    expect(second.result.current.workspaceOpener).toBe("explorer");
    expect(second.result.current.embeddedTerminalShell).toBe("gitBash");
    expect(second.result.current.embeddedTerminalUtf8).toBe(false);
    expect(second.result.current.notificationDeliveryMode).toBe("sound");
    expect(second.result.current.notificationTriggerMode).toBe("always");
    expect(second.result.current.subagentNotificationsEnabled).toBe(false);
    expect(second.result.current.themeMode).toBe("dark");
    expect(second.result.current.uiLanguage).toBe("en-US");
    expect(second.result.current.threadDetailLevel).toBe("full");
    expect(second.result.current.composerPermissionLevel).toBe("full");
    expect(second.result.current.composerDefaultApprovalPolicy).toBe("on-failure");
    expect(second.result.current.composerDefaultSandboxMode).toBe("read-only");
    expect(second.result.current.composerFullApprovalPolicy).toBe("never");
    expect(second.result.current.composerFullSandboxMode).toBe("danger-full-access");
    expect(second.result.current.uiFontFamily).toBe("IBM Plex Sans");
    expect(second.result.current.uiFontSize).toBe(15);
    expect(second.result.current.codeFontFamily).toBe("JetBrains Mono");
    expect(second.result.current.codeFontSize).toBe(14);
    expect(second.result.current.gitBranchPrefix).toBe("feature/");
    expect(second.result.current.gitPushForceWithLease).toBe(true);
    expect(second.result.current.gitCommitInstructions).toBe("Use Conventional Commits.");
    expect(second.result.current.gitPullRequestMergeMethod).toBe("squash");
    expect(second.result.current.gitDraftPullRequest).toBe(false);
    expect(second.result.current.gitAutoDeleteWorktrees).toBe(false);
    expect(second.result.current.gitAutoDeleteRetention).toBe(8);
    expect(second.result.current.gitPullRequestInstructions).toBe("Summarize test coverage.");
    expect(second.result.current.contrast).toBe(72);
    expect(second.result.current.appearanceColors.dark).toEqual({
      accent: "#123456",
      background: "#101820",
      foreground: "#F5F7FA",
    });
    expect(second.result.current.appearanceColors.light).toEqual({
      accent: "#654321",
      background: "#FAFAFA",
      foreground: "#111827",
    });
    expect(second.result.current.codeStyle).toBe("Dracula");
  });

  it("migrates the legacy default Chinese language to auto detection", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        uiLanguage: "zh-CN",
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.uiLanguage).toBe("en-US");
  });

  it("falls back to queue when a legacy interrupt follow-up mode is stored", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        followUpQueueMode: "interrupt",
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.followUpQueueMode).toBe("queue");
  });

  it("preserves steer when it is stored explicitly", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        followUpQueueMode: "steer",
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.followUpQueueMode).toBe("steer");
  });

  it("preserves an explicit stored language choice", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        uiLanguage: "zh-CN",
        uiLanguageExplicit: true,
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.uiLanguage).toBe("zh-CN");
  });

  it("prefers stored code font values over legacy terminal font values", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        codeFontFamily: "JetBrains Mono",
        codeFontSize: 14,
        terminalFontFamily: "Fira Code",
        terminalFontSize: 16,
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.codeFontFamily).toBe("JetBrains Mono");
    expect(result.current.codeFontSize).toBe(14);
  });

  it("does not serialize legacy terminal font fields", async () => {
    const { result } = renderHook(() => useAppPreferences());

    act(() => {
      result.current.setCodeFontFamily("JetBrains Mono");
      result.current.setCodeFontSize(15);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY)).not.toBeNull();
    });

    const stored = JSON.parse(
      window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;

    expect(stored.codeFontFamily).toBe("JetBrains Mono");
    expect(stored.codeFontSize).toBe(15);
    expect(stored).not.toHaveProperty("terminalFontFamily");
    expect(stored).not.toHaveProperty("terminalFontSize");
  });

  it("migrates legacy access-mode fields into approval and sandbox settings", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        agentEnvironment: DEFAULT_APP_PREFERENCES.agentEnvironment,
        workspaceOpener: DEFAULT_APP_PREFERENCES.workspaceOpener,
        embeddedTerminalShell: DEFAULT_APP_PREFERENCES.embeddedTerminalShell,
        embeddedTerminalUtf8: DEFAULT_APP_PREFERENCES.embeddedTerminalUtf8,
        themeMode: DEFAULT_APP_PREFERENCES.themeMode,
        uiLanguage: DEFAULT_APP_PREFERENCES.uiLanguage,
        threadDetailLevel: DEFAULT_APP_PREFERENCES.threadDetailLevel,
        followUpQueueMode: DEFAULT_APP_PREFERENCES.followUpQueueMode,
        composerEnterBehavior: DEFAULT_APP_PREFERENCES.composerEnterBehavior,
        composerPermissionLevel: DEFAULT_APP_PREFERENCES.composerPermissionLevel,
        gitBranchPrefix: DEFAULT_APP_PREFERENCES.gitBranchPrefix,
        gitPushForceWithLease: DEFAULT_APP_PREFERENCES.gitPushForceWithLease,
        composerDefaultAccessMode: "read-only",
        composerFullAccessMode: "current",
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.composerDefaultApprovalPolicy).toBe("on-request");
    expect(result.current.composerDefaultSandboxMode).toBe("read-only");
    expect(result.current.composerFullApprovalPolicy).toBe("never");
    expect(result.current.composerFullSandboxMode).toBe("danger-full-access");
  });

  it("ignores stored full access overrides", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        composerFullApprovalPolicy: "untrusted",
        composerFullSandboxMode: "workspace-write",
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.composerFullApprovalPolicy).toBe("never");
    expect(result.current.composerFullSandboxMode).toBe("danger-full-access");
  });

  it("sanitizes stored Git settings", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        gitPullRequestMergeMethod: "rebase",
        gitDraftPullRequest: "yes",
        gitAutoDeleteWorktrees: "no",
        gitAutoDeleteRetention: 0,
        gitPullRequestInstructions: 42,
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.gitPullRequestMergeMethod).toBe(DEFAULT_APP_PREFERENCES.gitPullRequestMergeMethod);
    expect(result.current.gitDraftPullRequest).toBe(DEFAULT_APP_PREFERENCES.gitDraftPullRequest);
    expect(result.current.gitAutoDeleteWorktrees).toBe(DEFAULT_APP_PREFERENCES.gitAutoDeleteWorktrees);
    expect(result.current.gitAutoDeleteRetention).toBe(1);
    expect(result.current.gitPullRequestInstructions).toBe("");
  });

  it("migrates legacy notification booleans into the combined notification settings", () => {
    window.localStorage.setItem(
      APP_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_APP_PREFERENCES,
        notificationDeliveryMode: undefined,
        subagentNotificationsEnabled: undefined,
        notificationSoundsEnabled: false,
        systemNotificationsEnabled: true,
        subagentSystemNotificationsEnabled: false,
      }),
    );

    const { result } = renderHook(() => useAppPreferences());

    expect(result.current.notificationDeliveryMode).toBe("system");
    expect(result.current.notificationTriggerMode).toBe("unfocused");
    expect(result.current.subagentNotificationsEnabled).toBe(false);
  });
});
