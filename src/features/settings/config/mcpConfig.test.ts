import { describe, expect, it } from "vitest";
import { omitServer, readMcpConfigView } from "./mcpConfig";

const USER_FILE = "C:/Users/Administrator/.codex/config.toml";

function createSnapshot() {
  return {
    config: {
      mcp_servers: {
        playwright: { command: "npx", args: ["@playwright/mcp@latest"], enabled: true },
        projectOnly: { url: "https://project.example/mcp" }
      }
    },
    origins: {
      "mcp_servers.playwright": { name: { type: "user", file: USER_FILE }, version: "u1" },
      "mcp_servers.projectOnly": { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1" }
    },
    layers: [
      { name: { type: "project", dotCodexFolder: "E:/repo/.codex" }, version: "p1", config: {}, disabledReason: null },
      { name: { type: "user", file: USER_FILE }, version: "u1", config: {}, disabledReason: null }
    ]
  };
}

describe("mcpConfig", () => {
  it("splits writable and read-only servers from config snapshot", () => {
    const view = readMcpConfigView(createSnapshot(), [
      {
        name: "playwright",
        tools: { browser_navigate: {} as never },
        resources: [],
        resourceTemplates: [],
        authStatus: "unsupported"
      }
    ]);

    expect(view.writeTarget.filePath).toBe(USER_FILE);
    expect(view.userServers.map((server) => server.id)).toEqual(["playwright"]);
    expect(view.readOnlyServers.map((server) => server.id)).toEqual(["projectOnly"]);
    expect(view.userServers[0]?.runtime?.toolCount).toBe(1);
    expect(view.installedPresetIds.has("playwright")).toBe(true);
  });

  it("omits a server by rebuilding the root mcp_servers object", () => {
    expect(omitServer({ alpha: { command: "npx" }, beta: { url: "https://example.com" } }, "alpha")).toEqual({
      beta: { url: "https://example.com" }
    });
  });
});
