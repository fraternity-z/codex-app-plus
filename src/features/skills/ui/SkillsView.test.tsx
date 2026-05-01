import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReceivedNotification } from "../../../domain/types";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
import type { PluginReadResponse } from "../../../protocol/generated/v2/PluginReadResponse";
import type { PluginUninstallResponse } from "../../../protocol/generated/v2/PluginUninstallResponse";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { SkillsView } from "./SkillsView";

function createInstalledSkillsResponse(enabled = true): SkillsListResponse {
  return {
    data: [{
      cwd: "E:/code/codex-app-plus",
      errors: [],
      skills: [{
        name: "word-docs",
        description: "Edit and review docx files",
        interface: {
          displayName: "Word Docs",
          shortDescription: "Edit and review docx files",
          brandColor: "#f97316",
        },
        dependencies: undefined,
        path: "C:/Users/Administrator/.codex/skills/doc",
        scope: "user",
        enabled,
      }],
    }],
  };
}

function createMarketplacePluginsResponse(): PluginListResponse {
  return {
    marketplaces: [{
      name: "openai-curated",
      path: null,
      interface: { displayName: "OpenAI Curated" },
      plugins: [{
        id: "browser-use@openai-curated",
        name: "browser-use",
        source: { type: "remote" },
        installed: true,
        enabled: true,
        installPolicy: "INSTALLED_BY_DEFAULT",
        authPolicy: "ON_USE",
        interface: {
          displayName: "Browser Use",
          shortDescription: "Control the in-app browser with Codex",
          longDescription: null,
          developerName: "OpenAI",
          category: "Featured",
          capabilities: [],
          websiteUrl: null,
          privacyPolicyUrl: null,
          termsOfServiceUrl: null,
          defaultPrompt: ["Control the in-app browser with Codex"],
          brandColor: "#2563eb",
          composerIcon: null,
          composerIconUrl: null,
          logo: null,
          logoUrl: null,
          screenshots: [],
          screenshotUrls: [],
        },
      }, {
        id: "figma@openai-curated",
        name: "figma",
        source: { type: "remote" },
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_USE",
        interface: {
          displayName: "Figma",
          shortDescription: "Use Figma MCP for design-to-code work",
          longDescription: null,
          developerName: "OpenAI",
          category: "Coding",
          capabilities: [],
          websiteUrl: null,
          privacyPolicyUrl: null,
          termsOfServiceUrl: null,
          defaultPrompt: null,
          brandColor: "#0ea5e9",
          composerIcon: null,
          composerIconUrl: null,
          logo: null,
          logoUrl: null,
          screenshots: [],
          screenshotUrls: [],
        },
      }],
    }, {
      name: "openai-bundled",
      path: "C:/Users/Administrator/.codex/plugins/openai-bundled",
      interface: { displayName: "CLI bundled" },
      plugins: [{
        id: "hidden@openai-bundled",
        name: "hidden",
        source: { type: "local", path: "C:/Users/Administrator/.codex/plugins/openai-bundled/hidden" },
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_USE",
        interface: null,
      }],
    }],
    marketplaceLoadErrors: [],
    featuredPluginIds: ["browser-use@openai-curated"],
  };
}

function createPluginInstallResponse(): PluginInstallResponse {
  return { authPolicy: "ON_USE", appsNeedingAuth: [] };
}

function createPluginUninstallResponse(): PluginUninstallResponse {
  return {};
}

function createPluginReadResponse(): PluginReadResponse {
  return {
    plugin: {
      marketplaceName: "openai-curated",
      marketplacePath: null,
      summary: createMarketplacePluginsResponse().marketplaces[0]!.plugins[0]!,
      description: "Control the in-app browser with Codex",
      skills: [],
      apps: [{
        id: "browser-use",
        name: "Browser Use",
        description: "Control the in-app browser with Codex",
        installUrl: null,
        needsAuth: false,
      }],
      mcpServers: ["browser-use"],
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSkillsView(overrides?: {
  readonly notifications?: ReadonlyArray<ReceivedNotification>;
  readonly listSkills?: ReturnType<typeof vi.fn>;
  readonly listMarketplacePlugins?: ReturnType<typeof vi.fn>;
  readonly listMcpServerStatuses?: ReturnType<typeof vi.fn>;
  readonly readMarketplacePlugin?: ReturnType<typeof vi.fn>;
  readonly writeSkillConfig?: ReturnType<typeof vi.fn>;
  readonly removePath?: ReturnType<typeof vi.fn>;
  readonly writeConfigValue?: ReturnType<typeof vi.fn>;
  readonly installMarketplacePlugin?: ReturnType<typeof vi.fn>;
  readonly uninstallMarketplacePlugin?: ReturnType<typeof vi.fn>;
  readonly setAppEnabled?: ReturnType<typeof vi.fn>;
  readonly setMarketplacePluginEnabled?: ReturnType<typeof vi.fn>;
}) {
  const listSkills = overrides?.listSkills ?? vi.fn().mockResolvedValue(createInstalledSkillsResponse());
  const listMarketplacePlugins = overrides?.listMarketplacePlugins ?? vi.fn().mockResolvedValue(createMarketplacePluginsResponse());
  const listMcpServerStatuses = overrides?.listMcpServerStatuses ?? vi.fn().mockResolvedValue([]);
  const readMarketplacePlugin = overrides?.readMarketplacePlugin ?? vi.fn().mockResolvedValue(createPluginReadResponse());
  const writeSkillConfig = overrides?.writeSkillConfig ?? vi.fn().mockResolvedValue({ effectiveEnabled: false });
  const removePath = overrides?.removePath ?? vi.fn().mockResolvedValue({});
  const writeConfigValue = overrides?.writeConfigValue ?? vi.fn().mockResolvedValue({
    config: { config: {}, origins: {}, layers: [] },
    statuses: [],
    write: { status: "success", version: "1", filePath: "C:/Users/Administrator/.codex/config.toml", overriddenMetadata: null },
  });
  const installMarketplacePlugin = overrides?.installMarketplacePlugin ?? vi.fn().mockResolvedValue(createPluginInstallResponse());
  const uninstallMarketplacePlugin = overrides?.uninstallMarketplacePlugin ?? vi.fn().mockResolvedValue(createPluginUninstallResponse());
  const setAppEnabled = overrides?.setAppEnabled ?? vi.fn().mockResolvedValue({ status: "success", version: "1", filePath: "C:/Users/Administrator/.codex/config.toml", overriddenMetadata: null });
  const setMarketplacePluginEnabled = overrides?.setMarketplacePluginEnabled ?? vi.fn().mockResolvedValue({ status: "success", version: "1", filePath: "C:/Users/Administrator/.codex/config.toml", overriddenMetadata: null });

  const view = render(
    <SkillsView
      configSnapshot={null}
      mcpServerStatuses={[]}
      selectedRootPath="E:/code/codex-app-plus"
      notifications={overrides?.notifications ?? []}
      onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
      listMcpServerStatuses={listMcpServerStatuses}
      listSkills={listSkills}
      listMarketplacePlugins={listMarketplacePlugins}
      readMarketplacePlugin={readMarketplacePlugin}
      setAppEnabled={setAppEnabled}
      writeSkillConfig={writeSkillConfig}
      removePath={removePath}
      writeConfigValue={writeConfigValue}
      installMarketplacePlugin={installMarketplacePlugin}
      uninstallMarketplacePlugin={uninstallMarketplacePlugin}
      setMarketplacePluginEnabled={setMarketplacePluginEnabled}
    />,
    { wrapper: createI18nWrapper() },
  );

  return {
    ...view,
    installMarketplacePlugin,
    listMarketplacePlugins,
    listMcpServerStatuses,
    listSkills,
    readMarketplacePlugin,
    removePath,
    setAppEnabled,
    setMarketplacePluginEnabled,
    uninstallMarketplacePlugin,
    writeConfigValue,
    writeSkillConfig,
  };
}

describe("SkillsView", () => {
  it("loads the official plugin marketplace by default", async () => {
    renderSkillsView();

    expect(await screen.findByText("Browser Use")).toBeInTheDocument();
    expect(await screen.findByText("Figma")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).toBeNull();
    expect(screen.getByRole("button", { name: "停用 Browser Use" })).toBeInTheDocument();
  });

  it("renders the marketplace hero as a generated image", async () => {
    const { container } = renderSkillsView();

    expect(await screen.findByText("Browser Use")).toBeInTheDocument();

    const hero = container.querySelector(".plugin-market-hero");
    expect(hero).not.toBeNull();

    const image = hero!.querySelector("img.plugin-hero-image");
    expect(image).toHaveAttribute("src", expect.stringContaining("plugin-hero-colorburst.png"));
    expect(image).toHaveAttribute("alt", "");
    expect(hero).toHaveTextContent("插件市场仍在完善中");
    expect(hero).toHaveTextContent("当前页面只是实验性复刻");
    expect(hero).not.toHaveTextContent("Control the in-app browser with Codex");
  });

  it("hides the built-in codex apps runtime MCP server from management", async () => {
    const listMcpServerStatuses = vi.fn().mockResolvedValue([
      { name: "codex apps", tools: {}, resources: [], resourceTemplates: [], authStatus: "bearerToken" },
      { name: "playwright", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" },
    ]);
    renderSkillsView({ listMcpServerStatuses });

    fireEvent.click(await screen.findByRole("button", { name: "管理" }));
    fireEvent.click(await screen.findByRole("tab", { name: /MCP/ }));

    expect(await screen.findByText("playwright")).toBeInTheDocument();
    expect(screen.queryByText("codex apps")).toBeNull();
  });

  it("installs a remote marketplace plugin and refreshes the catalog", async () => {
    const installMarketplacePlugin = vi.fn().mockResolvedValue(createPluginInstallResponse());
    renderSkillsView({ installMarketplacePlugin });

    fireEvent.click(await screen.findByRole("button", { name: "安装 Figma" }));

    await waitFor(() => expect(installMarketplacePlugin).toHaveBeenCalledWith({
      remoteMarketplaceName: "openai-curated",
      pluginName: "figma",
    }));
  });

  it("writes official plugin enablement through config/value/write", async () => {
    const setMarketplacePluginEnabled = vi.fn().mockResolvedValue({ status: "success", version: "1", filePath: "C:/Users/Administrator/.codex/config.toml", overriddenMetadata: null });
    renderSkillsView({ setMarketplacePluginEnabled });

    fireEvent.click(await screen.findByRole("button", { name: "停用 Browser Use" }));

    await waitFor(() => expect(setMarketplacePluginEnabled).toHaveBeenCalledWith(
      "browser-use@openai-curated",
      false,
    ));
  });

  it("uninstalls an installed plugin through the official protocol", async () => {
    const uninstallMarketplacePlugin = vi.fn().mockResolvedValue(createPluginUninstallResponse());
    renderSkillsView({ uninstallMarketplacePlugin });

    fireEvent.click(await screen.findByRole("button", { name: "卸载 Browser Use" }));

    await waitFor(() => expect(uninstallMarketplacePlugin).toHaveBeenCalledWith({
      pluginId: "browser-use@openai-curated",
    }));
  });

  it("refreshes marketplace plugins from the refresh button", async () => {
    const listMarketplacePlugins = vi.fn().mockResolvedValue(createMarketplacePluginsResponse());
    renderSkillsView({ listMarketplacePlugins });

    await screen.findByText("Browser Use");
    listMarketplacePlugins.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(listMarketplacePlugins).toHaveBeenCalledWith({
      cwds: ["E:/code/codex-app-plus"],
    }));
  });

  it("switches to installed skills and writes skill config", async () => {
    const writeSkillConfig = vi.fn().mockResolvedValue({ effectiveEnabled: false });
    renderSkillsView({ writeSkillConfig });

    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Word Docs已启用" }));

    await waitFor(() => expect(writeSkillConfig).toHaveBeenCalledWith({
      path: "C:/Users/Administrator/.codex/skills/doc",
      enabled: false,
    }));
  });

  it("deletes installed skills through fs/remove from the skills tab", async () => {
    const removePath = vi.fn().mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSkillsView({ removePath });

    fireEvent.click(screen.getByRole("tab", { name: "技能" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除 Word Docs" }));

    await waitFor(() => expect(removePath).toHaveBeenCalledWith({
      path: "C:/Users/Administrator/.codex/skills/doc",
      recursive: true,
      force: true,
    }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Word Docs"));
  });

  it("deletes installed skills through fs/remove from the management screen", async () => {
    const removePath = vi.fn().mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSkillsView({ removePath });

    fireEvent.click(await screen.findByRole("button", { name: "管理" }));
    fireEvent.click(await screen.findByRole("tab", { name: /技能/ }));
    fireEvent.click(await screen.findByRole("button", { name: "删除 Word Docs" }));

    await waitFor(() => expect(removePath).toHaveBeenCalledWith({
      path: "C:/Users/Administrator/.codex/skills/doc",
      recursive: true,
      force: true,
    }));
  });

  it("shows marketplace loading errors explicitly", async () => {
    renderSkillsView({
      listMarketplacePlugins: vi.fn().mockRejectedValue(new Error("plugin/list failed: catalog unavailable")),
    });

    expect(await screen.findByText("plugin/list failed: catalog unavailable")).toBeInTheDocument();
  });
});
