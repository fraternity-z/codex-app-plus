import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    setSelectedPetId: vi.fn(),
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
    selectedRoot: null,
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
    petAwake: false,
    onBackHome: vi.fn(),
    onSelectSection: vi.fn(),
    onAddRoot: vi.fn(),
    onTogglePetAwake: vi.fn(),
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    onOpenConfigDocs: vi.fn().mockResolvedValue(undefined),
    onOpenMcpDocs: vi.fn().mockResolvedValue(undefined),
    writeProjectPermissionConfig: vi.fn().mockResolvedValue({ filePath: "E:/code/project/.codex/config.toml" }),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, origins: {}, layers: [] }),
    readGlobalAgentInstructions: vi.fn().mockResolvedValue({ path: "~/.codex/AGENTS.md", content: "" }),
    listCustomPets: vi.fn().mockResolvedValue({
      avatarDirectory: "C:\\Users\\Administrator\\.codex\\pets",
      avatars: [],
    }),
    openCustomPetsFolder: vi.fn().mockResolvedValue(undefined),
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
    readMcpSharedPoolSettings: vi.fn().mockResolvedValue({
      settings: { enabled: false },
    }),
    writeMcpSharedPoolSettings: vi.fn().mockResolvedValue({
      settings: { enabled: true },
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
    clearBrowserBrowsingDataByKind: vi.fn().mockResolvedValue(undefined),
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

  it("keeps about out of the settings sidebar", () => {
    render(<SettingsView {...createBaseProps({ section: "about" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关于" })).toBeNull();
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
    expect(screen.getByText("清除所有浏览数据")).toBeInTheDocument();
  });

  it("renders hooks as a TODO placeholder section", () => {
    render(<SettingsView {...createBaseProps({ section: "hooks" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("button", { name: "钩子" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "钩子" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新钩子" })).toBeDisabled();
    expect(screen.getByText("No hooks found")).toBeInTheDocument();
    expect(screen.getByText("Projects with configured hooks will appear here")).toBeInTheDocument();
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("renders connections as a TODO placeholder section", () => {
    render(<SettingsView {...createBaseProps({ section: "connections" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("button", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByText("SSH connections from this PC")).toBeInTheDocument();
    expect(screen.getByText("Connect to a remote device through SSH connection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });

  it("expands browser use browsing data cleanup details separately from the clear all button", async () => {
    const clearBrowserBrowsingDataByKind = vi.fn().mockResolvedValue(undefined);
    render(<SettingsView {...createBaseProps({
      section: "browserUse",
      clearBrowserBrowsingDataByKind,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(await screen.findByText("Browser Use")).toBeInTheDocument();
    expect(screen.queryByText("删除 Cookie")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开浏览数据清理项" }));

    expect(screen.getByRole("button", { name: "清除所有浏览数据" })).toBeInTheDocument();
    expect(screen.getByText("Cookie")).toBeInTheDocument();
    expect(screen.getByText("删除 Cookie")).toBeInTheDocument();
    expect(screen.getByText("网站数据")).toBeInTheDocument();
    expect(screen.getByText("删除网站数据")).toBeInTheDocument();
    expect(screen.getByText("缓存的图片和文件")).toBeInTheDocument();
    expect(screen.getByText("删除缓存的图片和文件")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除 Cookie" }));

    expect(clearBrowserBrowsingDataByKind).toHaveBeenCalledWith({ kind: "cookies" });
  });

  it("keeps browser use domain forms collapsed until adding a domain", async () => {
    render(<SettingsView {...createBaseProps({ section: "browserUse" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByPlaceholderText("example.com")).toBeNull();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "添加" })[0]).not.toBeDisabled();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "添加" })[0]!);

    expect(screen.getByPlaceholderText("example.com")).toBeInTheDocument();
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
