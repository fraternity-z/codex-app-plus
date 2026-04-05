import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { AgentsSettingsSection } from "./AgentsSettingsSection";

function createConfigSnapshot(): ConfigReadResponse {
  return {
    config: {
      features: { multi_agent: false },
      agents: { max_threads: 6, max_depth: 1 },
    },
    layers: [{ name: { type: "user", file: "C:/Users/Administrator/.codex/config.toml" }, version: "u1", config: {}, disabledReason: null }],
    origins: {},
  } as unknown as ConfigReadResponse;
}

function createProps(
  overrides: Partial<ComponentProps<typeof AgentsSettingsSection>> = {},
): ComponentProps<typeof AgentsSettingsSection> {
  return {
    busy: false,
    configSnapshot: createConfigSnapshot(),
    experimentalFeatures: [],
    onOpenConfigToml: vi.fn().mockResolvedValue(undefined),
    refreshConfigSnapshot: vi.fn().mockResolvedValue({ config: {}, layers: [], origins: {} }),
    getAgentsSettings: vi.fn().mockResolvedValue({
      configPath: "C:/Users/Administrator/.codex/config.toml",
      multiAgentEnabled: false,
      maxThreads: 6,
      maxDepth: 1,
      agents: [],
    }),
    createAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    updateAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    deleteAgent: vi.fn().mockResolvedValue({ configPath: "", multiAgentEnabled: false, maxThreads: 6, maxDepth: 1, agents: [] }),
    readAgentConfig: vi.fn().mockResolvedValue({ content: "model = \"gpt-5-codex\"\n" }),
    writeAgentConfig: vi.fn().mockResolvedValue({ content: "model = \"gpt-5-codex\"\n" }),
    batchWriteConfig: vi.fn().mockResolvedValue({ config: { config: {} }, statuses: [], write: {} }),
    ...overrides,
  };
}

describe("AgentsSettingsSection", () => {
  it("loads agents settings on mount", async () => {
    const getAgentsSettings = vi.fn().mockResolvedValue({
      configPath: "C:/Users/Administrator/.codex/config.toml",
      multiAgentEnabled: false,
      maxThreads: 6,
      maxDepth: 1,
      agents: [],
    });
    render(<AgentsSettingsSection {...createProps({ getAgentsSettings })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(await screen.findByText("Agents")).toBeInTheDocument();
    await waitFor(() => expect(getAgentsSettings).toHaveBeenCalled());
  });

  it("writes max threads via batchWriteConfig", async () => {
    const batchWriteConfig = vi.fn().mockResolvedValue({ config: { config: {} }, statuses: [], write: {} });
    render(<AgentsSettingsSection {...createProps({ batchWriteConfig })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    await screen.findByText("Agents");
    const plusButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(plusButtons[0]);
    await waitFor(() => expect(batchWriteConfig).toHaveBeenCalled());
  });
});
