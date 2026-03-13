import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PREFERENCES } from "../hooks/useAppPreferences";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

function renderSection(): void {
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
          setUiLanguage: (uiLanguage) => setPreferences((current) => ({ ...current, uiLanguage })),
          setThreadDetailLevel: (threadDetailLevel) =>
            setPreferences((current) => ({ ...current, threadDetailLevel })),
          setFollowUpQueueMode: (followUpQueueMode) =>
            setPreferences((current) => ({ ...current, followUpQueueMode })),
          setComposerEnterBehavior: (composerEnterBehavior) =>
            setPreferences((current) => ({ ...current, composerEnterBehavior })),
          setComposerPermissionLevel: (composerPermissionLevel) =>
            setPreferences((current) => ({ ...current, composerPermissionLevel }))
        }}
      />
    );
  }

  render(<Wrapper />);
}

describe("GeneralSettingsSection", () => {
  it("updates the displayed agent environment after selecting WSL", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: /Agent environment.*Windows native/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "WSL" }));

    expect(screen.getByRole("button", { name: /Agent environment.*WSL/ })).toBeInTheDocument();
  });

  it("updates the displayed opener after selecting a new option", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "默认打开目标：VS Code" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Terminal" }));

    expect(screen.getByRole("button", { name: "默认打开目标：Terminal" })).toBeInTheDocument();
  });

  it("closes the menu when clicking outside", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "集成终端 Shell：PowerShell" }));
    expect(screen.getByRole("menuitemradio", { name: "Git Bash" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menuitemradio", { name: "Git Bash" })).toBeNull();
  });

  it("shows the language pending note and the active thread-detail note", () => {
    renderSection();

    expect(screen.getByText("当前先保存偏好，未做完整 UI 国际化切换。")).toBeInTheDocument();
    expect(screen.getByText("已作用于时间线；完整输出会额外显示 raw response 与调试项。")).toBeInTheDocument();
  });
});
