import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { DEFAULT_APP_PREFERENCES } from "../hooks/useAppPreferences";
import { GitSettingsSection } from "./GitSettingsSection";

function renderSection(): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);

    return (
      <GitSettingsSection
        preferences={{
          ...preferences,
          setAgentEnvironment: () => undefined,
          setWorkspaceOpener: () => undefined,
          setEmbeddedTerminalShell: () => undefined,
          setEmbeddedTerminalUtf8: () => undefined,
          setThemeMode: () => undefined,
          setUiLanguage: () => undefined,
          setThreadDetailLevel: () => undefined,
          setFollowUpQueueMode: () => undefined,
          setComposerEnterBehavior: () => undefined,
          setComposerPermissionLevel: () => undefined,
          setComposerDefaultApprovalPolicy: () => undefined,
          setComposerDefaultSandboxMode: () => undefined,
          setComposerFullApprovalPolicy: () => undefined,
          setComposerFullSandboxMode: () => undefined,
          setUiFontFamily: () => undefined,
          setUiFontSize: () => undefined,
          setCodeFontFamily: () => undefined,
          setCodeFontSize: () => undefined,
          setTerminalFontFamily: () => undefined,
          setTerminalFontSize: () => undefined,
          setGitBranchPrefix: (gitBranchPrefix) =>
            setPreferences((current) => ({ ...current, gitBranchPrefix })),
          setGitPushForceWithLease: (gitPushForceWithLease) =>
            setPreferences((current) => ({ ...current, gitPushForceWithLease }))
        }}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper("zh-CN") });
}

describe("GitSettingsSection", () => {
  it("updates branch prefix preview when the input changes", () => {
    renderSection();

    fireEvent.change(screen.getByRole("textbox", { name: "分支前缀" }), {
      target: { value: "feature/" }
    });

    expect(screen.getByDisplayValue("feature/")).toBeInTheDocument();
    expect(screen.getByText("创建时会得到：feature/feature/login")).toBeInTheDocument();
  });

  it("toggles force-with-lease state and copy", () => {
    renderSection();

    const switchControl = screen.getByRole("switch");
    expect(switchControl).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("当前未启用，内置推送会保持普通 `git push`。")).toBeInTheDocument();

    fireEvent.click(switchControl);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("当前已启用，推送确认框也会明确展示该参数。")).toBeInTheDocument();
  });
});
