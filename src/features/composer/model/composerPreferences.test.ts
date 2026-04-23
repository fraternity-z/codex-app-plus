import { describe, expect, it, vi } from "vitest";
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
  it("includes hidden models and prepends the current official Codex models when the backend list is stale", async () => {
    const { request, client } = createAppServerClient();

    const result = await listComposerModels(client);

    expect(request).toHaveBeenCalledWith(
      "model/list",
      expect.objectContaining({ includeHidden: true })
    );
    expect(result).toEqual([
      expect.objectContaining({
        value: "gpt-5.5",
        label: "gpt-5.5",
        defaultEffort: "high",
        supportedEfforts: ["low", "medium", "high", "xhigh"]
      }),
      expect.objectContaining({
        value: "gpt-5.4",
        label: "gpt-5.4",
        defaultEffort: "high",
        supportedEfforts: ["low", "medium", "high", "xhigh"]
      }),
      expect.objectContaining({
        value: "gpt-5.4-mini",
        label: "gpt-5.4-mini",
        defaultEffort: "high",
        supportedEfforts: ["low", "medium", "high", "xhigh"]
      }),
      expect.objectContaining({
        value: "gpt-5.3-codex",
        label: "GPT-5.3-Codex"
      }),
      expect.objectContaining({
        value: "gpt-5.2",
        label: "gpt-5.2",
        defaultEffort: "high",
        supportedEfforts: ["low", "medium", "high", "xhigh"]
      })
    ]);
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
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex",
      "gpt-5.2"
    ]);
    expect(groups.extraModels.map((model) => model.value)).toEqual(["gpt-5.1", "gpt-5", "o3", "o1"]);
  });
});
