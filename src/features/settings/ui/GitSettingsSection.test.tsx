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

  it("saves pull request preferences", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "压缩" }));
    expect(screen.getByRole("button", { name: "压缩" })).toHaveAttribute("aria-pressed", "true");

    const draftSwitch = screen.getByRole("switch", { name: "创建草稿拉取请求" });
    expect(draftSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(draftSwitch);
    expect(draftSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.change(screen.getByRole("textbox", { name: "拉取请求指令" }), {
      target: { value: "突出风险和验证步骤。" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[1]);

    expect(screen.getByDisplayValue("突出风险和验证步骤。")).toBeInTheDocument();
  });

  it("updates worktree cleanup preferences", () => {
    renderSection();

    const autoDeleteSwitch = screen.getByRole("switch", { name: "自动删除旧工作树" });
    expect(autoDeleteSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(autoDeleteSwitch);
    expect(autoDeleteSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.change(screen.getByRole("spinbutton", { name: "自动删除限制" }), {
      target: { value: "8" },
    });

    expect(screen.getByDisplayValue("8")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "提交指令" })).toBeEnabled();
  });
});
