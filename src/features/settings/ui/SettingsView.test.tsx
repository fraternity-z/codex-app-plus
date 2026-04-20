import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
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

function createConfigSnapshot(): ConfigReadResponse {
  return {
    config: {},
    origins: {},
    layers: [],
  } as unknown as ConfigReadResponse;
}

function createBaseProps(
  overrides: Partial<SettingsViewProps> = {}
): SettingsViewProps {
  return {
    appUpdate: INITIAL_APP_UPDATE_STATE,
    section: "general",
    roots: [],
    worktrees: [],
    onCreateWorktree: vi.fn().mockResolvedValue(undefined),
    onDeleteWorktree: vi.fn().mockResolvedValue(undefined),
    preferences: createPreferencesController(),
    resolvedTheme: "light",
    configSnapshot: createConfigSnapshot(),
    experimentalFeatures: [],
    steerAvailable: true,
    busy: false,
    ready: true,
    onBackHome: vi.fn(),
    onSelectSection: vi.fn(),
    onAddRoot: vi.fn(),
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] }),
    readGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    getAgentsSettings: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    createAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    updateAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    deleteAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    readAgentConfig: vi.fn().mockResolvedValue({ content: "" }),
    writeAgentConfig: vi.fn().mockResolvedValue({ content: "" }),
    readProxySettings: vi.fn().mockResolvedValue({
      settings: {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
    writeGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    writeProxySettings: vi.fn().mockResolvedValue({
      settings: {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
    onOpenExternal: vi.fn().mockResolvedValue(undefined),
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

  it("renders composer permission defaults in the general section", () => {
    render(<SettingsView {...createBaseProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByText("Composer 权限默认值")).toBeInTheDocument();
  });

  it("does not render composer permission defaults in the config section", () => {
    render(<SettingsView {...createBaseProps({ section: "config" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByText("Composer 权限默认值")).toBeNull();
  });

  it("renders agents settings in the agents section", () => {
    render(<SettingsView {...createBaseProps({ section: "agents" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "Agents" })).toBeInTheDocument();
  });

  it("moves app updates out of the general section", () => {
    render(<SettingsView {...createBaseProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByText("应用更新")).toBeNull();
  });

  it("renders managed worktree list without main worktree", () => {
    render(<SettingsView {...createBaseProps({
      section: "worktree",
      worktrees: [
        {
          path: "E:/worktrees/feature-a",
          branch: "feature-a",
          head: null,
          isCurrent: false,
          isLocked: false,
          prunable: false,
        },
      ],
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "工作树" })).toBeInTheDocument();
    expect(screen.getByText("尚无工作树")).toBeInTheDocument();
    expect(screen.getByText("feature-a")).toBeInTheDocument();
    expect(screen.queryByText("main")).toBeNull();
  });
});
