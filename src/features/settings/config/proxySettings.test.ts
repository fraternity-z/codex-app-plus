import { describe, expect, it } from "vitest";
import {
  buildProxySettingsInput,
  hasProxySettingsChanges,
  normalizeProxySettings,
} from "./proxySettings";

describe("proxySettings", () => {
  it("normalizes proxy values by preserving only the selected mode", () => {
    expect(normalizeProxySettings({
      enabled: true,
      httpProxy: " http://127.0.0.1:8080 ",
      httpsProxy: "",
      noProxy: " localhost ",
    })).toEqual({
      enabled: true,
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    });
  });

  it("detects meaningful proxy setting changes", () => {
    expect(hasProxySettingsChanges(
      { enabled: false, httpProxy: "", httpsProxy: "", noProxy: "" },
      { enabled: false, httpProxy: " ", httpsProxy: "", noProxy: "" },
    )).toBe(false);
    expect(hasProxySettingsChanges(
      { enabled: false, httpProxy: "", httpsProxy: "", noProxy: "" },
      { enabled: true, httpProxy: "", httpsProxy: "", noProxy: "" },
    )).toBe(true);
    expect(hasProxySettingsChanges(
      { enabled: true, httpProxy: "http://127.0.0.1:8080", httpsProxy: "", noProxy: "localhost" },
      { enabled: true, httpProxy: "", httpsProxy: "", noProxy: "" },
    )).toBe(false);
  });

  it("builds proxy write input with the selected environment", () => {
    expect(buildProxySettingsInput("wsl", {
      enabled: true,
      httpProxy: " http://127.0.0.1:8080 ",
      httpsProxy: "",
      noProxy: " localhost ",
    })).toEqual({
      agentEnvironment: "wsl",
      enabled: true,
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    });
  });
});
