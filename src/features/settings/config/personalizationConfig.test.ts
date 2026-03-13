import { describe, expect, it } from "vitest";
import {
  getPersonalityCopy,
  readPersonalizationConfigView
} from "./personalizationConfig";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

describe("personalizationConfig", () => {
  it("reads personality from config snapshot", () => {
    const view = readPersonalizationConfigView({
      config: {
        personality: "friendly"
      },
      origins: {},
      layers: [
        { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
        { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
      ]
    });

    expect(view.personality).toBe("friendly");
  });

  it("falls back to Codex pragmatic defaults when config is unavailable", () => {
    const view = readPersonalizationConfigView(null);

    expect(view.personality).toBe("pragmatic");
    expect(getPersonalityCopy(view.personality).label).toBe("务实");
  });
});
