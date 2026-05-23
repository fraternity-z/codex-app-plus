import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { AgentsSettingsSection } from "./AgentsSettingsSection";

function createConfigSnapshot(enabled = false): ConfigReadResponse {
  return {
    config: {
      features: { multi_agent: enabled, multi_agent_v2: enabled },
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
    refreshConfigSnapshot: vi.fn().mockResolvedValue(createConfigSnapshot(true)),
    setMultiAgentEnabled: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("AgentsSettingsSection", () => {
  it("renders only the multi-agent switch", () => {
    render(<AgentsSettingsSection {...createProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "启用 Multi-Agent" })).toBeInTheDocument();
    expect(screen.queryByText("最大线程数")).not.toBeInTheDocument();
    expect(screen.queryByText("创建 Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("已配置 Agents")).not.toBeInTheDocument();
  });

  it("toggles multi-agent through the controller so the app-server restarts", async () => {
    const setMultiAgentEnabled = vi.fn().mockResolvedValue(undefined);
    render(<AgentsSettingsSection {...createProps({ setMultiAgentEnabled })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    fireEvent.click(screen.getByRole("switch", { name: "启用 Multi-Agent" }));

    await waitFor(() => expect(setMultiAgentEnabled).toHaveBeenCalledWith(true));
  });
});
