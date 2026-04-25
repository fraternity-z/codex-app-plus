import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferences,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import { ComposerPermissionDefaultsCard } from "./ComposerPermissionDefaultsCard";

function createPreferencesController(
  preferences: AppPreferences,
  setPreferences: Dispatch<SetStateAction<AppPreferences>>
): AppPreferencesController {
  return {
    ...preferences,
    setAgentEnvironment: vi.fn(),
    setWorkspaceOpener: vi.fn(),
    setEmbeddedTerminalShell: vi.fn(),
    setEmbeddedTerminalUtf8: vi.fn(),
    setNotificationDeliveryMode: vi.fn(),
    setNotificationTriggerMode: vi.fn(),
    setSubagentNotificationsEnabled: vi.fn(),
    setThemeMode: vi.fn(),
    setUiLanguage: vi.fn(),
    setThreadDetailLevel: vi.fn(),
    setFollowUpQueueMode: vi.fn(),
    setComposerEnterBehavior: vi.fn(),
    setComposerPermissionLevel: vi.fn(),
    setComposerDefaultApprovalPolicy: (composerDefaultApprovalPolicy) =>
      setPreferences((current) => ({ ...current, composerDefaultApprovalPolicy })),
    setComposerDefaultSandboxMode: (composerDefaultSandboxMode) =>
      setPreferences((current) => ({ ...current, composerDefaultSandboxMode })),
    setComposerFullApprovalPolicy: (composerFullApprovalPolicy) =>
      setPreferences((current) => ({ ...current, composerFullApprovalPolicy })),
    setComposerFullSandboxMode: (composerFullSandboxMode) =>
      setPreferences((current) => ({ ...current, composerFullSandboxMode })),
    setUiFontFamily: vi.fn(),
    setUiFontSize: vi.fn(),
    setCodeFontFamily: vi.fn(),
    setCodeFontSize: vi.fn(),
    setGitBranchPrefix: vi.fn(),
    setGitPushForceWithLease: vi.fn(),
    setContrast: vi.fn(),
    setAppearanceThemeColors: vi.fn(),
    setCodeStyle: vi.fn(),
  };
}

function renderCard(locale: Locale = "zh-CN"): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
    return (
      <ComposerPermissionDefaultsCard
        preferences={createPreferencesController(preferences, setPreferences)}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("ComposerPermissionDefaultsCard", () => {
  it("updates the standard approval policy after selecting on-failure", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "批准策略：On request" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "On failure" }));

    expect(screen.getByRole("button", { name: "批准策略：On failure" })).toBeInTheDocument();
  });

  it("renders the permission defaults title and descriptions", () => {
    renderCard();

    expect(screen.getByText("自定义 config.toml 设置")).toBeInTheDocument();
    expect(screen.getByText("选择 Codex 何时请求批准")).toBeInTheDocument();
    expect(screen.getByText("选择 Codex 的命令执行权限")).toBeInTheDocument();
    expect(screen.queryByText("完全访问 · 审批策略")).toBeNull();
    expect(screen.queryByText("完全访问 · 访问模式")).toBeNull();
  });

  it("renders English copy when locale is en-US", () => {
    renderCard("en-US");

    expect(screen.getByText("Custom config.toml settings")).toBeInTheDocument();
    expect(screen.getByText("Approval policy")).toBeInTheDocument();
    expect(screen.getByText("Sandbox settings")).toBeInTheDocument();
    expect(screen.queryByText("Full access · Access mode")).toBeNull();
  });
});
