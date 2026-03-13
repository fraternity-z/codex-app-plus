import { describe, expect, it } from "vitest";
import { readUserConfigWriteTarget } from "./configWriteTarget";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

describe("configWriteTarget", () => {
  it("reads the user config file path and version from config layers", () => {
    expect(readUserConfigWriteTarget({
      config: {},
      origins: {},
      layers: [
        { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
        { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
      ]
    })).toEqual({ filePath: USER_FILE, expectedVersion: "u1" });
  });

  it("falls back to the default user config target when no user layer exists", () => {
    expect(readUserConfigWriteTarget({ config: {}, origins: {}, layers: [] })).toEqual({
      filePath: null,
      expectedVersion: null
    });
  });
});
