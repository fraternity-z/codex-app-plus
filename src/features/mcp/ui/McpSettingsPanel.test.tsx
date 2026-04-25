import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { type Locale } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
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

function renderPanel(
  props: ComponentProps<typeof McpSettingsPanel>,
  locale: Locale = "zh-CN"
) {
  return render(<McpSettingsPanel {...props} />, {
    wrapper: createI18nWrapper(locale)
  });
}

describe("McpSettingsPanel", () => {
  it("renders writable servers from config snapshot", async () => {
    const refreshMcpData = vi.fn().mockResolvedValue(createRefreshResult());

    renderPanel({
      busy: false,
      configSnapshot: createSnapshot(),
      refreshMcpData,
      writeConfigValue: vi.fn().mockResolvedValue(createMutationResult()),
      batchWriteConfig: vi.fn().mockResolvedValue(createMutationResult())
    });

    await waitFor(() => expect(refreshMcpData).toHaveBeenCalled());

    expect(screen.getAllByText("fetch").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("projectOnly")).toHaveLength(0);
    expect(screen.queryByText("只读")).toBeNull();
  });

  it("blocks dotted server ids before submit", async () => {
    const writeConfigValue = vi.fn().mockResolvedValue(createMutationResult());

    renderPanel({
      busy: false,
      configSnapshot: createSnapshot(),
      refreshMcpData: vi.fn().mockResolvedValue(createRefreshResult()),
      writeConfigValue,
      batchWriteConfig: vi.fn().mockResolvedValue(createMutationResult())
    });

    fireEvent.click(await screen.findByRole("button", { name: "添加服务器" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "bad.id" } });
    fireEvent.change(screen.getByLabelText("启动命令"), { target: { value: "npx" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("名称不能包含 .")).not.toBeNull();
    expect(writeConfigValue).not.toHaveBeenCalled();
  });

  it("opens the editor from the row gear button", async () => {
    const writeConfigValue = vi.fn().mockResolvedValue(createMutationResult());

    renderPanel({
      busy: false,
      configSnapshot: createSnapshot(),
      refreshMcpData: vi.fn().mockResolvedValue(createRefreshResult()),
      writeConfigValue,
      batchWriteConfig: vi.fn().mockResolvedValue(createMutationResult())
    });

    fireEvent.click(await screen.findByRole("button", { name: "编辑 fetch" }));
    fireEvent.change(screen.getByLabelText("启动命令"), { target: { value: "uvx" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(writeConfigValue).toHaveBeenCalled());
    expect(writeConfigValue.mock.calls[0]?.[0].keyPath).toBe("mcp_servers.fetch");
  });

  it("keeps the editor open on empty-page clicks and returns only from the back button", async () => {
    const { container } = renderPanel({
      busy: false,
      configSnapshot: createSnapshot(),
      refreshMcpData: vi.fn().mockResolvedValue(createRefreshResult()),
      writeConfigValue: vi.fn().mockResolvedValue(createMutationResult()),
      batchWriteConfig: vi.fn().mockResolvedValue(createMutationResult())
    });

    fireEvent.click(await screen.findByRole("button", { name: "添加服务器" }));
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByText("服务器")).toBeNull();

    const editorPage = container.querySelector(".mcp-editor-page");
    expect(editorPage).not.toBeNull();
    fireEvent.click(editorPage!);
    expect(screen.getByLabelText("名称")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByText("服务器")).toBeInTheDocument();
  });

  it("renders English copy when locale is en-US", async () => {
    renderPanel({
      busy: false,
      configSnapshot: createSnapshot(),
      refreshMcpData: vi.fn().mockResolvedValue(createRefreshResult()),
      writeConfigValue: vi.fn().mockResolvedValue(createMutationResult()),
      batchWriteConfig: vi.fn().mockResolvedValue(createMutationResult())
    }, "en-US");

    expect(await screen.findByText("MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Servers")).toBeInTheDocument();
    expect(screen.queryByText("Read-only")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended servers")).not.toBeInTheDocument();
  });
});
