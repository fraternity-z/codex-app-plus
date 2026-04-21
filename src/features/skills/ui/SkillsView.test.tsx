import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivedNotification } from "../../../domain/types";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
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
      name: "official",
      path: "C:/Users/Administrator/.codex/plugins/marketplaces/official",
      interface: { displayName: "Official" },
      plugins: [{
        id: "openai/figma",
        name: "figma",
        source: { type: "local", path: "C:/Users/Administrator/.codex/plugins/official/figma" },
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_USE",
        interface: {
          displayName: "Figma",
          shortDescription: "Use Figma MCP for design-to-code work",
          longDescription: null,
          developerName: null,
          category: null,
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
    }],
    marketplaceLoadErrors: [],
    featuredPluginIds: [],
  };
}

function createPluginInstallResponse(): PluginInstallResponse {
  return { authPolicy: "ON_USE", appsNeedingAuth: [] };
}

function renderSkillsView(overrides?: {
  readonly authStatus?: "unknown" | "authenticated" | "needs_login";
  readonly authMode?: "apikey" | "chatgpt" | "chatgptAuthTokens" | null;
  readonly notifications?: ReadonlyArray<ReceivedNotification>;
  readonly listSkills?: ReturnType<typeof vi.fn>;
  readonly listMarketplacePlugins?: ReturnType<typeof vi.fn>;
  readonly writeSkillConfig?: ReturnType<typeof vi.fn>;
  readonly installMarketplacePlugin?: ReturnType<typeof vi.fn>;
}) {
  const listSkills = overrides?.listSkills ?? vi.fn().mockResolvedValue(createInstalledSkillsResponse());
  const listMarketplacePlugins = overrides?.listMarketplacePlugins ?? vi.fn().mockResolvedValue(createMarketplacePluginsResponse());
  const writeSkillConfig = overrides?.writeSkillConfig ?? vi.fn().mockResolvedValue({ effectiveEnabled: false });
  const installMarketplacePlugin = overrides?.installMarketplacePlugin ?? vi.fn().mockResolvedValue(createPluginInstallResponse());

  const view = render(
    <SkillsView
      authStatus={overrides?.authStatus ?? "authenticated"}
      authMode={overrides?.authMode ?? "chatgpt"}
      selectedRootPath="E:/code/codex-app-plus"
      notifications={overrides?.notifications ?? []}
      onBackHome={vi.fn()}
      onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
      listSkills={listSkills}
      listMarketplacePlugins={listMarketplacePlugins}
      writeSkillConfig={writeSkillConfig}
      installMarketplacePlugin={installMarketplacePlugin}
    />,
    { wrapper: createI18nWrapper() },
  );

  return { ...view, listSkills, listMarketplacePlugins, writeSkillConfig, installMarketplacePlugin };
}

describe("SkillsView", () => {
  it("loads installed and recommended skills on mount", async () => {
    renderSkillsView();

    expect(await screen.findByText("Word Docs")).toBeInTheDocument();
    expect(await screen.findByText("Figma")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Word Docs已启用" })).toHaveAttribute("aria-checked", "true");
  });

  it("writes config when toggling an installed skill", async () => {
    const { writeSkillConfig } = renderSkillsView();

    fireEvent.click(await screen.findByRole("switch", { name: "Word Docs已启用" }));

    await waitFor(() => expect(writeSkillConfig).toHaveBeenCalledWith({
      path: "C:/Users/Administrator/.codex/skills/doc",
      enabled: false,
    }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Word Docs已禁用" })).toHaveAttribute("aria-checked", "false"));
  });

  it("installs a marketplace plugin and refreshes the installed list", async () => {
    const listSkills = vi.fn()
      .mockResolvedValueOnce({ data: [{ cwd: "E:/code/codex-app-plus", errors: [], skills: [] }] })
      .mockResolvedValueOnce(createInstalledSkillsResponse());
    const installMarketplacePlugin = vi.fn().mockResolvedValue(createPluginInstallResponse());
    renderSkillsView({ listSkills, installMarketplacePlugin });

    fireEvent.click(await screen.findByRole("button", { name: "安装" }));

    await waitFor(() => expect(installMarketplacePlugin).toHaveBeenCalledWith({
      marketplacePath: "C:/Users/Administrator/.codex/plugins/marketplaces/official",
      pluginName: "figma",
    }));
    expect(await screen.findByText("Word Docs")).toBeInTheDocument();
  });

  it("shows marketplace loading errors explicitly", async () => {
    renderSkillsView({
      listMarketplacePlugins: vi.fn().mockRejectedValue(new Error("git fetch failed: git process timed out after 30000ms")),
    });

    expect(await screen.findByText("git fetch failed: git process timed out after 30000ms")).toBeInTheDocument();
  });

  it("does not call marketplace plugins when authenticated with api key", async () => {
    const listMarketplacePlugins = vi.fn();
    renderSkillsView({
      authMode: "apikey",
      listMarketplacePlugins,
    });

    expect(await screen.findByText("推荐插件仅支持 ChatGPT 登录；当前是 API Key 认证，官方插件市场链路不可用。")).toBeInTheDocument();
    expect(listMarketplacePlugins).not.toHaveBeenCalled();
  });

  it("forces reload on manual refresh and skills changed notifications", async () => {
    const listSkills = vi.fn().mockResolvedValue(createInstalledSkillsResponse());
    const view = renderSkillsView({ listSkills, notifications: [] });

    await screen.findByText("Word Docs");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => expect(listSkills).toHaveBeenLastCalledWith({
      cwds: ["E:/code/codex-app-plus"],
      forceReload: true,
    }));

    view.rerender(
      <SkillsView
        authStatus="authenticated"
        authMode="chatgpt"
        selectedRootPath="E:/code/codex-app-plus"
        notifications={[{ method: "skills/changed", params: null }]}
        onBackHome={vi.fn()}
        onOpenLearnMore={vi.fn().mockResolvedValue(undefined)}
        listSkills={listSkills}
        listMarketplacePlugins={vi.fn().mockResolvedValue(createMarketplacePluginsResponse())}
        writeSkillConfig={vi.fn().mockResolvedValue({ effectiveEnabled: false })}
        installMarketplacePlugin={vi.fn().mockResolvedValue(createPluginInstallResponse())}
      />,
    );

    await waitFor(() => expect(listSkills.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(listSkills.mock.calls.at(-1)?.[0]).toEqual({
      cwds: ["E:/code/codex-app-plus"],
      forceReload: true,
    });
  });
});
