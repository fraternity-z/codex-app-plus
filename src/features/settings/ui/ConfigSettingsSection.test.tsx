import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { ConfigSettingsSection } from "./ConfigSettingsSection";

function createProvider() {
  return {
    id: "provider-1",
    name: "Right Code",
    providerKey: "right_code",
    apiKey: "secret-1",
    baseUrl: "https://right.codes/codex/v1",
    authJsonText: '{\n  "OPENAI_API_KEY": "secret-1"\n}\n',
    configTomlText:
      'model_provider = "right_code"\n\n[model_providers.right_code]\nname = "Right Code"\nbase_url = "https://right.codes/codex/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n',
    createdAt: 1,
    updatedAt: 2,
  };
}

function openAddProviderDialog(root: HTMLElement) {
  const addButton = root.querySelector<HTMLButtonElement>(".settings-head-action");
  if (addButton === null) {
    throw new Error("missing add provider button");
  }
  fireEvent.click(addButton);
}

function getDialogInputs(root: HTMLElement) {
  const inputs = root.querySelectorAll<HTMLInputElement>(".codex-provider-form input");
  const textareas = root.querySelectorAll<HTMLTextAreaElement>(".codex-provider-form textarea");
  return {
    nameInput: inputs[0],
    providerKeyInput: inputs[1],
    apiKeyInput: inputs[2],
    baseUrlInput: inputs[3],
    authTextarea: textareas[0],
  };
}

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
    refreshConfigSnapshot: vi.fn().mockResolvedValue(undefined),
    refreshAuthState: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined),
    listCodexProviders: vi.fn().mockResolvedValue({ version: 1, providers: [] }),
    upsertCodexProvider: vi.fn(),
    deleteCodexProvider: vi.fn(),
    applyCodexProvider: vi.fn(),
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
    batchWriteConfig: vi.fn().mockResolvedValue({}),
    writeConfigValue: vi.fn().mockResolvedValue({}),
    windowsSandboxSetup: { pending: false, mode: null, success: null, error: null },
    ...overrides,
  };
}

describe("ConfigSettingsSection", () => {
  it("renders provider rows and marks the current provider", async () => {
    const { container } = renderSection(createBaseProps({
      configSnapshot: { config: { model_provider: "right_code" } },
      listCodexProviders: vi.fn().mockResolvedValue({ version: 1, providers: [createProvider()] }),
      getCodexAuthModeState: vi.fn().mockResolvedValue({
        activeMode: "apikey",
        activeProviderId: "provider-1",
        activeProviderKey: "right_code",
        oauthSnapshotAvailable: false,
      }),
    }));

    expect(await screen.findByText("Right Code")).toBeInTheDocument();
    expect(container.querySelectorAll(".codex-provider-current")).toHaveLength(1);
  });

  it("disables save when advanced content is invalid", async () => {
    const { container } = renderSection(createBaseProps());

    openAddProviderDialog(container);
    const { nameInput, providerKeyInput, apiKeyInput, authTextarea } = getDialogInputs(container);
    const dialogButtons = container.querySelectorAll<HTMLButtonElement>(".mcp-form-actions button");

    fireEvent.change(nameInput, { target: { value: "Right Code" } });
    fireEvent.change(providerKeyInput, { target: { value: "right_code" } });
    fireEvent.change(apiKeyInput, { target: { value: "secret-1" } });
    fireEvent.change(authTextarea, { target: { value: "{bad json}" } });

    expect(dialogButtons[1]).toBeDisabled();
    expect(screen.getAllByText(/JSON/i).length).toBeGreaterThan(0);
  });

  it("saves and applies a provider then refreshes config", async () => {
    const savedProvider = createProvider();
    const upsertCodexProvider = vi.fn().mockResolvedValue(savedProvider);
    const applyCodexProvider = vi.fn().mockResolvedValue({
      providerId: savedProvider.id,
      providerKey: savedProvider.providerKey,
      authPath: "C:/Users/Administrator/.codex/auth.json",
      configPath: "C:/Users/Administrator/.codex/config.toml",
    });
    const refreshConfigSnapshot = vi.fn().mockResolvedValue(undefined);
    const refreshAuthState = vi.fn().mockResolvedValue(undefined);
    const writeConfigValue = vi.fn().mockResolvedValue({});
    const listCodexProviders = vi
      .fn()
      .mockResolvedValueOnce({ version: 1, providers: [] })
      .mockResolvedValueOnce({ version: 1, providers: [savedProvider] });

    const { container } = renderSection(createBaseProps({
      refreshConfigSnapshot,
      refreshAuthState,
      listCodexProviders,
      upsertCodexProvider,
      applyCodexProvider,
      writeConfigValue,
    }));

    openAddProviderDialog(container);
    const { nameInput, providerKeyInput, apiKeyInput, baseUrlInput } = getDialogInputs(container);
    const dialogButtons = container.querySelectorAll<HTMLButtonElement>(".mcp-form-actions button");

    fireEvent.change(nameInput, { target: { value: "Right Code" } });
    fireEvent.change(apiKeyInput, { target: { value: "secret-1" } });
    fireEvent.change(providerKeyInput, { target: { value: "right_code" } });
    fireEvent.change(baseUrlInput, { target: { value: "https://right.codes/codex/v1" } });
    fireEvent.click(dialogButtons[2]);

    await waitFor(() => expect(upsertCodexProvider).toHaveBeenCalled());
    expect(applyCodexProvider).toHaveBeenCalledWith({ id: savedProvider.id });
    expect(writeConfigValue).toHaveBeenCalledWith(expect.objectContaining({
      keyPath: "forced_login_method",
      value: "api",
    }));
    expect(refreshConfigSnapshot).toHaveBeenCalled();
    expect(refreshAuthState).toHaveBeenCalled();
  });

  it("does not render the model input for provider settings", async () => {
    const { container } = renderSection(createBaseProps());

    openAddProviderDialog(container);

    expect(container.querySelectorAll(".codex-provider-form input")).toHaveLength(4);
  });

  it("starts providerKey empty and blocks reserved built-in ids", async () => {
    const { container } = renderSection(createBaseProps());

    openAddProviderDialog(container);
    const { providerKeyInput } = getDialogInputs(container);
    const dialogButtons = container.querySelectorAll<HTMLButtonElement>(".mcp-form-actions button");

    expect(providerKeyInput.value).toBe("");
    expect(providerKeyInput).toHaveAttribute("placeholder", "例如：openai-custom");

    fireEvent.change(providerKeyInput, { target: { value: "openai" } });

    expect(await screen.findByText(/openai-custom/)).toBeInTheDocument();
    expect(dialogButtons[1]).toBeDisabled();
  });

  it("renders English copy when locale is en-US", async () => {
    renderSection(createBaseProps(), "en-US");

    expect(await screen.findByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Open config file")).toBeInTheDocument();
    expect(screen.getByText("Provider presets")).toBeInTheDocument();
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
