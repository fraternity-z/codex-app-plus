import { render, screen } from "@testing-library/react";
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
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    onOpenExternal: vi.fn().mockResolvedValue(undefined),
    readProxySettings: vi.fn().mockResolvedValue({
      settings: {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
    writeProxySettings: vi.fn().mockResolvedValue({
      settings: {
        mode: "disabled",
        httpProxy: "",
        httpsProxy: "",
        noProxy: "",
      },
    }),
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
});
