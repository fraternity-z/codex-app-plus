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
    model: "gpt-5.4",
    authJsonText: '{\n  "OPENAI_API_KEY": "secret-1"\n}\n',
    configTomlText:
      'model_provider = "right_code"\nmodel = "gpt-5.4"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.right_code]\nname = "Right Code"\nbase_url = "https://right.codes/codex/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n',
    createdAt: 1,
    updatedAt: 2,
  };
}

describe("ConfigSettingsSection", () => {
  it("renders provider rows and marks the current provider", async () => {
    render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: { model_provider: "right_code" } }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={vi.fn().mockResolvedValue(undefined)}
        listCodexProviders={vi.fn().mockResolvedValue({ version: 1, providers: [createProvider()] })}
        upsertCodexProvider={vi.fn()}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={vi.fn()}
      />
    );

    expect(await screen.findByText("Right Code")).toBeInTheDocument();
    expect(screen.getByText("当前已应用")).toBeInTheDocument();
  });

  it("disables save when advanced content is invalid", async () => {
    render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: {} }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={vi.fn().mockResolvedValue(undefined)}
        listCodexProviders={vi.fn().mockResolvedValue({ version: 1, providers: [] })}
        upsertCodexProvider={vi.fn()}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增提供商" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Right Code" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "secret-1" } });
    fireEvent.change(screen.getByLabelText("auth.json"), { target: { value: "{bad json}" } });

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
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
    const listCodexProviders = vi
      .fn()
      .mockResolvedValueOnce({ version: 1, providers: [] })
      .mockResolvedValueOnce({ version: 1, providers: [savedProvider] });

    render(
      <ConfigSettingsSection
        busy={false}
        configSnapshot={{ config: {} }}
        onOpenConfigToml={vi.fn().mockResolvedValue(undefined)}
        refreshConfigSnapshot={refreshConfigSnapshot}
        listCodexProviders={listCodexProviders}
        upsertCodexProvider={upsertCodexProvider}
        deleteCodexProvider={vi.fn()}
        applyCodexProvider={applyCodexProvider}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "新增提供商" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Right Code" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "secret-1" } });
    fireEvent.change(screen.getByLabelText("providerKey"), { target: { value: "right_code" } });
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "https://right.codes/codex/v1" } });
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "gpt-5.4" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并应用" }));

    await waitFor(() => expect(upsertCodexProvider).toHaveBeenCalled());
    expect(applyCodexProvider).toHaveBeenCalledWith({ id: savedProvider.id });
    expect(refreshConfigSnapshot).toHaveBeenCalled();
  });
});
