import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import {
  clampCodeFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeUiFontFamily,
} from "../model/fontPreferences";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";

function renderSection(locale: Locale = "zh-CN"): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
    const controller: AppPreferencesController = {
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
        setPreferences((current) => ({
          ...current,
          uiFontFamily: normalizeUiFontFamily(uiFontFamily),
        })),
      setUiFontSize: (uiFontSize) =>
        setPreferences((current) => ({
          ...current,
          uiFontSize: clampUiFontSize(uiFontSize),
        })),
      setCodeFontFamily: (codeFontFamily) =>
        setPreferences((current) => ({
          ...current,
          codeFontFamily: normalizeCodeFontFamily(codeFontFamily),
        })),
      setCodeFontSize: (codeFontSize) =>
        setPreferences((current) => ({
          ...current,
          codeFontSize: clampCodeFontSize(codeFontSize),
        })),
      setGitBranchPrefix: (gitBranchPrefix) =>
        setPreferences((current) => ({ ...current, gitBranchPrefix })),
      setGitPushForceWithLease: (gitPushForceWithLease) =>
        setPreferences((current) => ({ ...current, gitPushForceWithLease })),
    };

    return <AppearanceSettingsSection preferences={controller} />;
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("AppearanceSettingsSection", () => {
  it("offers system, light, and dark theme modes", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "主题：跟随系统" }));

    expect(screen.getByRole("menuitemradio", { name: /跟随系统/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "深色" })).toBeInTheDocument();
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
    const codeFontSizeInput = screen.getByRole("spinbutton", { name: "代码字号" });

    fireEvent.change(uiFontSizeInput, { target: { value: "4" } });
    fireEvent.blur(uiFontSizeInput);
    fireEvent.change(codeFontSizeInput, { target: { value: "99" } });
    fireEvent.blur(codeFontSizeInput);

    expect(uiFontSizeInput).toHaveValue(12);
    expect(codeFontSizeInput).toHaveValue(18);
  });

  it("renders English copy when locale is en-US", () => {
    renderSection("en-US");

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Fonts")).toBeInTheDocument();
    expect(
      screen.getByText(
        "These settings stay local to the app. UI font size mainly affects base text and form controls, while code font settings also drive code areas, diffs, and the built-in terminal.",
      ),
    ).toBeInTheDocument();
  });
});
