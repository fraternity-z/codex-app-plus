export type ComposerSlashAction =
  | "createThread"
  | "toggleDiff"
  | "openMention"
  | "openModel"
  | "openPermissions"
  | "openCollaboration"
  | "openResume"
  | "openPersonality";

export type ComposerSlashCommandFlavor = "official" | "local";
export type ComposerSlashExecutionKind = "direct" | "picker" | "local" | "unavailable";

export interface ComposerSlashCapabilitySnapshot {
  readonly collaborationModesEnabled: boolean;
  readonly connectorsEnabled: boolean;
  readonly pluginsCommandEnabled: boolean;
  readonly fastCommandEnabled: boolean;
  readonly personalityCommandEnabled: boolean;
  readonly realtimeConversationEnabled: boolean;
  readonly audioDeviceSelectionEnabled: boolean;
  readonly allowElevateSandbox: boolean;
}

export interface ComposerSlashDefinition {
  readonly id: string;
  readonly description: string;
  readonly flavor: ComposerSlashCommandFlavor;
  readonly executionKind: ComposerSlashExecutionKind;
  readonly action: ComposerSlashAction | null;
  readonly aliases: ReadonlyArray<string>;
  readonly availableDuringTask: boolean;
  readonly supportsInlineArgs: boolean;
  readonly requiresThread?: boolean;
  readonly requiresWorkspace?: boolean;
  readonly requiresArguments?: boolean;
  readonly argumentHint?: string;
  readonly unavailableReason?: string;
  readonly inlineArgsDisabledReason?: string;
  readonly visibilityGate?: "collaboration" | "apps" | "plugins" | "fast" | "realtime" | "sandbox" | "personality";
  readonly debugOnly?: boolean;
}

export const DEFAULT_COMPOSER_SLASH_CAPABILITIES: ComposerSlashCapabilitySnapshot = Object.freeze({
  collaborationModesEnabled: true,
  connectorsEnabled: true,
  pluginsCommandEnabled: true,
  fastCommandEnabled: true,
  personalityCommandEnabled: true,
  realtimeConversationEnabled: true,
  audioDeviceSelectionEnabled: false,
  allowElevateSandbox: true,
});

const PLAN_INLINE_ARGS_DISABLED_REASON = "当前桌面壳暂不支持 `/plan 提示词` 直接发送，请先执行 /plan，再单独发送消息。";
const UNIMPLEMENTED_OFFICIAL_REASON = "当前桌面壳尚未实现这条官方命令。";

const COMMANDS = Object.freeze<ReadonlyArray<ComposerSlashDefinition>>([
  { id: "model", description: "选择模型与推理强度。", flavor: "official", executionKind: "picker", action: "openModel", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "fast", description: "切换 Fast 模式。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: true, visibilityGate: "fast" },
  { id: "approvals", description: "选择 Codex 的权限级别。", flavor: "official", executionKind: "picker", action: "openPermissions", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "permissions", description: "选择 Codex 的权限级别。", flavor: "official", executionKind: "picker", action: "openPermissions", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "setup-default-sandbox", description: "设置默认 Windows Sandbox。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, visibilityGate: "sandbox" },
  { id: "sandbox-add-read-dir", description: "向沙盒添加只读目录。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "experimental", description: "查看实验特性状态。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "skills", description: "查看当前工作区可用技能。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "review", description: "对当前改动发起官方 Review。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: true, requiresThread: true },
  { id: "rename", description: "重命名当前线程。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: true, requiresThread: true, requiresArguments: true, argumentHint: "请在命令后输入新的线程标题，例如 /rename 修复 slash 命令。" },
  { id: "new", description: "开始一个新的聊天。", flavor: "official", executionKind: "local", action: "createThread", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "resume", description: "恢复一个已保存的线程。", flavor: "official", executionKind: "picker", action: "openResume", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "fork", description: "从当前线程创建分支线程。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, requiresThread: true },
  { id: "init", description: "初始化当前工作区的 AGENTS.md。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, requiresWorkspace: true },
  { id: "compact", description: "压缩当前线程上下文。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, requiresThread: true },
  { id: "plan", description: "切换到 Plan collaboration preset。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: true, visibilityGate: "collaboration", inlineArgsDisabledReason: PLAN_INLINE_ARGS_DISABLED_REASON },
  { id: "collab", description: "选择 collaboration mode。", flavor: "official", executionKind: "picker", action: "openCollaboration", aliases: [], availableDuringTask: true, supportsInlineArgs: false, visibilityGate: "collaboration" },
  { id: "agent", description: "管理当前 agent。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "diff", description: "显示当前工作区 diff。", flavor: "official", executionKind: "local", action: "toggleDiff", aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresWorkspace: true },
  { id: "copy", description: "复制当前内容。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "mention", description: "提及一个文件。", flavor: "official", executionKind: "local", action: "openMention", aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresWorkspace: true },
  { id: "status", description: "查看当前会话配置与 token 使用情况。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "debug-config", description: "查看配置层与来源。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "title", description: "设置或查看线程标题。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "statusline", description: "配置 statusline。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "mcp", description: "查看 MCP 服务状态。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "apps", description: "查看可用 apps。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, visibilityGate: "apps" },
  { id: "plugins", description: "浏览插件市场。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, visibilityGate: "plugins" },
  { id: "logout", description: "退出当前账号。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "quit", description: "退出应用。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "exit", description: "退出应用。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "feedback", description: "发送反馈。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "rollout", description: "查看 rollout 信息。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON, debugOnly: true },
  { id: "ps", description: "查看运行中的进程。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "stop", description: "停止当前线程的后台终端。", flavor: "official", executionKind: "direct", action: null, aliases: ["clean"], availableDuringTask: true, supportsInlineArgs: false, requiresThread: true },
  { id: "clear", description: "清空输入并开始新的聊天。", flavor: "official", executionKind: "local", action: "createThread", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "personality", description: "选择交流风格。", flavor: "official", executionKind: "picker", action: "openPersonality", aliases: [], availableDuringTask: false, supportsInlineArgs: false, visibilityGate: "personality" },
  { id: "realtime", description: "切换实时语音模式。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresThread: true, requiresArguments: true, argumentHint: "启动实时模式前，请在命令后输入提示词，例如 /realtime 帮我讲解当前改动。", visibilityGate: "realtime" },
  { id: "settings", description: "打开设置。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON },
  { id: "test-approval", description: "测试审批流程。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: UNIMPLEMENTED_OFFICIAL_REASON, debugOnly: true },
  { id: "subagents", description: "切换活动 agent 线程。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有活动 agent 线程切换器。" },
]);

const ALIAS_TO_ID = new Map(
  COMMANDS.flatMap((command) => command.aliases.map((alias) => [alias, command.id] as const)),
);

export function canonicalizeComposerSlashCommand(commandId: string): { readonly commandId: string | null; readonly alias: string | null } {
  const normalized = commandId.trim().toLowerCase();
  if (normalized.length === 0) {
    return { commandId: null, alias: null };
  }
  const exact = COMMANDS.find((command) => command.id === normalized);
  if (exact !== undefined) {
    return { commandId: exact.id, alias: null };
  }
  const alias = ALIAS_TO_ID.get(normalized) ?? null;
  return { commandId: alias, alias: alias === null ? null : normalized };
}

export function listComposerSlashDefinitions(
  capabilities: ComposerSlashCapabilitySnapshot,
): ReadonlyArray<ComposerSlashDefinition> {
  return COMMANDS.filter((command) => isCommandVisible(command, capabilities));
}

export function findComposerSlashDefinition(
  commandId: string,
  capabilities: ComposerSlashCapabilitySnapshot = DEFAULT_COMPOSER_SLASH_CAPABILITIES,
): ComposerSlashDefinition | null {
  return listComposerSlashDefinitions(capabilities).find((command) => command.id === commandId) ?? null;
}

export function isComposerSlashCommandAllowedDuringTask(
  commandId: string,
  capabilities: ComposerSlashCapabilitySnapshot = DEFAULT_COMPOSER_SLASH_CAPABILITIES,
): boolean {
  return findComposerSlashDefinition(commandId, capabilities)?.availableDuringTask ?? true;
}

function isCommandVisible(
  command: ComposerSlashDefinition,
  capabilities: ComposerSlashCapabilitySnapshot,
): boolean {
  if (command.debugOnly === true && !import.meta.env.DEV) {
    return false;
  }
  if (command.visibilityGate === "collaboration") {
    return capabilities.collaborationModesEnabled;
  }
  if (command.visibilityGate === "apps") {
    return capabilities.connectorsEnabled;
  }
  if (command.visibilityGate === "plugins") {
    return capabilities.pluginsCommandEnabled;
  }
  if (command.visibilityGate === "fast") {
    return capabilities.fastCommandEnabled;
  }
  if (command.visibilityGate === "realtime") {
    return capabilities.realtimeConversationEnabled;
  }
  if (command.visibilityGate === "sandbox") {
    return capabilities.allowElevateSandbox;
  }
  if (command.visibilityGate === "personality") {
    return capabilities.personalityCommandEnabled;
  }
  return true;
}
