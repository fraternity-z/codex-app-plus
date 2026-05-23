import { describe, expect, it } from "vitest";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
import { createMarketplacePluginCards } from "./skillCatalog";

function createPluginListResponse(): PluginListResponse {
  return {
    marketplaces: [{
      name: "openai-bundled",
      path: "C:/Users/Administrator/AppData/Local/CodexAppPlus/bundled-plugins/openai-bundled/browser-use/0.1.0-alpha1",
      interface: { displayName: "OpenAI Bundled" },
      plugins: [{
        id: "browser-use@openai-bundled",
        remotePluginId: null,
        localVersion: null,
        name: "browser-use",
        shareContext: null,
        source: {
          type: "local",
          path: "C:/Users/Administrator/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1",
        },
        installed: true,
        enabled: true,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL",
        availability: "AVAILABLE",
        keywords: [],
        interface: {
          displayName: "Browser Use",
          shortDescription: "Control the in-app browser with Codex",
          longDescription: null,
          developerName: "OpenAI",
          category: "Engineering",
          capabilities: [],
          websiteUrl: null,
          privacyPolicyUrl: null,
          termsOfServiceUrl: null,
          defaultPrompt: [],
          brandColor: "#0F766E",
          composerIcon: "./assets/browser.png",
          composerIconUrl: null,
          logo: "./assets/browser.png",
          logoUrl: null,
          screenshots: [],
          screenshotUrls: [],
        },
      }, {
        id: "hidden@openai-bundled",
        remotePluginId: null,
        localVersion: null,
        name: "hidden",
        shareContext: null,
        source: {
          type: "local",
          path: "C:/Users/Administrator/.codex/plugins/cache/openai-bundled/hidden/0.1.0",
        },
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL",
        availability: "AVAILABLE",
        keywords: [],
        interface: null,
      }],
    }],
    marketplaceLoadErrors: [],
    featuredPluginIds: [],
  };
}

describe("createMarketplacePluginCards", () => {
  it("shows installed openai-bundled plugins while hiding uninstalled bundled entries", () => {
    const catalog = createMarketplacePluginCards(createPluginListResponse());

    expect(catalog.plugins.map((plugin) => plugin.id)).toEqual(["browser-use@openai-bundled"]);
    expect(catalog.marketplaces).toEqual([{ id: "openai-bundled", label: "OpenAI Bundled" }]);
  });
});
