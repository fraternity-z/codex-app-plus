import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { DEFAULT_APP_PREFERENCES } from "../hooks/useAppPreferences";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

function renderSection(locale: Locale = "zh-CN", steerAvailable = true): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);

    return (
      <GeneralSettingsSection
        steerAvailable={steerAvailable}
        preferences={{
          ...preferences,
          setAgentEnvironment: (agentEnvironment) =>
            setPreferences((current) => ({ ...current, agentEnvironment })),
          setWorkspaceOpener: (workspaceOpener) =>
            setPreferences((current) => ({ ...current, workspaceOpener })),
          setEmbeddedTerminalShell: (embeddedTerminalShell) =>
            setPreferences((current) => ({ ...current, embeddedTerminalShell })),
          setEmbeddedTerminalUtf8: (embeddedTerminalUtf8) =>
            setPreferences((current) => ({ ...current, embeddedTerminalUtf8 })),
          setNotificationDeliveryMode: (notificationDeliveryMode) =>
            setPreferences((current) => ({ ...current, notificationDeliveryMode })),
          setNotificationTriggerMode: (notificationTriggerMode) =>
            setPreferences((current) => ({ ...current, notificationTriggerMode })),
          setSubagentNotificationsEnabled: (subagentNotificationsEnabled) =>
            setPreferences((current) => ({ ...current, subagentNotificationsEnabled })),
          setThemeMode: (themeMode) =>
            setPreferences((current) => ({ ...current, themeMode })),
          setUiLanguage: (uiLanguage) =>
            setPreferences((current) => ({ ...current, uiLanguage })),
          setThreadDetailLevel: (threadDetailLevel) =>
            setPreferences((current) => ({ ...current, threadDetailLevel })),
          setFollowUpQueueMode: (followUpQueueMode) =>
            setPreferences((current) => ({ ...current, followUpQueueMode })),
          setComposerEnterBehavior: (composerEnterBehavior) =>
            setPreferences((current) => ({ ...current, composerEnterBehavior })),
          setComposerPermissionLevel: (composerPermissionLevel) =>
            setPreferences((current) => ({ ...current, composerPermissionLevel })),
          setComposerDefaultApprovalPolicy: (composerDefaultApprovalPolicy) =>
            setPreferences((current) => ({ ...current, composerDefaultApprovalPolicy })),
          setComposerDefaultSandboxMode: (composerDefaultSandboxMode) =>
            setPreferences((current) => ({ ...current, composerDefaultSandboxMode })),
          setComposerFullApprovalPolicy: (composerFullApprovalPolicy) =>
            setPreferences((current) => ({ ...current, composerFullApprovalPolicy })),
          setComposerFullSandboxMode: (composerFullSandboxMode) =>
            setPreferences((current) => ({ ...current, composerFullSandboxMode })),
          setUiFontFamily: (uiFontFamily) =>
            setPreferences((current) => ({ ...current, uiFontFamily })),
          setUiFontSize: (uiFontSize) =>
            setPreferences((current) => ({ ...current, uiFontSize })),
          setCodeFontFamily: (codeFontFamily) =>
            setPreferences((current) => ({ ...current, codeFontFamily })),
          setCodeFontSize: (codeFontSize) =>
            setPreferences((current) => ({ ...current, codeFontSize })),
          setGitBranchPrefix: (gitBranchPrefix) =>
            setPreferences((current) => ({ ...current, gitBranchPrefix })),
          setGitPushForceWithLease: (gitPushForceWithLease) =>
            setPreferences((current) => ({ ...current, gitPushForceWithLease })),
          setGitCommitInstructions: (gitCommitInstructions) =>
            setPreferences((current) => ({ ...current, gitCommitInstructions })),
          setGitPullRequestMergeMethod: (gitPullRequestMergeMethod) =>
            setPreferences((current) => ({ ...current, gitPullRequestMergeMethod })),
          setGitDraftPullRequest: (gitDraftPullRequest) =>
            setPreferences((current) => ({ ...current, gitDraftPullRequest })),
          setGitAutoDeleteWorktrees: (gitAutoDeleteWorktrees) =>
            setPreferences((current) => ({ ...current, gitAutoDeleteWorktrees })),
          setGitAutoDeleteRetention: (gitAutoDeleteRetention) =>
            setPreferences((current) => ({ ...current, gitAutoDeleteRetention })),
          setGitPullRequestInstructions: (gitPullRequestInstructions) =>
            setPreferences((current) => ({ ...current, gitPullRequestInstructions })),
          setContrast: (contrast) =>
            setPreferences((current) => ({ ...current, contrast })),
          setAppearanceThemeColors: () => undefined,
          setCodeStyle: (codeStyle) =>
            setPreferences((current) => ({ ...current, codeStyle })),
        }}
        onTestNotificationSound={() => undefined}
        onTestSystemNotification={() => undefined}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("GeneralSettingsSection", () => {
  it("updates the notification delivery mode", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "仅声音" }));

    expect(screen.getByRole("button", { name: "仅声音" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles subagent notifications", () => {
    renderSection();

    const toggle = screen.getByRole("switch", { name: "子代理通知" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("fires the notification test actions", () => {
    const onTestNotificationSound = vi.fn();
    const onTestSystemNotification = vi.fn();

    function Wrapper(): JSX.Element {
      const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);

      return (
        <GeneralSettingsSection
          steerAvailable
          preferences={{
            ...preferences,
            setAgentEnvironment: (agentEnvironment) =>
              setPreferences((current) => ({ ...current, agentEnvironment })),
            setWorkspaceOpener: (workspaceOpener) =>
              setPreferences((current) => ({ ...current, workspaceOpener })),
            setEmbeddedTerminalShell: (embeddedTerminalShell) =>
              setPreferences((current) => ({ ...current, embeddedTerminalShell })),
            setEmbeddedTerminalUtf8: (embeddedTerminalUtf8) =>
              setPreferences((current) => ({ ...current, embeddedTerminalUtf8 })),
            setNotificationDeliveryMode: (notificationDeliveryMode) =>
              setPreferences((current) => ({ ...current, notificationDeliveryMode })),
            setNotificationTriggerMode: (notificationTriggerMode) =>
              setPreferences((current) => ({ ...current, notificationTriggerMode })),
            setSubagentNotificationsEnabled: (subagentNotificationsEnabled) =>
              setPreferences((current) => ({ ...current, subagentNotificationsEnabled })),
            setThemeMode: (themeMode) =>
              setPreferences((current) => ({ ...current, themeMode })),
            setUiLanguage: (uiLanguage) =>
              setPreferences((current) => ({ ...current, uiLanguage })),
            setThreadDetailLevel: (threadDetailLevel) =>
              setPreferences((current) => ({ ...current, threadDetailLevel })),
            setFollowUpQueueMode: (followUpQueueMode) =>
              setPreferences((current) => ({ ...current, followUpQueueMode })),
            setComposerEnterBehavior: (composerEnterBehavior) =>
              setPreferences((current) => ({ ...current, composerEnterBehavior })),
            setComposerPermissionLevel: (composerPermissionLevel) =>
              setPreferences((current) => ({ ...current, composerPermissionLevel })),
            setComposerDefaultApprovalPolicy: (composerDefaultApprovalPolicy) =>
              setPreferences((current) => ({ ...current, composerDefaultApprovalPolicy })),
            setComposerDefaultSandboxMode: (composerDefaultSandboxMode) =>
              setPreferences((current) => ({ ...current, composerDefaultSandboxMode })),
            setComposerFullApprovalPolicy: (composerFullApprovalPolicy) =>
              setPreferences((current) => ({ ...current, composerFullApprovalPolicy })),
            setComposerFullSandboxMode: (composerFullSandboxMode) =>
              setPreferences((current) => ({ ...current, composerFullSandboxMode })),
            setUiFontFamily: (uiFontFamily) =>
              setPreferences((current) => ({ ...current, uiFontFamily })),
            setUiFontSize: (uiFontSize) =>
              setPreferences((current) => ({ ...current, uiFontSize })),
            setCodeFontFamily: (codeFontFamily) =>
              setPreferences((current) => ({ ...current, codeFontFamily })),
            setCodeFontSize: (codeFontSize) =>
              setPreferences((current) => ({ ...current, codeFontSize })),
            setGitBranchPrefix: (gitBranchPrefix) =>
              setPreferences((current) => ({ ...current, gitBranchPrefix })),
            setGitPushForceWithLease: (gitPushForceWithLease) =>
              setPreferences((current) => ({ ...current, gitPushForceWithLease })),
            setGitCommitInstructions: (gitCommitInstructions) =>
              setPreferences((current) => ({ ...current, gitCommitInstructions })),
            setGitPullRequestMergeMethod: (gitPullRequestMergeMethod) =>
              setPreferences((current) => ({ ...current, gitPullRequestMergeMethod })),
            setGitDraftPullRequest: (gitDraftPullRequest) =>
              setPreferences((current) => ({ ...current, gitDraftPullRequest })),
            setGitAutoDeleteWorktrees: (gitAutoDeleteWorktrees) =>
              setPreferences((current) => ({ ...current, gitAutoDeleteWorktrees })),
            setGitAutoDeleteRetention: (gitAutoDeleteRetention) =>
              setPreferences((current) => ({ ...current, gitAutoDeleteRetention })),
            setGitPullRequestInstructions: (gitPullRequestInstructions) =>
              setPreferences((current) => ({ ...current, gitPullRequestInstructions })),
            setContrast: (contrast) =>
              setPreferences((current) => ({ ...current, contrast })),
            setAppearanceThemeColors: () => undefined,
            setCodeStyle: (codeStyle) =>
              setPreferences((current) => ({ ...current, codeStyle })),
          }}
          onTestNotificationSound={onTestNotificationSound}
          onTestSystemNotification={onTestSystemNotification}
        />
      );
    }

    render(<Wrapper />, { wrapper: createI18nWrapper("zh-CN") });

    fireEvent.click(screen.getByRole("button", { name: "测试声音" }));
    fireEvent.click(screen.getByRole("button", { name: "测试弹窗" }));

    expect(onTestNotificationSound).toHaveBeenCalledTimes(1);
    expect(onTestSystemNotification).toHaveBeenCalledTimes(1);
  });

  it("updates the displayed agent environment after selecting WSL", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /Agent 运行环境.*Windows 原生/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "WSL" }));

    expect(screen.getByRole("button", { name: /Agent 运行环境.*WSL/ })).toBeInTheDocument();
  });

  it("updates the displayed opener after selecting a new option", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "默认打开目标：VS Code" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "终端" }));

    expect(screen.getByRole("button", { name: "默认打开目标：终端" })).toBeInTheDocument();
  });

  it("closes the menu when clicking outside", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "集成终端 Shell：PowerShell" }));
    expect(screen.getByRole("menuitemradio", { name: "Git Bash" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menuitemradio", { name: "Git Bash" })).toBeNull();
  });

  it("renders the notification settings block", () => {
    renderSection();

    expect(screen.getByText("通知方式")).toBeInTheDocument();
    expect(screen.getByText("通知触发")).toBeInTheDocument();
    expect(screen.getByText("测试通知")).toBeInTheDocument();
  });

  it("offers queue and steer follow-up modes", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Steer" })).toBeInTheDocument();
  });

  it("disables steer when the current Codex config does not expose the capability", () => {
    renderSection("zh-CN", false);

    const steerOption = screen.getByRole("button", { name: "Steer" });
    expect(steerOption).toBeDisabled();
  });

  it("offers auto language detection alongside Chinese and English", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "界面语言：English (US)" }));

    expect(screen.getByRole("menuitemradio", { name: /自动检测（跟随系统）/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "中文（中国）" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /English \(US\)/ })).toBeInTheDocument();
  });

  it("toggles the embedded terminal utf-8 preference", () => {
    renderSection();

    const toggle = screen.getByRole("switch", { name: "强制内置终端使用 UTF-8" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("renders English copy when locale is en-US", () => {
    renderSection("en-US");

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Interface language")).toBeInTheDocument();
    expect(screen.getByText("Force UTF-8 for the embedded terminal")).toBeInTheDocument();
    expect(screen.getByText("Notification mode")).toBeInTheDocument();
    expect(screen.getByText("Notification trigger")).toBeInTheDocument();
  });
});
