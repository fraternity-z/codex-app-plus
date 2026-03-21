import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { DEFAULT_APP_PREFERENCES } from "../hooks/useAppPreferences";
import {
  clampCodeFontSize,
  clampTerminalFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeTerminalFontFamily,
  normalizeUiFontFamily,
} from "../model/fontPreferences";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

function renderSection(locale: Locale = "zh-CN"): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);

    return (
      <GeneralSettingsSection
        preferences={{
          ...preferences,
          setAgentEnvironment: (agentEnvironment) => setPreferences((current) => ({ ...current, agentEnvironment })),
          setWorkspaceOpener: (workspaceOpener) => setPreferences((current) => ({ ...current, workspaceOpener })),
          setEmbeddedTerminalShell: (embeddedTerminalShell) =>
            setPreferences((current) => ({ ...current, embeddedTerminalShell })),
          setEmbeddedTerminalUtf8: (embeddedTerminalUtf8) =>
            setPreferences((current) => ({ ...current, embeddedTerminalUtf8 })),
          setThemeMode: (themeMode) => setPreferences((current) => ({ ...current, themeMode })),
          setUiLanguage: (uiLanguage) => setPreferences((current) => ({ ...current, uiLanguage })),
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
            setPreferences((current) => ({ ...current, uiFontFamily: normalizeUiFontFamily(uiFontFamily) })),
          setUiFontSize: (uiFontSize) =>
            setPreferences((current) => ({ ...current, uiFontSize: clampUiFontSize(uiFontSize) })),
          setCodeFontFamily: (codeFontFamily) =>
            setPreferences((current) => ({ ...current, codeFontFamily: normalizeCodeFontFamily(codeFontFamily) })),
          setCodeFontSize: (codeFontSize) =>
            setPreferences((current) => ({ ...current, codeFontSize: clampCodeFontSize(codeFontSize) })),
          setTerminalFontFamily: (terminalFontFamily) =>
            setPreferences((current) => ({
              ...current,
              terminalFontFamily: normalizeTerminalFontFamily(terminalFontFamily),
            })),
          setTerminalFontSize: (terminalFontSize) =>
            setPreferences((current) => ({
              ...current,
              terminalFontSize: clampTerminalFontSize(terminalFontSize),
            })),
          setGitBranchPrefix: (gitBranchPrefix) =>
            setPreferences((current) => ({ ...current, gitBranchPrefix })),
          setGitPushForceWithLease: (gitPushForceWithLease) =>
            setPreferences((current) => ({ ...current, gitPushForceWithLease }))
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

    expect(screen.getByText("默认跟随系统深浅色，也可以手动固定浅色或深色界面。")).toBeInTheDocument();
    expect(screen.getByText("默认跟随系统语言；手动切换后会保留你的选择，并立即作用于已接入 i18n 的界面。")).toBeInTheDocument();
    expect(screen.getByText("已作用于时间线；完整输出会额外显示 raw response 与调试项。")).toBeInTheDocument();
  });

  it("offers system, light, and dark theme modes", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "主题：跟随系统" }));

    expect(screen.getByRole("menuitemradio", { name: /跟随系统/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "深色" })).toBeInTheDocument();
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

  it("commits custom font families on blur", () => {
    renderSection();

    const uiFontInput = screen.getByRole("textbox", { name: "UI 字体" });
    const codeFontInput = screen.getByRole("textbox", { name: "代码字体" });

    fireEvent.change(uiFontInput, { target: { value: "IBM Plex Sans" } });
    fireEvent.blur(uiFontInput);
    fireEvent.change(codeFontInput, { target: { value: "JetBrains Mono" } });
    fireEvent.blur(codeFontInput);

    expect(uiFontInput).toHaveValue("IBM Plex Sans");
    expect(codeFontInput).toHaveValue("JetBrains Mono");
  });

  it("clamps font sizes after blur", () => {
    renderSection();

    const uiFontSizeInput = screen.getByRole("spinbutton", { name: "UI 字号" });
    const terminalFontSizeInput = screen.getByRole("spinbutton", { name: "终端字号" });

    fireEvent.change(uiFontSizeInput, { target: { value: "4" } });
    fireEvent.blur(uiFontSizeInput);
    fireEvent.change(terminalFontSizeInput, { target: { value: "99" } });
    fireEvent.blur(terminalFontSizeInput);

    expect(uiFontSizeInput).toHaveValue(12);
    expect(terminalFontSizeInput).toHaveValue(20);
  });

  it("renders English copy when locale is en-US", () => {
    renderSection("en-US");

    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Defaults to the system color scheme, but you can lock the app to light or dark.")).toBeInTheDocument();
    expect(screen.getByText("Display fonts")).toBeInTheDocument();
    expect(screen.getByText("Interface language")).toBeInTheDocument();
    expect(screen.getByText("Defaults to the system language, keeps your manual choice once changed, and updates migrated screens immediately.")).toBeInTheDocument();
    expect(screen.getByText("Force UTF-8 for the embedded terminal")).toBeInTheDocument();
  });
});
