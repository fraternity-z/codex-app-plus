import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("ConfigSettingsSection", () => {
  it("renders provider rows and marks the current provider", async () => {
    const { container } = render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: { model_provider: "right_code" } }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={vi.fn().mockResolvedValue(undefined)}
        refreshAuthState={vi.fn().mockResolvedValue(undefined)}
        listCodexProviders={vi.fn().mockResolvedValue({ version: 1, providers: [createProvider()] })}
        upsertCodexProvider={vi.fn()}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={vi.fn()}
        windowsSandboxSetup={{ pending: false, mode: null, success: null, error: null }}
        startWindowsSandboxSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    expect(await screen.findByText("Right Code")).toBeInTheDocument();
    expect(container.querySelectorAll(".codex-provider-current")).toHaveLength(1);
  });

  it("disables save when advanced content is invalid", async () => {
    const { container } = render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: {} }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={vi.fn().mockResolvedValue(undefined)}
        refreshAuthState={vi.fn().mockResolvedValue(undefined)}
        listCodexProviders={vi.fn().mockResolvedValue({ version: 1, providers: [] })}
        upsertCodexProvider={vi.fn()}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={vi.fn()}
        windowsSandboxSetup={{ pending: false, mode: null, success: null, error: null }}
        startWindowsSandboxSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    openAddProviderDialog(container);
    const { nameInput, apiKeyInput, authTextarea } = getDialogInputs(container);
    const dialogButtons = container.querySelectorAll<HTMLButtonElement>(".mcp-form-actions button");

    fireEvent.change(nameInput, { target: { value: "Right Code" } });
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
    const listCodexProviders = vi
      .fn()
      .mockResolvedValueOnce({ version: 1, providers: [] })
      .mockResolvedValueOnce({ version: 1, providers: [savedProvider] });

    const { container } = render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: {} }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={refreshConfigSnapshot}
        refreshAuthState={refreshAuthState}
        listCodexProviders={listCodexProviders}
        upsertCodexProvider={upsertCodexProvider}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={applyCodexProvider}
        windowsSandboxSetup={{ pending: false, mode: null, success: null, error: null }}
        startWindowsSandboxSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

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
    expect(refreshConfigSnapshot).toHaveBeenCalled();
    expect(refreshAuthState).toHaveBeenCalled();
  });

  it("does not render the model input for provider settings", async () => {
    const { container } = render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: {} }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={vi.fn().mockResolvedValue(undefined)}
        refreshAuthState={vi.fn().mockResolvedValue(undefined)}
        listCodexProviders={vi.fn().mockResolvedValue({ version: 1, providers: [] })}
        upsertCodexProvider={vi.fn()}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={vi.fn()}
        windowsSandboxSetup={{ pending: false, mode: null, success: null, error: null }}
        startWindowsSandboxSetup={vi.fn().mockResolvedValue({ started: true })}
      />,
    );

    openAddProviderDialog(container);

    expect(container.querySelectorAll(".codex-provider-form input")).toHaveLength(4);
  });
});
