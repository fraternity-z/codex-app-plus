import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { HookMetadata } from "../../../protocol/generated/v2/HookMetadata";
import type { HooksListResponse } from "../../../protocol/generated/v2/HooksListResponse";
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

function createHookMetadata(overrides: Partial<HookMetadata> = {}): HookMetadata {
  return {
    key: "hook-1",
    eventName: "preToolUse",
    handlerType: "command",
    matcher: "Bash",
    command: "py -3 E:/repo/.codex/hooks/pre_tool_use.py",
    timeoutSec: 30n,
    statusMessage: "Checking Bash command",
    sourcePath: "E:/repo/.codex/hooks.json",
    source: "project",
    pluginId: null,
    displayOrder: 1n,
    enabled: true,
    isManaged: false,
    currentHash: "abcdef1234567890",
    trustStatus: "trusted",
    ...overrides,
  };
}

function createHooksResponse(
  overrides: Partial<HooksListResponse> = {},
): HooksListResponse {
  return {
    data: [],
    ...overrides,
  };
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
    onOpenHooksDocs: vi.fn().mockResolvedValue(undefined),
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
    applyAgentsConfig: vi.fn().mockResolvedValue(undefined),
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
    readComputerUseSettings: vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "allowVisible",
      allowedApps: [],
      deniedApps: [],
    }),
    writeComputerUseApprovalMode: vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "requireApprovals",
      allowedApps: [],
      deniedApps: [],
    }),
    addComputerUseApp: vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "allowVisible",
      allowedApps: ["notepad"],
      deniedApps: [],
    }),
    removeComputerUseApp: vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "allowVisible",
      allowedApps: [],
      deniedApps: [],
    }),
    clearBrowserBrowsingData: vi.fn().mockResolvedValue(undefined),
    clearBrowserBrowsingDataByKind: vi.fn().mockResolvedValue(undefined),
    refreshMcpData: vi.fn(),
    listHooks: vi.fn().mockResolvedValue(createHooksResponse()),
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

  it("renders computer use settings", async () => {
    render(<SettingsView {...createBaseProps({ section: "computerUse" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("heading", { name: "电脑操控" })).toBeInTheDocument();
    expect(await screen.findByText("Computer Use")).toBeInTheDocument();
    expect(screen.getByText("访问策略")).toBeInTheDocument();
    expect(screen.getByText("默认应用访问")).toBeInTheDocument();
    expect(screen.getByText("已屏蔽的应用")).toBeInTheDocument();
  });

  it("lists configured hooks through the official app-server method", async () => {
    const listHooks = vi.fn().mockResolvedValue(createHooksResponse({
      data: [{
        cwd: "E:/repo",
        hooks: [createHookMetadata()],
        warnings: ["hooks.json and inline [hooks] are both configured"],
        errors: [{ path: "E:/repo/.codex/hooks.json", message: "invalid matcher regex" }],
      }],
    }));
    const onOpenHooksDocs = vi.fn().mockResolvedValue(undefined);

    render(<SettingsView {...createBaseProps({
      section: "hooks",
      roots: [
        { id: "repo", name: "repo", path: "E:/repo" },
        { id: "other", name: "other", path: "E:/other" },
      ],
      selectedRoot: { id: "repo", name: "repo", path: "E:/repo" },
      listHooks,
      onOpenHooksDocs,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByRole("button", { name: "钩子" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "钩子" })).toBeInTheDocument();
    expect(await screen.findByText("PreToolUse")).toBeInTheDocument();
    expect(screen.getByText("Checking Bash command")).toBeInTheDocument();
    expect(screen.getByText("py -3 E:/repo/.codex/hooks/pre_tool_use.py")).toBeInTheDocument();
    expect(screen.getByText("已信任")).toBeInTheDocument();
    expect(screen.getByText("hooks.json and inline [hooks] are both configured")).toBeInTheDocument();
    expect(screen.getAllByText((_, node) => node?.textContent?.includes("invalid matcher regex") ?? false).length).toBeGreaterThan(0);
    expect(listHooks).toHaveBeenCalledWith(["E:/repo", "E:/other"]);

    fireEvent.click(screen.getByRole("button", { name: "了解更多" }));
    expect(onOpenHooksDocs).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "刷新钩子" }));
    await waitFor(() => {
      expect(listHooks).toHaveBeenCalledTimes(2);
    });
  });

  it("renders hooks empty state without the old TODO placeholder", async () => {
    render(<SettingsView {...createBaseProps({ section: "hooks" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(await screen.findByText("没有找到钩子")).toBeInTheDocument();
    expect(screen.getByText("配置了 hooks.json 或 [hooks] 的项目会显示在这里。")).toBeInTheDocument();
    expect(screen.queryByText("TODO")).toBeNull();
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

  it("keeps computer use app forms collapsed until adding an app", async () => {
    render(<SettingsView {...createBaseProps({ section: "computerUse" })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.queryByPlaceholderText("notepad、code 或 chrome")).toBeNull();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "添加" })[0]).not.toBeDisabled();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "添加" })[0]!);

    expect(screen.getByPlaceholderText("notepad、code 或 chrome")).toBeInTheDocument();
  });

  it("adds computer use apps through the settings bridge", async () => {
    const addComputerUseApp = vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "allowVisible",
      allowedApps: [],
      deniedApps: ["powershell"],
    });
    render(<SettingsView {...createBaseProps({
      section: "computerUse",
      addComputerUseApp,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "添加" })[0]).not.toBeDisabled();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "添加" })[0]!);
    fireEvent.change(screen.getByPlaceholderText("notepad、code 或 chrome"), {
      target: { value: "powershell.exe" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "添加" })[1]!);

    await waitFor(() => {
      expect(addComputerUseApp).toHaveBeenCalledWith({
        kind: "denied",
        app: "powershell.exe",
      });
    });
  });

  it("quick-adds suggested computer use apps through the settings bridge", async () => {
    const addComputerUseApp = vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "allowVisible",
      allowedApps: [],
      deniedApps: ["powershell"],
    });
    render(<SettingsView {...createBaseProps({
      section: "computerUse",
      addComputerUseApp,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    await screen.findByText("Computer Use");
    fireEvent.click(screen.getByRole("button", { name: "powershell" }));

    await waitFor(() => {
      expect(addComputerUseApp).toHaveBeenCalledWith({
        kind: "denied",
        app: "powershell",
      });
    });
  });

  it("applies recommended computer use shell blocks through the settings bridge", async () => {
    const configPath = "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml";
    const readComputerUseSettings = vi.fn().mockResolvedValue({
      configPath,
      approvalMode: "allowVisible",
      allowedApps: [],
      deniedApps: [
        "powershell",
        "wt",
        "windowsterminal",
        "diskmgmt",
        "diskpart",
        "regedit",
        "mmc",
        "taskmgr",
        "bitwarden",
        "1password",
      ],
    });
    const addComputerUseApp = vi.fn()
      .mockResolvedValueOnce({
        configPath,
        approvalMode: "allowVisible",
        allowedApps: [],
        deniedApps: ["powershell", "pwsh"],
      })
      .mockResolvedValueOnce({
        configPath,
        approvalMode: "allowVisible",
        allowedApps: [],
        deniedApps: ["powershell", "pwsh", "cmd"],
      });

    render(<SettingsView {...createBaseProps({
      section: "computerUse",
      readComputerUseSettings,
      addComputerUseApp,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    const blockShellApps = await screen.findByRole("button", { name: "屏蔽高风险应用" });
    await waitFor(() => {
      expect(blockShellApps).not.toBeDisabled();
    });
    fireEvent.click(blockShellApps);

    await waitFor(() => {
      expect(addComputerUseApp).toHaveBeenCalledTimes(2);
    });
    expect(addComputerUseApp).toHaveBeenNthCalledWith(1, {
      kind: "denied",
      app: "pwsh",
    });
    expect(addComputerUseApp).toHaveBeenNthCalledWith(2, {
      kind: "denied",
      app: "cmd",
    });
  });

  it("updates computer use approval mode through the settings bridge", async () => {
    const writeComputerUseApprovalMode = vi.fn().mockResolvedValue({
      configPath: "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
      approvalMode: "requireApprovals",
      allowedApps: [],
      deniedApps: [],
    });
    render(<SettingsView {...createBaseProps({
      section: "computerUse",
      writeComputerUseApprovalMode,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    const trigger = await screen.findByRole("button", { name: "默认应用访问：允许可见应用" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /要求应用授权/ }));

    await waitFor(() => {
      expect(writeComputerUseApprovalMode).toHaveBeenCalledWith({
        approvalMode: "requireApprovals",
      });
    });
  });

  it("opens the computer use policy config from settings", async () => {
    const onOpenConfigToml = vi.fn().mockResolvedValue(undefined);
    render(<SettingsView {...createBaseProps({
      section: "computerUse",
      onOpenConfigToml,
    })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    await screen.findByText("Computer Use");
    fireEvent.click(screen.getByRole("button", { name: "打开配置" }));

    expect(onOpenConfigToml).toHaveBeenCalledWith(
      "C:\\Users\\Administrator\\.codex\\computer-use\\config.toml",
    );
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
