import { describe, expect, it } from "vitest";
import {
  buildMcpServerConfigValue,
  createMcpServerFormState,
  validateMcpServerForm,
  type McpServerFormMessages,
} from "./mcpFormModel";

const TEST_MESSAGES: McpServerFormMessages = {
  idRequired: "id required",
  idNoDot: "id no dot",
  commandRequired: "command required",
  urlRequired: (type) => `${type} url required`,
  urlInvalid: "url invalid",
  envLabel: "Env",
  headersLabel: "Headers",
  keyValueFormat: (label) => `${label} format`,
  keyValueEmptyKey: (label) => `${label} empty key`,
};

describe("mcpFormModel", () => {
  it("validates dotted ids and malformed key-value inputs with injected messages", () => {
    const errors = validateMcpServerForm({
      ...createMcpServerFormState(null),
      id: "bad.id",
      command: "npx",
      envText: "BAD",
    }, TEST_MESSAGES);

    expect(errors.id).toBe("id no dot");
    expect(errors.envText).toBe("Env format");
  });

  it("builds stdio and http config values from validated form data", () => {
    const stdioValue = buildMcpServerConfigValue({
      ...createMcpServerFormState(null),
      id: "fetch",
      name: "Fetch",
      type: "stdio",
      command: "uvx",
      argsText: "mcp-server-fetch",
      cwd: "/repo",
      envText: "TOKEN=secret",
      envVarsText: "LOCAL_TOKEN",
      enabled: true,
    }, TEST_MESSAGES);
    const httpValue = buildMcpServerConfigValue({
      ...createMcpServerFormState(null),
      id: "linear",
      type: "http",
      url: "https://mcp.linear.app/mcp",
      bearerTokenEnvVar: "LINEAR_TOKEN",
      httpHeadersText: "X-Region=us",
      envHttpHeadersText: "Authorization=LINEAR_AUTH_HEADER",
      enabled: false,
    }, TEST_MESSAGES);

    expect(stdioValue).toEqual({
      name: "Fetch",
      enabled: true,
      type: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
      cwd: "/repo",
      env: { TOKEN: "secret" },
      env_vars: ["LOCAL_TOKEN"],
    });
    expect(httpValue).toEqual({
      enabled: false,
      type: "http",
      url: "https://mcp.linear.app/mcp",
      bearer_token_env_var: "LINEAR_TOKEN",
      http_headers: { "X-Region": "us" },
      env_http_headers: { Authorization: "LINEAR_AUTH_HEADER" },
    });
  });
});
