import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PREFERENCES } from "../../../app/useAppPreferences";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

function renderSection(): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);

    return (
      <GeneralSettingsSection
        preferences={{
          ...preferences,
          setWorkspaceOpener: (workspaceOpener) => setPreferences((current) => ({ ...current, workspaceOpener })),
          setEmbeddedTerminalShell: (embeddedTerminalShell) =>
            setPreferences((current) => ({ ...current, embeddedTerminalShell })),
          setUiLanguage: (uiLanguage) => setPreferences((current) => ({ ...current, uiLanguage })),
          setThreadDetailLevel: (threadDetailLevel) =>
            setPreferences((current) => ({ ...current, threadDetailLevel })),
          setFollowUpQueueMode: (followUpQueueMode) =>
            setPreferences((current) => ({ ...current, followUpQueueMode })),
          setComposerEnterBehavior: (composerEnterBehavior) =>
            setPreferences((current) => ({ ...current, composerEnterBehavior }))
        }}
      />
    );
  }

  render(<Wrapper />);
}

describe("GeneralSettingsSection", () => {
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

  it("shows the pending-effect notes for language and thread detail", () => {
    renderSection();

    expect(screen.getByText("当前先保存偏好，未做完整 UI 国际化切换。")).toBeInTheDocument();
    expect(screen.getByText("用于控制时间线细节展示。")).toBeInTheDocument();
  });
});
