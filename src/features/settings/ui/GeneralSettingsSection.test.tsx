import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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
          setContrast: (contrast) =>
            setPreferences((current) => ({ ...current, contrast })),
          setAppearanceThemeColors: () => undefined,
          setCodeStyle: (codeStyle) =>
            setPreferences((current) => ({ ...current, codeStyle })),
        }}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("GeneralSettingsSection", () => {
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

  it("shows the language note and the active thread-detail note", () => {
    renderSection();

    expect(
      screen.getByText(
        "默认跟随系统语言；手动切换后会保留你的选择，并立即作用于已接入 i18n 的界面。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("已作用于时间线；完整输出会额外显示 raw response 与调试项。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("会话响应中输入新内容时，发送会按当前 Follow-up 模式处理。"),
    ).toBeInTheDocument();
  });

  it("offers queue and steer follow-up modes", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Follow-up 模式：Queue" }));

    expect(screen.getByRole("menuitemradio", { name: /Queue/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Steer" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "Interrupt" })).toBeNull();
  });

  it("disables steer when the current Codex config does not expose the capability", () => {
    renderSection("zh-CN", false);

    fireEvent.click(screen.getByRole("button", { name: "Follow-up 模式：Queue" }));

    const steerOption = screen.getByRole("menuitemradio", { name: "Steer" });
    expect(steerOption).toBeDisabled();
    expect(
      screen.getByText("支持 queue、steer 两种模式；Stop 按钮仍用于终止当前响应。当前 Codex 配置未启用 steer，因此运行中追发只能排队。"),
    ).toBeInTheDocument();
  });

  it("offers auto language detection alongside Chinese and English", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "界面语言：自动检测（跟随系统）" }));

    expect(screen.getByRole("menuitemradio", { name: /自动检测（跟随系统）/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "中文（中国）" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "English (US)" })).toBeInTheDocument();
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
    expect(
      screen.getByText(
        "Defaults to the system language, keeps your manual choice once changed, and updates migrated screens immediately.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "While a response is streaming, new draft content is sent using the current follow-up mode.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Force UTF-8 for the embedded terminal")).toBeInTheDocument();
  });
});
