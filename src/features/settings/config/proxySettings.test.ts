import { describe, expect, it } from "vitest";
import {
  buildProxySettingsInput,
  hasProxySettingsChanges,
  normalizeProxySettings,
  validateProxySettings,
} from "./proxySettings";

describe("proxySettings", () => {
  it("drops custom values for disabled or system modes", () => {
    expect(
      normalizeProxySettings({
        mode: "system",
        httpProxy: " http://127.0.0.1:8080 ",
        httpsProxy: "",
        noProxy: " localhost ",
      }),
    ).toEqual({
      mode: "system",
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    });

    expect(
      normalizeProxySettings({
        mode: "disabled",
        httpProxy: "leftover",
        httpsProxy: "leftover",
        noProxy: "leftover",
      }),
    ).toEqual({
      mode: "disabled",
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    });
  });

  it("trims and preserves custom proxy values", () => {
    expect(
      normalizeProxySettings({
        mode: "custom",
        httpProxy: "  http://127.0.0.1:7890  ",
        httpsProxy: "",
        noProxy: " localhost ",
      }),
    ).toEqual({
      mode: "custom",
      httpProxy: "http://127.0.0.1:7890",
      httpsProxy: "",
      noProxy: "localhost",
    });
  });

  it("detects mode changes regardless of trailing whitespace", () => {
    expect(
      hasProxySettingsChanges(
        { mode: "disabled", httpProxy: "", httpsProxy: "", noProxy: "" },
        { mode: "disabled", httpProxy: " ", httpsProxy: "", noProxy: "" },
      ),
    ).toBe(false);
    expect(
      hasProxySettingsChanges(
        { mode: "disabled", httpProxy: "", httpsProxy: "", noProxy: "" },
        { mode: "system", httpProxy: "", httpsProxy: "", noProxy: "" },
      ),
    ).toBe(true);
    expect(
      hasProxySettingsChanges(
        { mode: "system", httpProxy: "http://ignored", httpsProxy: "", noProxy: "" },
        { mode: "system", httpProxy: "", httpsProxy: "", noProxy: "" },
      ),
    ).toBe(false);
  });

  it("detects custom proxy field changes", () => {
    expect(
      hasProxySettingsChanges(
        {
          mode: "custom",
          httpProxy: "http://127.0.0.1:7890",
          httpsProxy: "",
          noProxy: "localhost",
        },
        {
          mode: "custom",
          httpProxy: "http://127.0.0.1:8080",
          httpsProxy: "",
          noProxy: "localhost",
        },
      ),
    ).toBe(true);
    expect(
      hasProxySettingsChanges(
        {
          mode: "custom",
          httpProxy: "http://127.0.0.1:7890",
          httpsProxy: "",
          noProxy: "",
        },
        {
          mode: "custom",
          httpProxy: " http://127.0.0.1:7890 ",
          httpsProxy: "",
          noProxy: "",
        },
      ),
    ).toBe(false);
  });

  it("builds proxy write input with the selected environment", () => {
    expect(
      buildProxySettingsInput("wsl", {
        mode: "custom",
        httpProxy: " http://127.0.0.1:8080 ",
        httpsProxy: "",
        noProxy: " localhost ",
      }),
    ).toEqual({
      agentEnvironment: "wsl",
      mode: "custom",
      httpProxy: "http://127.0.0.1:8080",
      httpsProxy: "",
      noProxy: "localhost",
    });
    expect(
      buildProxySettingsInput("windowsNative", {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      }),
    ).toEqual({
      agentEnvironment: "windowsNative",
      mode: "disabled",
      httpProxy: "",
      httpsProxy: "",
      noProxy: "",
    });
  });

  it("validates custom proxy requires HTTP or HTTPS value", () => {
    expect(
      validateProxySettings({
        mode: "custom",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "localhost",
      }),
    ).toEqual({ kind: "empty" });
    expect(
      validateProxySettings({
        mode: "custom",
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
        noProxy: "",
      }),
    ).toEqual({ kind: "valid" });
    expect(
      validateProxySettings({
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      }),
    ).toEqual({ kind: "valid" });
  });
});
