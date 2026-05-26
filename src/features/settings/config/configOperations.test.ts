import { describe, expect, it, vi } from "vitest";
import type { ProtocolClient } from "../../../protocol/client";
import {
  batchWriteConfigAndReadSnapshot,
  batchWriteConfigAndRefresh,
  listConfiguredHooks,
  listAllMcpServerStatuses,
  writeConfigValueAndRefresh
} from "./configOperations";

const SNAPSHOT = {
  config: { mcp_servers: { fetch: { command: "uvx", args: ["mcp-server-fetch"] } } },
  origins: {},
  layers: []
};

const STATUS_PAGE = {
  data: [
    {
      name: "fetch",
      tools: { fetch: {} },
      resources: [],
      resourceTemplates: [],
      authStatus: "unsupported"
    }
  ],
  nextCursor: null
};

function createClient() {
  const request = vi.fn(async (method: string, _params?: unknown) => {
    if (method === "config/value/write" || method === "config/batchWrite") {
      return { status: "ok", version: "u2", filePath: "C:/Users/Administrator/.codex/config.toml", overriddenMetadata: null };
    }
    if (method === "config/mcpServer/reload") {
      return {};
    }
    if (method === "config/read") {
      return SNAPSHOT;
    }
    if (method === "mcpServerStatus/list") {
      return STATUS_PAGE;
    }
    if (method === "hooks/list") {
      return { data: [] };
    }
    throw new Error(`unexpected method: ${method}`);
  });
  return { client: { request } as unknown as ProtocolClient, request };
}

describe("configOperations", () => {
  it("writes one config value then reloads and refreshes config + statuses", async () => {
    const dispatch = vi.fn();
    const { client, request } = createClient();

    await writeConfigValueAndRefresh(client, dispatch, {
      keyPath: "mcp_servers.fetch.enabled",
      value: true,
      mergeStrategy: "upsert",
      filePath: null,
      expectedVersion: null
    });

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "config/value/write",
      "config/mcpServer/reload",
      "config/read",
      "mcpServerStatus/list"
    ]);
    expect(dispatch).toHaveBeenCalledWith({ type: "config/loaded", config: SNAPSHOT });
  });

  it("batch writes config then reloads and refreshes config + statuses", async () => {
    const dispatch = vi.fn();
    const { client, request } = createClient();

    await batchWriteConfigAndRefresh(client, dispatch, {
      edits: [{ keyPath: "mcp_servers", value: {}, mergeStrategy: "replace" }],
      filePath: null,
      expectedVersion: null
    });

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "config/batchWrite",
      "config/mcpServer/reload",
      "config/read",
      "mcpServerStatus/list"
    ]);
    expect(dispatch).toHaveBeenCalledWith({ type: "config/loaded", config: SNAPSHOT });
  });

  it("batch writes config and only refreshes the config snapshot when MCP reload is unnecessary", async () => {
    const dispatch = vi.fn();
    const { client, request } = createClient();

    await batchWriteConfigAndReadSnapshot(client, dispatch, {
      edits: [{ keyPath: "model", value: "gpt-5.5", mergeStrategy: "upsert" }],
      filePath: null,
      expectedVersion: null
    });

    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "config/batchWrite",
      "config/read"
    ]);
    expect(dispatch).toHaveBeenCalledWith({ type: "config/loaded", config: SNAPSHOT });
  });

  it("reuses MCP status requests within the cache window", async () => {
    const { client, request } = createClient();

    await listAllMcpServerStatuses(client);
    await listAllMcpServerStatuses(client);

    expect(request.mock.calls.map(([method]) => method)).toEqual(["mcpServerStatus/list"]);
    expect(request).toHaveBeenCalledWith("mcpServerStatus/list", {
      cursor: null,
      limit: 100,
      detail: "toolsAndAuthOnly"
    });
  });

  it("bypasses the MCP status cache when forced", async () => {
    const { client, request } = createClient();

    await listAllMcpServerStatuses(client);
    await listAllMcpServerStatuses(client, { force: true });

    expect(request.mock.calls.map(([method]) => method)).toEqual(["mcpServerStatus/list", "mcpServerStatus/list"]);
    expect(request.mock.calls.map(([, params]) => params)).toEqual([
      { cursor: null, limit: 100, detail: "toolsAndAuthOnly" },
      { cursor: null, limit: 100, detail: "toolsAndAuthOnly" }
    ]);
  });

  it("lists configured hooks for unique non-empty workspaces", async () => {
    const { client, request } = createClient();

    await listConfiguredHooks(client, [" E:/code/app ", "", "E:/code/app", "E:/code/other"]);

    expect(request).toHaveBeenCalledWith("hooks/list", {
      cwds: ["E:/code/app", "E:/code/other"],
    });
  });

  it("lets app-server choose the current cwd when no hook workspace is provided", async () => {
    const { client, request } = createClient();

    await listConfiguredHooks(client, []);

    expect(request).toHaveBeenCalledWith("hooks/list", {});
  });
});
