import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_APP_UPDATE_STATE } from "../../../domain/appUpdate";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencesController,
} from "../hooks/useAppPreferences";
import { SettingsView, type SettingsViewProps } from "./SettingsView";

function createPreferencesController(): AppPreferencesController {
  return {
    ...DEFAULT_APP_PREFERENCES,
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

function createBaseProps(
  overrides: Partial<SettingsViewProps> = {}
): SettingsViewProps {
  return {
    appUpdate: INITIAL_APP_UPDATE_STATE,
    section: "general",
    roots: [],
    preferences: createPreferencesController(),
    resolvedTheme: "light",
    configSnapshot: { config: {} },
    busy: false,
    ready: true,
    windowsSandboxSetup: { pending: false, mode: null, success: null, error: null },
    onBackHome: vi.fn(),
    onSelectSection: vi.fn(),
    onAddRoot: vi.fn(),
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] }),
    refreshAuthState: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    readGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    writeGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    listCodexProviders: vi.fn().mockResolvedValue({ version: 1, providers: [] }),
    upsertCodexProvider: vi.fn(),
    deleteCodexProvider: vi.fn(),
    applyCodexProvider: vi.fn(),
    getCodexAuthModeState: vi.fn().mockResolvedValue({
      activeMode: "chatgpt",
      activeProviderId: null,
      activeProviderKey: null,
      oauthSnapshotAvailable: false,
    }),
    activateCodexChatgpt: vi.fn().mockResolvedValue({
      mode: "chatgpt",
      providerId: null,
      providerKey: null,
      authPath: "C:/Users/Administrator/.codex/auth.json",
      configPath: "C:/Users/Administrator/.codex/config.toml",
      restoredFromSnapshot: false,
    }),
    refreshMcpData: vi.fn(),
    listArchivedThreads: vi.fn().mockResolvedValue([]),
    unarchiveThread: vi.fn().mockResolvedValue(undefined),
    writeConfigValue: vi.fn().mockResolvedValue({}),
    batchWriteConfig: vi.fn().mockResolvedValue({}),
    checkForAppUpdate: vi.fn().mockResolvedValue(undefined),
    installAppUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("SettingsView", () => {
  it("renders appearance settings in the appearance section", () => {
    render(<SettingsView {...createBaseProps({ section: "appearance" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByText("主题")).toBeInTheDocument();
    expect(screen.getByText("代码风格")).toBeInTheDocument();
  });

  it("does not render composer permission defaults in the general section", () => {
    render(<SettingsView {...createBaseProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByText("Composer 权限默认值")).toBeNull();
  });

  it("renders composer permission defaults in the config section", () => {
    render(<SettingsView {...createBaseProps({ section: "config" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByText("Composer 权限默认值")).toBeInTheDocument();
  });

  it("moves app updates out of the general section", () => {
    render(<SettingsView {...createBaseProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByText("应用更新")).toBeNull();
  });

  it("renders app updates in the about section", () => {
    render(<SettingsView {...createBaseProps({ section: "about" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
    expect(screen.getByText("应用更新")).toBeInTheDocument();
  });
});
