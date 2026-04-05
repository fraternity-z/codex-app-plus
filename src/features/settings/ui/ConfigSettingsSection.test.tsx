import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { ConfigSettingsSection } from "./ConfigSettingsSection";

function renderSection(
  props: ComponentProps<typeof ConfigSettingsSection>,
  locale: Locale = "zh-CN"
) {
  return render(<ConfigSettingsSection {...props} />, {
    wrapper: createI18nWrapper(locale)
  });
}

function createBaseProps(
  overrides: Partial<ComponentProps<typeof ConfigSettingsSection>> = {}
): ComponentProps<typeof ConfigSettingsSection> {
  return {
    agentEnvironment: "windowsNative",
    busy: false,
    configSnapshot: { config: {} },
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    onOpenExternal: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue(undefined),
    refreshAuthState: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    readProxySettings: vi.fn().mockResolvedValue({
      settings: {
        enabled: false,
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
    getCodexAuthModeState: vi.fn().mockResolvedValue({
      activeMode: "chatgpt",
      activeProviderId: null,
      activeProviderKey: null,
      oauthSnapshotAvailable: false,
    }),
    activateCodexChatgpt: vi.fn().mockResolvedValue({
      mode: "chatgpt",
      providerId: null,
      providerKey: null,
      authPath: "C:/Users/Administrator/.codex/auth.json",
      configPath: "C:/Users/Administrator/.codex/config.toml",
      restoredFromSnapshot: false,
    }),
    writeProxySettings: vi.fn().mockResolvedValue({
      settings: {
        enabled: false,
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
    batchWriteConfig: vi.fn().mockResolvedValue({}),
    writeConfigValue: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("ConfigSettingsSection", () => {
  it("renders basic config section elements", async () => {
    renderSection(createBaseProps());

    expect(await screen.findByText("配置")).toBeInTheDocument();
    expect(screen.getByText("打开配置文件")).toBeInTheDocument();
    expect(screen.getByText("代理")).toBeInTheDocument();
  });

  it("renders English copy when locale is en-US", async () => {
    renderSection(createBaseProps(), "en-US");

    expect(await screen.findByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Open config file")).toBeInTheDocument();
    expect(screen.getByText("Proxy")).toBeInTheDocument();
  });

  it("writes the Windows Sandbox config when toggled on", async () => {
    const batchWriteConfig = vi.fn().mockResolvedValue({});
    renderSection(createBaseProps({
      batchWriteConfig,
    }));

    fireEvent.click(screen.getByRole("switch", { name: "Windows 沙盒" }));

    await waitFor(() => {
      expect(batchWriteConfig).toHaveBeenCalledWith(expect.objectContaining({
        edits: [{ keyPath: "windows.sandbox", mergeStrategy: "replace", value: "unelevated" }],
      }));
    });
  });
});
