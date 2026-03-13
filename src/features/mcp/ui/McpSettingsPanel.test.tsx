import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConfigMutationResult, McpRefreshResult } from "../../settings/config/configOperations";
import { McpSettingsPanel } from "./McpSettingsPanel";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

function createSnapshot() {
  return {
    config: {
      mcp_servers: {
        fetch: { command: "uvx", args: ["mcp-server-fetch"], enabled: true },
        projectOnly: { url: "https://project.example/mcp" }
      }
    },
    origins: {
      "mcp_servers.fetch": { name: { type: "user", file: USER_FILE }, version: "u1" },
      "mcp_servers.projectOnly": { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1" }
    },
    layers: [
      { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
      { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
    ]
  };
}

function createRefreshResult(snapshot = createSnapshot()): McpRefreshResult {
  return {
    config: snapshot as never,
    reload: {},
    statuses: [{ name: "fetch", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" }]
  };
}

function createMutationResult(snapshot = createSnapshot()): ConfigMutationResult {
  return {
    config: snapshot as never,
    statuses: [{ name: "fetch", tools: {}, resources: [], resourceTemplates: [], authStatus: "unsupported" }],
    write: { status: "ok", version: "u2", filePath: USER_FILE, overriddenMetadata: null }
  };
}

describe("McpSettingsPanel", () => {
  it("renders writable and read-only servers from config snapshot", async () => {
    const refreshMcpData = vi.fn().mockResolvedValue(createRefreshResult());

    render(
      <McpSettingsPanel
        busy={false}
        configSnapshot={createSnapshot()}
        refreshMcpData={refreshMcpData}
        writeConfigValue={vi.fn().mockResolvedValue(createMutationResult())}
        batchWriteConfig={vi.fn().mockResolvedValue(createMutationResult())}
      />
    );

    await waitFor(() => expect(refreshMcpData).toHaveBeenCalled());

    expect(screen.getAllByText("fetch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("projectOnly").length).toBeGreaterThan(0);
    expect(screen.getByText("只读")).not.toBeNull();
  });

  it("blocks dotted server ids before submit", async () => {
    const writeConfigValue = vi.fn().mockResolvedValue(createMutationResult());

    render(
      <McpSettingsPanel
        busy={false}
        configSnapshot={createSnapshot()}
        refreshMcpData={vi.fn().mockResolvedValue(createRefreshResult())}
        writeConfigValue={writeConfigValue}
        batchWriteConfig={vi.fn().mockResolvedValue(createMutationResult())}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "添加服务器" }));
    fireEvent.change(screen.getByLabelText("服务器 ID"), { target: { value: "bad.id" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("服务器 ID 不能包含 .")).not.toBeNull();
    expect(writeConfigValue).not.toHaveBeenCalled();
  });

  it("deletes a server by replacing the root mcp_servers object", async () => {
    const batchWriteConfig = vi.fn().mockResolvedValue(createMutationResult({
      ...createSnapshot(),
      config: { mcp_servers: { projectOnly: { url: "https://project.example/mcp" } } }
    } as unknown as ReturnType<typeof createSnapshot>));

    render(
      <McpSettingsPanel
        busy={false}
        configSnapshot={createSnapshot()}
        refreshMcpData={vi.fn().mockResolvedValue(createRefreshResult())}
        writeConfigValue={vi.fn().mockResolvedValue(createMutationResult())}
        batchWriteConfig={batchWriteConfig}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(batchWriteConfig).toHaveBeenCalled());
    expect(batchWriteConfig).toHaveBeenCalledWith({
      edits: [{ keyPath: "mcp_servers", value: {}, mergeStrategy: "replace" }],
      filePath: USER_FILE,
      expectedVersion: "u1"
    });
  });
});
