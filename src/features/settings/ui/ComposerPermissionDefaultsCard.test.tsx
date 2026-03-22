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
  };
}

function renderCard(locale: Locale = "zh-CN"): void {
  function Wrapper(): JSX.Element {
    const [preferences, setPreferences] = useState(DEFAULT_APP_PREFERENCES);
    return (
      <ComposerPermissionDefaultsCard
        preferences={createPreferencesController(preferences, setPreferences)}
      />
    );
  }

  render(<Wrapper />, { wrapper: createI18nWrapper(locale) });
}

describe("ComposerPermissionDefaultsCard", () => {
  it("updates the standard approval policy after selecting on-failure", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "标准权限 · 审批策略：on-request" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "on-failure" }));

    expect(screen.getByRole("button", { name: "标准权限 · 审批策略：on-failure" })).toBeInTheDocument();
  });

  it("shows the app-local note for permission defaults", () => {
    renderCard();

    expect(screen.getByText("这是应用内默认行为，影响后续新建线程和后续发送，不会改写 ~/.codex/config.toml。")).toBeInTheDocument();
  });

  it("renders English copy when locale is en-US", () => {
    renderCard("en-US");

    expect(screen.getByText("Composer permission defaults")).toBeInTheDocument();
    expect(screen.getByText("Standard permission · Approval policy")).toBeInTheDocument();
    expect(screen.getByText("Full access · Sandbox mode")).toBeInTheDocument();
  });
});
