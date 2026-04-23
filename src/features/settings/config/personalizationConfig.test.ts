import { describe, expect, it } from "vitest";
import { readPersonalizationConfigView } from "./personalizationConfig";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

describe("personalizationConfig", () => {
  it("reads personality from config snapshot", () => {
    const view = readPersonalizationConfigView({
      config: {
        personality: "friendly",
        model_instructions_file: "~/.codex/prompts/codex-app-plus/system-prompt.md",
      },
      origins: {},
      layers: [
        { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
        { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
      ]
    });

    expect(view.personality).toBe("friendly");
    expect(view.modelInstructionsFile).toBe("~/.codex/prompts/codex-app-plus/system-prompt.md");
  });

  it("falls back to Codex pragmatic defaults when config is unavailable", () => {
    const view = readPersonalizationConfigView(null);

    expect(view.personality).toBe("pragmatic");
    expect(view.modelInstructionsFile).toBeNull();
  });
});
