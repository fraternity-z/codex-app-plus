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
          setNotificationDeliveryMode: () => undefined,
          setNotificationTriggerMode: () => undefined,
          setSubagentNotificationsEnabled: () => undefined,
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
          setGitBranchPrefix: (gitBranchPrefix) =>
            setPreferences((current) => ({ ...current, gitBranchPrefix })),
          setGitPushForceWithLease: (gitPushForceWithLease) =>
            setPreferences((current) => ({ ...current, gitPushForceWithLease })),
          setGitCommitInstructions: (gitCommitInstructions) =>
            setPreferences((current) => ({ ...current, gitCommitInstructions })),
          setContrast: () => undefined,
          setAppearanceThemeColors: () => undefined,
          setCodeStyle: () => undefined,
        }}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper("zh-CN") });
}

describe("GitSettingsSection", () => {
  it("updates branch prefix input when the value changes", () => {
    renderSection();

    fireEvent.change(screen.getByRole("textbox", { name: "分支前缀" }), {
      target: { value: "feature/" }
    });

    expect(screen.getByDisplayValue("feature/")).toBeInTheDocument();
  });

  it("toggles force-with-lease state", () => {
    renderSection();

    const switchControl = screen.getByRole("switch", { name: "始终强制推送" });
    expect(switchControl).toHaveAttribute("aria-checked", "false");

    fireEvent.click(switchControl);

    expect(screen.getByRole("switch", { name: "始终强制推送" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves commit instructions", () => {
    renderSection();

    fireEvent.change(screen.getByRole("textbox", { name: "提交指令" }), {
      target: { value: "使用 Conventional Commits。" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);

    expect(screen.getByDisplayValue("使用 Conventional Commits。")).toBeInTheDocument();
  });

  it("marks unfinished Git controls in the copy", () => {
    renderSection();

    expect(screen.getByText("选择 Codex 合并拉取请求的方法（未完成：暂未接入保存）")).toBeInTheDocument();
    expect(screen.getByText("留空自动生成提交消息时，会把这些指令加入提示。")).toBeInTheDocument();
    expect(screen.getByText("未完成：暂未添加到 PR 标题/描述生成提示中")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "自动删除限制" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "提交指令" })).toBeEnabled();
  });
});
