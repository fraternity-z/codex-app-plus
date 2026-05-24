import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { AgentsSettingsSection } from "./AgentsSettingsSection";

function createConfigSnapshot(options: {
  readonly multiAgent?: boolean;
  readonly multiAgentV2?: boolean;
  readonly maxThreads?: number;
  readonly maxDepth?: number;
  readonly jobMaxRuntimeSeconds?: number | null;
} = {}): ConfigReadResponse {
  return {
    config: {
      features: {
        multi_agent: options.multiAgent ?? false,
        multi_agent_v2: options.multiAgentV2 ?? false,
      },
      agents: {
        max_threads: options.maxThreads ?? 6,
        max_depth: options.maxDepth ?? 1,
        ...(options.jobMaxRuntimeSeconds == null
          ? {}
          : { job_max_runtime_seconds: options.jobMaxRuntimeSeconds }),
      },
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
    refreshConfigSnapshot: vi.fn().mockResolvedValue(createConfigSnapshot({ multiAgent: true })),
    applyAgentsConfig: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("AgentsSettingsSection", () => {
  it("renders multi-agent and multi-agent-v2 switches with advanced settings collapsed", () => {
    render(<AgentsSettingsSection {...createProps()} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "features.multi_agent" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "features.multi_agent_v2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "高级设置" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("最大线程数")).not.toBeInTheDocument();
    expect(screen.queryByText("创建 Agent")).not.toBeInTheDocument();
  });

  it("renders the embedded Agents header as a section title instead of a card", () => {
    render(<AgentsSettingsSection {...createProps({ embedded: true })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    const heading = screen.getByRole("heading", { level: 2, name: "Agents" });
    expect(heading).toHaveClass("settings-section-title");
    expect(heading.closest(".settings-card")).toBeNull();
    expect(screen.queryByText("配置 Codex 多代理开关与代理参数。")).not.toBeInTheDocument();
  });

  it("applies a single feature flag through the app-server config path", async () => {
    const applyAgentsConfig = vi.fn().mockResolvedValue(undefined);
    render(<AgentsSettingsSection {...createProps({ applyAgentsConfig })} />, {
      wrapper: createI18nWrapper("zh-CN"),
    });

    fireEvent.click(screen.getByRole("switch", { name: "features.multi_agent" }));

    await waitFor(() => expect(applyAgentsConfig).toHaveBeenCalledWith({
      multiAgentEnabled: true,
      multiAgentV2Enabled: false,
      maxThreads: 6,
      maxDepth: 1,
      jobMaxRuntimeSeconds: null,
      role: null,
    }));
  });

  it("applies advanced agent parameters and a role config", async () => {
    const applyAgentsConfig = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentsSettingsSection
        {...createProps({
          applyAgentsConfig,
          configSnapshot: createConfigSnapshot({
            multiAgent: true,
            multiAgentV2: true,
            maxThreads: 6,
            maxDepth: 1,
          }),
        })}
      />,
      { wrapper: createI18nWrapper("zh-CN") },
    );

    fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /最大线程数/ }), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /最大深度/ }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /Worker 超时秒数/ }), {
      target: { value: "2400" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /角色名称/ }), {
      target: { value: "reviewer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /配置文件路径/ }), {
      target: { value: "agents/reviewer.toml" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /昵称候选/ }), {
      target: { value: "Atlas, Delta" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /角色说明/ }), {
      target: { value: "Review code changes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));

    await waitFor(() => expect(applyAgentsConfig).toHaveBeenCalledWith({
      multiAgentEnabled: true,
      multiAgentV2Enabled: true,
      maxThreads: 8,
      maxDepth: 2,
      jobMaxRuntimeSeconds: 2400,
      role: {
        name: "reviewer",
        description: "Review code changes.",
        configFile: "agents/reviewer.toml",
        nicknameCandidates: ["Atlas", "Delta"],
      },
    }));
  });
});
