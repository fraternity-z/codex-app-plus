import { describe, expect, it } from "vitest";
import { readPersonalizationConfigView } from "./personalizationConfig";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

describe("personalizationConfig", () => {
  it("reads personality from config snapshot", () => {
    const view = readPersonalizationConfigView({
      config: {
        personality: "friendly",
        model_instructions_file: "~/.codex/prompts/codex-app-plus/system-prompt.md",
        features: {
          memories: true,
        },
        memories: {
          use_memories: false,
          generate_memories: true,
          disable_on_external_context: true,
        },
      },
      origins: {},
      layers: [
        { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
        { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
      ]
    });

    expect(view.personality).toBe("friendly");
    expect(view.modelInstructionsFile).toBe("~/.codex/prompts/codex-app-plus/system-prompt.md");
    expect(view.memories).toEqual({
      featureEnabled: true,
      useMemories: false,
      generateMemories: true,
      disableOnExternalContext: true,
    });
  });

  it("falls back to Codex pragmatic defaults when config is unavailable", () => {
    const view = readPersonalizationConfigView(null);

    expect(view.personality).toBe("pragmatic");
    expect(view.modelInstructionsFile).toBeNull();
    expect(view.memories).toEqual({
      featureEnabled: false,
      useMemories: true,
      generateMemories: true,
      disableOnExternalContext: false,
    });
  });

  it("supports the legacy external-context memory key", () => {
    const view = readPersonalizationConfigView({
      config: {
        memories: {
          no_memories_if_mcp_or_web_search: true,
        },
      },
      origins: {},
      layers: null,
    });

    expect(view.memories.disableOnExternalContext).toBe(true);
  });
});
