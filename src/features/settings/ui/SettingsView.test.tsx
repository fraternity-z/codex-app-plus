import { fireEvent, render, screen } from "@testing-library/react";
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
    setGitCommitInstructions: vi.fn(),
    setGitPullRequestMergeMethod: vi.fn(),
    setGitDraftPullRequest: vi.fn(),
    setGitAutoDeleteWorktrees: vi.fn(),
    setGitAutoDeleteRetention: vi.fn(),
    setGitPullRequestInstructions: vi.fn(),
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
    sidebarCollapsed: false,
    roots: [],
    worktrees: [],
    onCreateWorktree: vi.fn().mockResolvedValue(undefined),
    onDeleteWorktree: vi.fn().mockResolvedValue(undefined),
    preferences: createPreferencesController(),
    resolvedTheme: "light",
    configSnapshot: createConfigSnapshot(),
    selectedConversationId: "thread-1",
    experimentalFeatures: [],
    steerAvailable: true,
    busy: false,
    ready: true,
    onBackHome: vi.fn(),
    onSelectSection: vi.fn(),
    onAddRoot: vi.fn(),
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    onOpenConfigDocs: vi.fn().mockResolvedValue(undefined),
    onOpenMcpDocs: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] }),
    readGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    listManagedPrompts: vi.fn().mockResolvedValue([]),
    upsertManagedPrompt: vi.fn().mockResolvedValue({
      name: "system-prompt",
      path: "~/.codex/prompts/codex-app-plus/system-prompt.md",
      content: "",
    }),
    deleteManagedPrompt: vi.fn().mockResolvedValue(undefined),
    setUserModelInstructionsFile: vi.fn().mockResolvedValue(undefined),
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
    readBrowserUseSettings: vi.fn().mockResolvedValue({
      approvalMode: "alwaysAsk",
      allowedOrigins: [],
      deniedOrigins: [],
    }),
    writeBrowserUseApprovalMode: vi.fn().mockResolvedValue({
      approvalMode: "alwaysAsk",
      allowedOrigins: [],
      deniedOrigins: [],
    }),
    addBrowserUseOrigin: vi.fn().mockResolvedValue({
      approvalMode: "alwaysAsk",
      allowedOrigins: [],
      deniedOrigins: [],
    }),
    removeBrowserUseOrigin: vi.fn().mockResolvedValue({
      approvalMode: "alwaysAsk",
      allowedOrigins: [],
      deniedOrigins: [],
    }),
    clearBrowserBrowsingData: vi.fn().mockResolvedValue(undefined),
    refreshMcpData: vi.fn(),
    listArchivedThreads: vi.fn().mockResolvedValue([]),
    unarchiveThread: vi.fn().mockResolvedValue(undefined),
    writeConfigValue: vi.fn().mockResolvedValue({}),
    batchWriteConfig: vi.fn().mockResolvedValue({}),
    batchWriteConfigSnapshot: vi.fn().mockResolvedValue({}),
    setThreadMemoryMode: vi.fn().mockResolvedValue(undefined),
    resetMemories: vi.fn().mockResolvedValue(undefined),
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

  it("renders proxy settings in the general section", () => {
    render(<SettingsView {...createBaseProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByText("代理")).toBeInTheDocument();
  });

  it("does not render proxy settings in the config section", () => {
    render(<SettingsView {...createBaseProps({ section: "config" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByText("代理")).toBeNull();
  });

  it("renders composer settings above agents inside the config section", () => {
    const { container } = render(<SettingsView {...createBaseProps({ section: "config" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByText("自定义 config.toml 设置")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agents" })).toBeNull();
    const composerSection = screen.getByText("自定义 config.toml 设置");
    const agentsSection = screen.getByText("Agents");
    expect(
      composerSection.compareDocumentPosition(agentsSection)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector(".settings-config-composer-section")).not.toBeNull();
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

  it("marks the settings sidebar collapsed", () => {
    const { container } = render(<SettingsView {...createBaseProps({ sidebarCollapsed: true })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(container.querySelector(".settings-layout-sidebar-collapsed")).not.toBeNull();
  });

  it("renders browser use settings", async () => {
    render(<SettingsView {...createBaseProps({ section: "browserUse" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "浏览器使用" })).toBeInTheDocument();
    expect(await screen.findByText("Browser Use")).toBeInTheDocument();
    expect(screen.getByText("清除 Cookie")).toBeInTheDocument();
  });

  it("keeps the settings sidebar visible while adding an MCP server", async () => {
    const { container } = render(<SettingsView {...createBaseProps({
      section: "mcp",
      refreshMcpData: vi.fn().mockResolvedValue({ config: createConfigSnapshot(), reload: {}, statuses: [] }),
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("button", { name: "MCP 服务" })).toBeInTheDocument();
    expect(container.querySelector(".settings-sidebar")).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(await screen.findByRole("button", { name: "添加服务器" }));

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MCP 服务" })).toBeInTheDocument();
    expect(container.querySelector(".settings-sidebar")).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector(".settings-dialog-backdrop")).toBeNull();
  });
});
