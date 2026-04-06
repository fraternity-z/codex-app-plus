import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerClient } from "../../../protocol/appServerClient";
import {
  listComposerModels,
  partitionComposerModels,
  type ComposerModelOption
} from "./composerPreferences";

function createModel(value: string, label: string): ComposerModelOption {
  return {
    id: value,
    value,
    label,
    defaultEffort: "high",
    supportedEfforts: ["low", "medium", "high", "xhigh"],
    isDefault: false
  };
}

function createAppServerClient() {
  const request = vi.fn().mockResolvedValue({
    data: [
      {
        id: "model-1",
        model: "gpt-5.3-codex",
        upgrade: null,
        upgradeInfo: null,
        availabilityNux: null,
        displayName: "GPT-5.3-Codex",
        description: "",
        hidden: true,
        supportedReasoningEfforts: [{ reasoningEffort: "high", description: "" }],
        defaultReasoningEffort: "high",
        inputModalities: [],
        supportsPersonality: false,
        isDefault: false
      }
    ],
    nextCursor: null
  });

  return {
    request,
    client: { request } as AppServerClient,
  };
}

describe("composerPreferences", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("includes hidden models and prepends gpt-5.4 when the backend list is stale", async () => {
    const { request, client } = createAppServerClient();

    const result = await listComposerModels(client);

    expect(request).toHaveBeenCalledWith(
      "model/list",
      expect.objectContaining({ includeHidden: true })
    );
    expect(result).toEqual([
      expect.objectContaining({
        value: "gpt-5.4",
        label: "gpt-5.4",
        defaultEffort: "high",
        supportedEfforts: ["low", "medium", "high", "xhigh"]
      }),
      expect.objectContaining({
        value: "gpt-5.3-codex",
        label: "GPT-5.3-Codex"
      })
    ]);
  });

  it("uses the OpenRouter catalog instead of backend OpenAI models when OpenRouter is active", async () => {
    const { client } = createAppServerClient();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "deepseek/deepseek-v3.2",
            name: "DeepSeek V3.2",
            supported_parameters: ["reasoning"]
          },
          {
            id: "moonshotai/kimi-k2",
            name: "Kimi K2",
            supported_parameters: []
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetch);

    const result = await listComposerModels(client, {
      config: {
        model_provider: "openrouter",
        model_providers: {
          openrouter: {
            base_url: "https://openrouter.ai/api/v1"
          }
        }
      }
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://openrouter.ai/api/v1/models"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        value: "deepseek/deepseek-v3.2",
        label: "DeepSeek V3.2",
        supportedEfforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
      }),
      expect.objectContaining({
        value: "moonshotai/kimi-k2",
        label: "Kimi K2",
        supportedEfforts: ["high"],
      }),
    ]);
    expect(result.map((model) => model.value)).not.toContain("gpt-5.4");
    expect(result.map((model) => model.value)).not.toContain("gpt-5.3-codex");
    expect(window.localStorage.getItem("codex-app-plus.openrouter-models-cache")).toContain("deepseek/deepseek-v3.2");
  });

  it("falls back to cached OpenRouter models when the live fetch fails", async () => {
    const { client } = createAppServerClient();
    window.localStorage.setItem("codex-app-plus.openrouter-models-cache", JSON.stringify({
      updatedAt: 1,
      models: [
        {
          id: "openrouter:qwen/qwen3-235b-a22b",
          value: "qwen/qwen3-235b-a22b",
          label: "Qwen 3 235B",
          defaultEffort: "high",
          supportedEfforts: ["high"],
          isDefault: false
        }
      ]
    }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failed")));

    const result = await listComposerModels(client, {
      config: {
        model_provider: "custom-openrouter",
        model_providers: {
          "custom-openrouter": {
            base_url: "https://openrouter.ai/api/v1"
          }
        }
      }
    });

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: "qwen/qwen3-235b-a22b",
        label: "Qwen 3 235B",
      }),
    ]));
    expect(result.map((model) => model.value)).not.toContain("gpt-5.4");
  });

  it("preserves the configured OpenRouter model when it is missing from the fetched catalog", async () => {
    const { client } = createAppServerClient();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "moonshotai/kimi-k2",
            name: "Kimi K2",
            supported_parameters: []
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetch);

    const result = await listComposerModels(client, {
      config: {
        model_provider: "openrouter",
        model: "deepseek/deepseek-v3.2",
        model_providers: {
          openrouter: {
            base_url: "https://openrouter.ai/api/v1"
          }
        }
      }
    });

    expect(result[0]).toEqual(expect.objectContaining({
      value: "deepseek/deepseek-v3.2",
      label: "deepseek/deepseek-v3.2",
    }));
    expect(result.map((model) => model.value)).not.toContain("gpt-5.4");
  });

  it("splits the prioritized list into primary and extra model groups", () => {
    const groups = partitionComposerModels([
      createModel("gpt-5.3-codex", "GPT-5.3-Codex"),
      createModel("gpt-5.2", "GPT-5.2"),
      createModel("gpt-5.1", "GPT-5.1"),
      createModel("gpt-5", "GPT-5"),
      createModel("o3", "o3"),
      createModel("o1", "o1")
    ]);

    expect(groups.primaryModels.map((model) => model.value)).toEqual([
      "gpt-5.4",
      "gpt-5.3-codex",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5"
    ]);
    expect(groups.extraModels.map((model) => model.value)).toEqual(["o3", "o1"]);
  });

  it("does not inject pinned OpenAI models into OpenRouter-only groups", () => {
    const groups = partitionComposerModels([
      {
        id: "openrouter:deepseek/deepseek-v3.2",
        value: "deepseek/deepseek-v3.2",
        label: "DeepSeek V3.2",
        defaultEffort: "high",
        supportedEfforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
        isDefault: false
      },
      {
        id: "openrouter:moonshotai/kimi-k2",
        value: "moonshotai/kimi-k2",
        label: "Kimi K2",
        defaultEffort: "high",
        supportedEfforts: ["high"],
        isDefault: false
      }
    ]);

    expect(groups.primaryModels.map((model) => model.value)).toEqual([
      "deepseek/deepseek-v3.2",
      "moonshotai/kimi-k2"
    ]);
    expect(groups.extraModels).toEqual([]);
  });
});
