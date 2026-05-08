import { describe, expect, it, vi } from "vitest";
import type { AppAction } from "../../../domain/types";
import type { CollaborationPreset } from "../../../domain/timeline";
import type { ServiceTier } from "../../../protocol/ServiceTier";
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

  it("sets a thread goal with inline arguments", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "thread/goal/set") {
        return {
          goal: {
            threadId: "thread-1",
            objective: "finish the migration",
            status: "active",
            tokenBudget: null,
            tokensUsed: 0,
            timeUsedSeconds: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        };
      }
      return {};
    });
    const deps = createDeps(request);

    await executeDirectSlashCommand("goal", "finish the migration", createContext(), deps);

    expect(request).toHaveBeenCalledWith("thread/goal/set", {
      threadId: "thread-1",
      objective: "finish the migration",
    });
  });

  it("routes /goal controls to the goal API", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "thread/goal/set") {
        return {
          goal: {
            threadId: "thread-1",
            objective: "finish the migration",
            status: "paused",
            tokenBudget: 1000,
            tokensUsed: 10,
            timeUsedSeconds: 60,
            createdAt: 1,
            updatedAt: 2,
          },
        };
      }
      if (method === "thread/goal/clear") {
        return { cleared: true };
      }
      return {};
    });
    const deps = createDeps(request);

    await executeDirectSlashCommand("goal", "pause", createContext(), deps);
    await executeDirectSlashCommand("goal", "resume", createContext(), deps);
    await executeDirectSlashCommand("goal", "clear", createContext(), deps);

    expect(request).toHaveBeenCalledWith("thread/goal/set", {
      threadId: "thread-1",
      status: "paused",
    });
    expect(request).toHaveBeenCalledWith("thread/goal/set", {
      threadId: "thread-1",
      status: "active",
    });
    expect(request).toHaveBeenCalledWith("thread/goal/clear", {
      threadId: "thread-1",
    });
  });

  it("shows the current goal when /goal has no arguments", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "thread/goal/get") {
        return {
          goal: {
            threadId: "thread-1",
            objective: "finish the migration",
            status: "active",
            tokenBudget: 1000,
            tokensUsed: 10,
            timeUsedSeconds: 60,
            createdAt: 1,
            updatedAt: 2,
          },
        };
      }
      return {};
    });
    const deps = createDeps(request);

    await executeDirectSlashCommand("goal", "", createContext(), deps);

    expect(request).toHaveBeenCalledWith("thread/goal/get", {
      threadId: "thread-1",
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
