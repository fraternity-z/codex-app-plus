import type { ConnectionStatus } from "../../../domain/types";
import type { SkillsListEntry } from "../../../protocol/generated/v2/SkillsListEntry";
import type { ExperimentalFeature } from "../../../protocol/generated/v2/ExperimentalFeature";
import type { GetAccountResponse } from "../../../protocol/generated/v2/GetAccountResponse";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigRequirementsReadResponse } from "../../../protocol/generated/v2/ConfigRequirementsReadResponse";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import type { AppInfo } from "../../../protocol/generated/v2/AppInfo";
import { readUserConfigWriteTarget } from "../../settings/config/configWriteTarget";

const SUMMARY_LIMIT = 5;

export function formatFeatureSummary(features: ReadonlyArray<ExperimentalFeature>): string {
  const enabled = features.filter((feature) => feature.enabled).map((feature) => feature.name);
  return `共 ${features.length} 项；已启用 ${enabled.length} 项：${formatNames(enabled)}`;
}

export function formatSkillSummary(entries: ReadonlyArray<SkillsListEntry>): string {
  const skillCount = entries.reduce((count, entry) => count + entry.skills.length, 0);
  const errorCount = entries.reduce((count, entry) => count + entry.errors.length, 0);
  const cwdSummary = entries.map((entry) => `${entry.cwd} (${entry.skills.length})`);
  return `共扫描 ${skillCount} 个技能，错误 ${errorCount} 个。${cwdSummary.length === 0 ? "" : ` 工作区：${formatNames(cwdSummary)}`}`;
}

export function formatStatusDetail(connectionStatus: ConnectionStatus, account: GetAccountResponse, rateLimits: RateLimitSnapshot, config: ConfigReadResponse): string {
  const accountText = account.account === null ? "未登录" : account.account.type === "apiKey" ? "API Key" : `ChatGPT · ${account.account.planType}`;
  return [
    `连接：${connectionStatus}`,
    `账号：${accountText}`,
    `模型：${config.config.model ?? "未设置"}`,
    `审批：${String(config.config.approval_policy ?? "未设置")}`,
    `速率桶：${rateLimits.limitName ?? rateLimits.limitId ?? "default"}`,
  ].join("\n");
}

export function formatConfigDebugDetail(config: ConfigReadResponse, requirementsResponse: ConfigRequirementsReadResponse): string {
  const writeTarget = readUserConfigWriteTarget(config);
  const requirements = requirementsResponse.requirements;
  return [
    `用户配置：${writeTarget.filePath ?? "默认 config.toml"}`,
    `模型：${config.config.model ?? "未设置"}`,
    `审批：${String(config.config.approval_policy ?? "未设置")}`,
    `Sandbox：${String(config.config.sandbox_mode ?? "未设置")}`,
    `受限审批：${requirements?.allowedApprovalPolicies?.join(", ") ?? "无"}`,
  ].join("\n");
}

export function formatMcpSummary(statuses: ReadonlyArray<McpServerStatus>, config: ConfigReadResponse): string {
  const statusText = statuses.map((status) => `${status.name} (${String(status.authStatus)})`);
  return `共 ${statuses.length} 个服务器；配置来源：${readUserConfigWriteTarget(config).filePath ?? "默认 config.toml"}；${formatNames(statusText)}`;
}

export function formatAppSummary(apps: ReadonlyArray<AppInfo>): string {
  const enabled = apps.filter((app) => app.isEnabled).length;
  const accessible = apps.filter((app) => app.isAccessible).length;
  return `共 ${apps.length} 个 app；已启用 ${enabled} 个；可访问 ${accessible} 个：${formatNames(apps.map((app) => app.name))}`;
}

function formatNames(items: ReadonlyArray<string>): string {
  if (items.length === 0) return "无";
  return items.slice(0, SUMMARY_LIMIT).join(", ");
}
