import { describe, expect, it, vi } from "vitest";
import type { HostBridge } from "../../../bridge/types";
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

describe("composerPreferences", () => {
  it("includes hidden models and prepends gpt-5.4 when the backend list is stale", async () => {
    const request = vi.fn().mockResolvedValue({
      requestId: "request-1",
      result: {
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
      }
    });

    const hostBridge = {
      rpc: {
        request,
        notify: vi.fn(),
        cancel: vi.fn()
      }
    } as unknown as HostBridge;

    const result = await listComposerModels(hostBridge);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "model/list",
        params: expect.objectContaining({ includeHidden: true })
      })
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
});
