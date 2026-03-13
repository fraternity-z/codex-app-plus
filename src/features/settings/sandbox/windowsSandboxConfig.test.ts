import { describe, expect, it } from "vitest";
import { readWindowsSandboxConfigView } from "./windowsSandboxConfig";

function createLayer(config: Record<string, unknown>, type: "user" | "system" | "project" = "user") {
  const name = type === "user"
    ? { type: "user" as const, file: "C:/Users/Administrator/.codex/config.toml" }
    : type === "system"
      ? { type: "system" as const, file: "C:/ProgramData/codex/config.toml" }
      : { type: "project" as const, dotCodexFolder: "E:/code/project/.codex" };
  return { name, version: "1", config, disabledReason: null };
}

describe("readWindowsSandboxConfigView", () => {
  it("returns disabled when no config snapshot exists", () => {
    expect(readWindowsSandboxConfigView(null)).toMatchObject({ mode: "disabled", source: null, isLegacy: false });
  });

  it("prefers effective config windows sandbox when available", () => {
    const view = readWindowsSandboxConfigView({
      config: { profile: null, windows: { sandbox: "unelevated" } },
      origins: {
        "windows.sandbox": {
          name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" },
          version: "1",
        },
      },
      layers: [createLayer({})],
    });

    expect(view).toMatchObject({ mode: "unelevated", source: "windows.sandbox · 用户配置", isLegacy: false });
  });

  it("reads top-level unelevated mode", () => {
    const view = readWindowsSandboxConfigView({ config: { profile: null }, origins: {}, layers: [createLayer({ windows: { sandbox: "unelevated" } })] });
    expect(view).toMatchObject({ mode: "unelevated", source: expect.stringContaining("windows.sandbox"), isLegacy: false });
  });

  it("reads top-level elevated mode", () => {
    const view = readWindowsSandboxConfigView({ config: { profile: null }, origins: {}, layers: [createLayer({ windows: { sandbox: "elevated" } })] });
    expect(view).toMatchObject({ mode: "elevated", isLegacy: false });
  });

  it("prefers active profile windows sandbox over top-level config", () => {
    const view = readWindowsSandboxConfigView({
      config: { profile: "work" },
      origins: {},
      layers: [createLayer({ windows: { sandbox: "unelevated" }, profiles: { work: { windows: { sandbox: "elevated" } } } })],
    });
    expect(view).toMatchObject({ mode: "elevated", source: expect.stringContaining("配置档 work") });
  });

  it("falls back to legacy feature keys", () => {
    const view = readWindowsSandboxConfigView({ config: { profile: null }, origins: {}, layers: [createLayer({ features: { experimental_windows_sandbox: true } })] });
    expect(view).toMatchObject({ mode: "unelevated", isLegacy: true, source: expect.stringContaining("旧版特性开关") });
  });

  it("uses the highest-precedence matching layer", () => {
    const view = readWindowsSandboxConfigView({
      config: { profile: null },
      origins: {},
      layers: [
        createLayer({ windows: { sandbox: "unelevated" } }, "system"),
        createLayer({ windows: { sandbox: "elevated" } }, "user"),
      ],
    });
    expect(view).toMatchObject({ mode: "elevated", source: expect.stringContaining("用户配置") });
  });
});
