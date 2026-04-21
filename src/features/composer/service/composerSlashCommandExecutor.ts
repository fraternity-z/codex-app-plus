import type { AppAction, AccountSummary, ConnectionStatus, RealtimeState } from "../../../domain/types";
import type { ConversationState } from "../../../domain/conversation";
import type { CollaborationPreset, CollaborationModePreset } from "../../../domain/timeline";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { GetAccountResponse } from "../../../protocol/generated/v2/GetAccountResponse";
import type { GetAccountRateLimitsResponse } from "../../../protocol/generated/v2/GetAccountRateLimitsResponse";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import type { ReviewStartResponse } from "../../../protocol/generated/v2/ReviewStartResponse";
import type { ThreadForkResponse } from "../../../protocol/generated/v2/ThreadForkResponse";
import type { ThreadResumeResponse } from "../../../protocol/generated/v2/ThreadResumeResponse";
import type { ConfigRequirementsReadResponse } from "../../../protocol/generated/v2/ConfigRequirementsReadResponse";
import type { ServiceTier } from "../../../protocol/generated/ServiceTier";
import type { ComposerSlashCapabilitySnapshot } from "../model/composerSlashCommandCatalog";
import { readUserConfigWriteTarget } from "../../settings/config/configWriteTarget";
import { createConversationFromThread } from "../../conversation/model/conversationState";
import type { ComposerPermissionLevel } from "../model/composerPermission";
import type { ComposerCommandBridge } from "./composerCommandBridge";
import type { Dispatch } from "react";
import {
  formatAppSummary,
  formatConfigDebugDetail,
  formatFeatureSummary,
  formatMcpSummary,
  formatPluginSummary,
  formatSkillSummary,
  formatStatusDetail,
} from "./composerSlashCommandSummary";
import {
  listAllApps,
  listAllExperimentalFeatures,
  listAllMcpServerStatuses,
  listAllPlugins,
  refreshSlashConfig,
} from "./composerSlashCommandRequests";
import {
  assertCommandAvailable,
  isRealtimeActive,
  mapAccountSummary,
  parseSandboxMode,
  pushBanner,
  pushThreadNotice,
  toErrorMessage,
} from "./composerSlashCommandShared";
export interface SlashExecutionContext {
  readonly selectedThreadId: string | null;
  readonly selectedRootPath: string | null;
  readonly selectedServiceTier: ServiceTier | null;
  readonly collaborationPreset: CollaborationPreset;
  readonly selectedConversation: ConversationState | null;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly account: AccountSummary | null;
  readonly rateLimits: RateLimitSnapshot | null;
  readonly connectionStatus: ConnectionStatus;
  readonly realtimeState: RealtimeState | null;
  readonly collaborationModes: ReadonlyArray<CollaborationModePreset>;
  readonly taskRunning: boolean;
  readonly capabilities?: ComposerSlashCapabilitySnapshot;
}

export interface SlashExecutionDependencies {
  readonly composerCommandBridge: ComposerCommandBridge;
  readonly dispatch: Dispatch<AppAction>;
  readonly onSelectServiceTier: (serviceTier: ServiceTier | null) => void;
  readonly onSelectPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onLogout: () => Promise<void>;
}
export async function executeDirectSlashCommand(
  commandId: string,
  argumentsText: string,
  context: SlashExecutionContext,
  deps: SlashExecutionDependencies,
): Promise<void> {
  assertCommandAvailable(commandId, context.taskRunning, context.capabilities);
  if (commandId === "init") {
    throw new Error("/init 应通过用户消息链路分发。");
  }
  if (commandId === "fast") return toggleFastMode(argumentsText, context, deps);
  if (commandId === "experimental") return showExperimentalFeatures(deps);
  if (commandId === "skills") return showSkills(context.selectedRootPath, deps);
  if (commandId === "review") return startReview(context.selectedThreadId, argumentsText, deps);
  if (commandId === "rename") return renameThread(context.selectedThreadId, argumentsText, deps);
  if (commandId === "fork") return forkThread(context, deps);
  if (commandId === "compact") return compactThread(context.selectedThreadId, deps);
  if (commandId === "plan") return enablePlanPreset(context.collaborationPreset, argumentsText, deps);
  if (commandId === "status") return showStatus(context, deps);
  if (commandId === "debug-config") return showDebugConfig(deps);
  if (commandId === "mcp") return refreshMcpStatuses(deps);
  if (commandId === "apps") return showApps(context.selectedThreadId, deps);
  if (commandId === "plugins") return showPlugins(context.selectedRootPath, deps);
  if (commandId === "logout") return logout(deps);
  if (commandId === "stop" || commandId === "clean") return cleanBackgroundTerminals(context.selectedThreadId, deps);
  if (commandId === "realtime") return toggleRealtime(argumentsText, context, deps);
  if (commandId === "setup-default-sandbox") return setupDefaultSandbox(argumentsText, deps);
  throw new Error(`未实现的 slash 命令：/${commandId}`);
}
export async function applySlashPermissionLevel(
  level: ComposerPermissionLevel,
  configSnapshot: ConfigReadResponse | null,
  deps: SlashExecutionDependencies,
): Promise<void> {
  const writeTarget = readUserConfigWriteTarget(configSnapshot);
  const approvalPolicy = level === "full" ? "never" : "on-request";
  await deps.composerCommandBridge.request("config/value/write", {
    keyPath: "approval_policy",
    value: approvalPolicy,
    mergeStrategy: "replace",
    filePath: writeTarget.filePath,
    expectedVersion: writeTarget.expectedVersion,
  });
  deps.onSelectPermissionLevel(level);
  await refreshSlashConfig(deps.composerCommandBridge, deps.dispatch);
  pushBanner(deps.dispatch, "info", "已更新审批策略", `当前默认审批策略：${approvalPolicy}`);
}
export async function applySlashPersonality(
  personality: string,
  configSnapshot: ConfigReadResponse | null,
  deps: SlashExecutionDependencies,
): Promise<void> {
  const writeTarget = readUserConfigWriteTarget(configSnapshot);
  await deps.composerCommandBridge.request("config/value/write", {
    keyPath: "personality",
    value: personality,
    mergeStrategy: "replace",
    filePath: writeTarget.filePath,
    expectedVersion: writeTarget.expectedVersion,
  });
  await refreshSlashConfig(deps.composerCommandBridge, deps.dispatch);
  pushBanner(deps.dispatch, "info", "已更新交流风格", `当前风格：${personality}`);
}
export async function resumeSlashThread(
  threadId: string,
  _context: SlashExecutionContext,
  deps: SlashExecutionDependencies,
): Promise<void> {
  const response = (await deps.composerCommandBridge.request("thread/resume", {
    threadId,
    persistExtendedHistory: true,
  })) as ThreadResumeResponse;
  deps.dispatch({ type: "conversation/loaded", conversationId: threadId, thread: response.thread });
  deps.dispatch({ type: "conversation/selected", conversationId: threadId });
  pushThreadNotice(deps.dispatch, threadId, "已恢复线程", response.thread.name ?? response.thread.preview, "info", "thread/resume");
}
function toggleFastMode(argumentsText: string, context: SlashExecutionContext, deps: SlashExecutionDependencies): void {
  const normalized = argumentsText.trim().toLowerCase();
  if (normalized === "status") {
    pushBanner(deps.dispatch, "info", "Fast 模式状态", context.selectedServiceTier === "fast" ? "当前已开启 Fast 模式。" : "当前未开启 Fast 模式。");
    return;
  }
  if (normalized !== "" && normalized !== "on" && normalized !== "off") {
    throw new Error("用法：/fast [on|off|status]");
  }
  const nextTier = normalized === "on"
    ? "fast"
    : normalized === "off"
      ? null
      : context.selectedServiceTier === "fast" ? null : "fast";
  deps.onSelectServiceTier(nextTier);
  pushBanner(
    deps.dispatch,
    "info",
    nextTier === "fast" ? "已开启 Fast 模式" : "已关闭 Fast 模式",
    nextTier === "fast" ? "后续发送将使用 fast service tier。" : "后续发送将恢复自动 service tier。",
  );
}
async function showExperimentalFeatures(deps: SlashExecutionDependencies): Promise<void> {
  const features = await listAllExperimentalFeatures(deps.composerCommandBridge);
  deps.dispatch({ type: "experimentalFeatures/loaded", features });
  pushBanner(deps.dispatch, "info", "实验特性", formatFeatureSummary(features));
}
async function showSkills(selectedRootPath: string | null, deps: SlashExecutionDependencies): Promise<void> {
  const response = (await deps.composerCommandBridge.request("skills/list", {
    cwds: selectedRootPath === null ? undefined : [selectedRootPath],
    forceReload: true,
  })) as SkillsListResponse;
  pushBanner(deps.dispatch, "info", "技能扫描结果", formatSkillSummary(response.data));
}
async function startReview(selectedThreadId: string | null, argumentsText: string, deps: SlashExecutionDependencies): Promise<void> {
  if (selectedThreadId === null) throw new Error("请先打开一个线程。");
  const instructions = argumentsText.trim();
  await deps.composerCommandBridge.request("review/start", {
    threadId: selectedThreadId,
    target: instructions.length === 0 ? { type: "uncommittedChanges" } : { type: "custom", instructions },
    delivery: "inline",
  }) as ReviewStartResponse;
  pushThreadNotice(
    deps.dispatch,
    selectedThreadId,
    "已发起官方 Review",
    instructions.length === 0 ? "结果会通过当前线程时间线返回。" : `自定义说明：${instructions}`,
    "info",
    "review/start",
  );
}
async function renameThread(selectedThreadId: string | null, argumentsText: string, deps: SlashExecutionDependencies): Promise<void> {
  if (selectedThreadId === null) throw new Error("请先打开一个线程。");
  const nextName = argumentsText.trim();
  if (nextName.length === 0) throw new Error("请在命令后输入新的线程标题。");
  await deps.composerCommandBridge.request("thread/name/set", { threadId: selectedThreadId, name: nextName });
  deps.dispatch({ type: "conversation/titleChanged", conversationId: selectedThreadId, title: nextName });
  pushThreadNotice(deps.dispatch, selectedThreadId, "已重命名线程", nextName, "info", "thread/name/set");
}
async function forkThread(context: SlashExecutionContext, deps: SlashExecutionDependencies): Promise<void> {
  if (context.selectedThreadId === null || context.selectedConversation === null) throw new Error("请先打开一个线程。");
  const response = (await deps.composerCommandBridge.request("thread/fork", {
    threadId: context.selectedThreadId,
    persistExtendedHistory: true,
  })) as ThreadForkResponse;
  const conversation = createConversationFromThread(response.thread, {
    hidden: false,
    resumeState: "resumed",
    agentEnvironment: context.selectedConversation.agentEnvironment,
  });
  deps.dispatch({ type: "conversation/upserted", conversation });
  deps.dispatch({ type: "conversation/selected", conversationId: conversation.id });
  pushThreadNotice(deps.dispatch, conversation.id, "已创建分支线程", conversation.title, "info", "thread/fork");
}
async function compactThread(selectedThreadId: string | null, deps: SlashExecutionDependencies): Promise<void> {
  if (selectedThreadId === null) throw new Error("请先打开一个线程。");
  await deps.composerCommandBridge.request("thread/compact/start", { threadId: selectedThreadId });
  pushThreadNotice(deps.dispatch, selectedThreadId, "已发起上下文压缩", "等待官方 compact 通知。", "info", "thread/compact/start");
}
function enablePlanPreset(currentPreset: CollaborationPreset, argumentsText: string, deps: SlashExecutionDependencies): void {
  if (argumentsText.trim().length > 0) {
    throw new Error("当前桌面壳暂不支持 `/plan 提示词` 直接发送，请先执行 /plan，再单独发送消息。");
  }
  if (currentPreset !== "plan") {
    deps.onSelectCollaborationPreset("plan");
  }
  pushBanner(deps.dispatch, "info", "已切换到 Plan 模式", "下一次发送将通过官方 collaboration preset=plan 发起。");
}

async function showStatus(context: SlashExecutionContext, deps: SlashExecutionDependencies): Promise<void> {
  const [accountResponse, limitsResponse, config] = await Promise.all([
    deps.composerCommandBridge.request("account/read", { refreshToken: false }) as Promise<GetAccountResponse>,
    deps.composerCommandBridge.request("account/rateLimits/read", undefined) as Promise<GetAccountRateLimitsResponse>,
    refreshSlashConfig(deps.composerCommandBridge, deps.dispatch),
  ]);
  deps.dispatch({ type: "account/updated", account: mapAccountSummary(accountResponse) });
  deps.dispatch({ type: "rateLimits/updated", rateLimits: limitsResponse.rateLimits });
  pushBanner(deps.dispatch, "info", "当前状态", formatStatusDetail(context.connectionStatus, accountResponse, limitsResponse.rateLimits, config));
}

async function showDebugConfig(deps: SlashExecutionDependencies): Promise<void> {
  const [config, requirementsResponse] = await Promise.all([
    refreshSlashConfig(deps.composerCommandBridge, deps.dispatch),
    deps.composerCommandBridge.request("configRequirements/read", undefined) as Promise<ConfigRequirementsReadResponse>,
  ]);
  pushBanner(deps.dispatch, "info", "配置诊断", formatConfigDebugDetail(config, requirementsResponse));
}

async function refreshMcpStatuses(deps: SlashExecutionDependencies): Promise<void> {
  await deps.composerCommandBridge.request("config/mcpServer/reload", undefined);
  const [statuses, config] = await Promise.all([
    listAllMcpServerStatuses(deps.composerCommandBridge),
    refreshSlashConfig(deps.composerCommandBridge, deps.dispatch),
  ]);
  deps.dispatch({ type: "mcp/statusesLoaded", statuses });
  pushBanner(deps.dispatch, "info", "MCP 状态已刷新", formatMcpSummary(statuses, config));
}

async function showApps(selectedThreadId: string | null, deps: SlashExecutionDependencies): Promise<void> {
  const apps = await listAllApps(deps.composerCommandBridge, selectedThreadId);
  pushBanner(deps.dispatch, "info", "Apps 列表", formatAppSummary(apps));
}

async function showPlugins(selectedRootPath: string | null, deps: SlashExecutionDependencies): Promise<void> {
  const response = await listAllPlugins(deps.composerCommandBridge, selectedRootPath);
  pushBanner(deps.dispatch, "info", "插件市场", formatPluginSummary(response));
}

async function logout(deps: SlashExecutionDependencies): Promise<void> {
  await deps.onLogout();
  pushBanner(deps.dispatch, "info", "已退出当前账号", null);
}

async function cleanBackgroundTerminals(selectedThreadId: string | null, deps: SlashExecutionDependencies): Promise<void> {
  if (selectedThreadId === null) throw new Error("请先打开一个线程。");
  await deps.composerCommandBridge.request("thread/backgroundTerminals/clean", { threadId: selectedThreadId });
  pushThreadNotice(deps.dispatch, selectedThreadId, "已清理后台终端", null, "info", "thread/backgroundTerminals/clean");
}

async function toggleRealtime(argumentsText: string, context: SlashExecutionContext, deps: SlashExecutionDependencies): Promise<void> {
  if (context.selectedThreadId === null) throw new Error("请先打开一个线程。");
  if (isRealtimeActive(context.realtimeState)) {
    await deps.composerCommandBridge.request("thread/realtime/stop", { threadId: context.selectedThreadId });
    pushThreadNotice(deps.dispatch, context.selectedThreadId, "已停止实时会话", null, "info", "thread/realtime/stop");
    return;
  }
  const prompt = argumentsText.trim();
  if (prompt.length === 0) throw new Error("启动实时会话前，请在命令后输入提示词。");
  await deps.composerCommandBridge.request("thread/realtime/start", {
    threadId: context.selectedThreadId,
    outputModality: "text",
    prompt
  });
  pushThreadNotice(deps.dispatch, context.selectedThreadId, "已启动实时会话", prompt, "info", "thread/realtime/start");
}

async function setupDefaultSandbox(argumentsText: string, deps: SlashExecutionDependencies): Promise<void> {
  const mode = parseSandboxMode(argumentsText);
  deps.dispatch({ type: "windowsSandbox/setupStarted", mode });
  try {
    await deps.composerCommandBridge.request("windowsSandbox/setupStart", { mode });
    pushBanner(deps.dispatch, "info", "已发起 Windows Sandbox 配置", `模式：${mode === "elevated" ? "增强模式" : "标准模式"}`);
  } catch (error) {
    deps.dispatch({ type: "windowsSandbox/setupCompleted", mode, success: false, error: toErrorMessage(error) });
    throw error;
  }
}
