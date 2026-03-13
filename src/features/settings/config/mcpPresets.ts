import type { JsonValue } from "../../../protocol/generated/serde_json/JsonValue";

export type JsonObject = Record<string, JsonValue>;

export interface McpRecommendedPreset {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly description: string;
  readonly docsUrl: string;
  readonly value: JsonObject;
}

export const MCP_RECOMMENDED_PRESETS: ReadonlyArray<McpRecommendedPreset> = [
  {
    id: "linear",
    label: "Linear",
    vendor: "Linear",
    description: "连接 Linear 的 issue、项目与团队数据。",
    docsUrl: "https://mcp.linear.app/mcp",
    value: { url: "https://mcp.linear.app/mcp" }
  },
  {
    id: "notion",
    label: "Notion",
    vendor: "Notion",
    description: "读取和更新 Notion 页面、数据库与任务。",
    docsUrl: "https://mcp.notion.com/mcp",
    value: { url: "https://mcp.notion.com/mcp" }
  },
  {
    id: "figma",
    label: "Figma",
    vendor: "Figma",
    description: "将 Figma 设计上下文接入 Codex。",
    docsUrl: "https://mcp.figma.com/mcp",
    value: { url: "https://mcp.figma.com/mcp" }
  },
  {
    id: "playwright",
    label: "Playwright",
    vendor: "Microsoft",
    description: "在真实浏览器中执行自动化与页面调试。",
    docsUrl: "https://www.npmjs.com/package/@playwright/mcp",
    value: { command: "npx", args: ["@playwright/mcp@latest"] }
  }
];
