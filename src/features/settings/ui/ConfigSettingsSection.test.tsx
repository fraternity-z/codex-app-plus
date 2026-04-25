import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import { ConfigSettingsSection } from "./ConfigSettingsSection";

function createPreferencesController(): AppPreferencesController {
  return {
    ...DEFAULT_APP_PREFERENCES,
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
    setComposerDefaultApprovalPolicy: vi.fn(),
    setComposerDefaultSandboxMode: vi.fn(),
    setComposerFullApprovalPolicy: vi.fn(),
    setComposerFullSandboxMode: vi.fn(),
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

function renderSection(
  props: ComponentProps<typeof ConfigSettingsSection>,
  locale: Locale = "zh-CN"
) {
  return render(<ConfigSettingsSection {...props} />, {
    wrapper: createI18nWrapper(locale)
  });
}

function createBaseProps(
  overrides: Partial<ComponentProps<typeof ConfigSettingsSection>> = {}
): ComponentProps<typeof ConfigSettingsSection> {
  return {
    preferences: createPreferencesController(),
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    onOpenConfigDocs: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ConfigSettingsSection", () => {
  it("renders basic config section elements", async () => {
    renderSection(createBaseProps());

    expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByText("配置审批策略和沙盒设置")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "了解更多" })).toHaveAttribute(
      "href",
      "https://developers.openai.com/codex/config-basic",
    );
    expect(screen.getByText("自定义 config.toml 设置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 config.toml" })).toBeInTheDocument();
    expect(screen.getByText("批准策略")).toBeInTheDocument();
    expect(screen.getByText("沙盒设置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "批准策略：On request" })).toBeInTheDocument();
    expect(screen.queryByText("提供商配置管理")).toBeNull();
  });

  it("renders English copy when locale is en-US", async () => {
    renderSection(createBaseProps(), "en-US");

    expect(screen.getByRole("heading", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByText("Configure approval policies and sandbox settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "https://developers.openai.com/codex/config-basic",
    );
    expect(screen.getByText("Custom config.toml settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open config.toml" })).toBeInTheDocument();
    expect(screen.getByText("Approval policy")).toBeInTheDocument();
    expect(screen.getByText("Sandbox settings")).toBeInTheDocument();
    expect(screen.queryByText("Provider Configuration Management")).toBeNull();
  });

  it("opens config docs through the provided handler", () => {
    const onOpenConfigDocs = vi.fn().mockResolvedValue(undefined);
    renderSection(createBaseProps({ onOpenConfigDocs }));

    fireEvent.click(screen.getByRole("link", { name: "了解更多" }));

    expect(onOpenConfigDocs).toHaveBeenCalledTimes(1);
  });
});
