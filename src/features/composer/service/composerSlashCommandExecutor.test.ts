import { describe, expect, it, vi } from "vitest";
import type { AppAction } from "../../../domain/types";
import type { CollaborationPreset } from "../../../domain/timeline";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import type { ComposerCommandBridge } from "./composerCommandBridge";
import {
  executeDirectSlashCommand,
  type SlashExecutionContext,
  type SlashExecutionDependencies,
} from "./composerSlashCommandExecutor";

function createContext(overrides: Partial<SlashExecutionContext> = {}): SlashExecutionContext {
  return {
    selectedThreadId: "thread-1",
    selectedRootPath: "E:/code/codex-app-plus",
    selectedServiceTier: null,
    collaborationPreset: "default",
    selectedConversation: null,
    configSnapshot: null,
    account: null,
    rateLimits: null,
    connectionStatus: "connected",
    realtimeState: null,
    collaborationModes: [],
    taskRunning: false,
    ...overrides,
  };
}

function createDeps(request: ReturnType<typeof vi.fn>): SlashExecutionDependencies {
  return {
    composerCommandBridge: {
      startFuzzySession: vi.fn().mockResolvedValue(undefined),
      updateFuzzySession: vi.fn().mockResolvedValue(undefined),
      stopFuzzySession: vi.fn().mockResolvedValue(undefined),
      request,
    } satisfies ComposerCommandBridge,
    dispatch: vi.fn() as unknown as (action: AppAction) => void,
    onSelectServiceTier: vi.fn() as unknown as (tier: ServiceTier | null) => void,
    onSelectPermissionLevel: vi.fn(),
    onSelectCollaborationPreset: vi.fn() as unknown as (preset: CollaborationPreset) => void,
    onLogout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("composerSlashCommandExecutor", () => {
  it("rejects /init from the direct executor path", async () => {
    const deps = createDeps(vi.fn().mockResolvedValue({}));

    await expect(
      executeDirectSlashCommand("init", "", createContext(), deps),
    ).rejects.toThrow("/init 应通过用户消息链路分发。");
  });

  it("supports /fast inline arguments", async () => {
    const deps = createDeps(vi.fn().mockResolvedValue({}));

    await executeDirectSlashCommand("fast", "on", createContext(), deps);
    await executeDirectSlashCommand("fast", "off", createContext({ selectedServiceTier: "fast" }), deps);

    expect(deps.onSelectServiceTier).toHaveBeenNthCalledWith(1, "fast");
    expect(deps.onSelectServiceTier).toHaveBeenNthCalledWith(2, null);
  });

  it("routes /review inline arguments to the custom review target", async () => {
    const request = vi.fn().mockResolvedValue({});
    const deps = createDeps(request);

    await executeDirectSlashCommand("review", "重点检查权限变更", createContext(), deps);

    expect(request).toHaveBeenCalledWith("review/start", {
      threadId: "thread-1",
      target: { type: "custom", instructions: "重点检查权限变更" },
      delivery: "inline",
    });
  });

  it("lists plugins through plugin/list", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "plugin/list") {
        return { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] };
      }
      return {};
    });
    const deps = createDeps(request);

    await executeDirectSlashCommand("plugins", "", createContext(), deps);

    expect(request).toHaveBeenCalledWith("plugin/list", {
      cwds: ["E:/code/codex-app-plus"],
    });
  });

  it("refreshes MCP status with the lightweight status detail", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "config/read") {
        return { config: {}, origins: {}, layers: [] };
      }
      if (method === "mcpServerStatus/list") {
        return {
          data: [{ name: "fetch", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" }],
          nextCursor: null,
        };
      }
      return {};
    });
    const deps = createDeps(request);

    await executeDirectSlashCommand("mcp", "", createContext(), deps);

    expect(request).toHaveBeenCalledWith("config/mcpServer/reload", undefined);
    expect(request).toHaveBeenCalledWith("mcpServerStatus/list", {
      cursor: null,
      limit: 100,
      detail: "toolsAndAuthOnly",
    });
  });
});
