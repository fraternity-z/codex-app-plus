export type ComposerSlashAction =
  | "createThread"
  | "toggleDiff"
  | "openMention"
  | "openModel"
  | "openPermissions"
  | "openCollaboration"
  | "openResume";

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
  readonly visibilityGate?: "collaboration" | "apps" | "plugins" | "fast" | "realtime" | "sandbox";
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

const COMMANDS = Object.freeze<ReadonlyArray<ComposerSlashDefinition>>([
  { id: "model", description: "选择模型与推理强度。", flavor: "official", executionKind: "picker", action: "openModel", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "fast", description: "切换 Fast 模式。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: true, visibilityGate: "fast" },
  { id: "approvals", description: "选择 Codex 的权限级别。", flavor: "official", executionKind: "picker", action: "openPermissions", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "permissions", description: "选择 Codex 的权限级别。", flavor: "official", executionKind: "picker", action: "openPermissions", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "setup-default-sandbox", description: "设置默认 Windows Sandbox。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, visibilityGate: "sandbox" },
  { id: "sandbox-add-read-dir", description: "为 sandbox 增加只读目录。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: true, unavailableReason: "当前桌面壳还没有为 Windows Sandbox 增加只读目录的授权流程。", visibilityGate: "sandbox" },
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
  { id: "agent", description: "切换活动 agent 线程。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有活动 agent 线程切换器。" },
  { id: "diff", description: "显示当前工作区 diff。", flavor: "official", executionKind: "local", action: "toggleDiff", aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresWorkspace: true },
  { id: "copy", description: "复制最近一次输出。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有接入复制最近输出的命令链路。" },
  { id: "mention", description: "提及一个文件。", flavor: "official", executionKind: "local", action: "openMention", aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresWorkspace: true },
  { id: "status", description: "查看当前会话配置与 token 使用情况。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "debug-config", description: "查看配置层与来源。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "title", description: "配置终端标题显示项。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有终端标题配置面板。" },
  { id: "statusline", description: "配置状态栏显示项。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有状态栏配置面板。" },
  { id: "mcp", description: "查看 MCP 服务状态。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false },
  { id: "apps", description: "查看可用 apps。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, visibilityGate: "apps" },
  { id: "plugins", description: "浏览插件市场。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, visibilityGate: "plugins" },
  { id: "logout", description: "退出当前账号。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "quit", description: "退出 Codex。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳不支持通过 slash 直接退出应用。" },
  { id: "exit", description: "退出 Codex。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳不支持通过 slash 直接退出应用。" },
  { id: "feedback", description: "上传反馈日志。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有反馈日志提交流程。" },
  { id: "rollout", description: "显示当前 rollout 文件路径。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳没有 rollout 路径展示入口。", debugOnly: true },
  { id: "ps", description: "列出后台终端。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前协议只暴露了清理后台终端能力，还没有官方列表接口。" },
  { id: "stop", description: "停止当前线程的后台终端。", flavor: "official", executionKind: "direct", action: null, aliases: ["clean"], availableDuringTask: true, supportsInlineArgs: false, requiresThread: true },
  { id: "clear", description: "清空输入并开始新的聊天。", flavor: "official", executionKind: "local", action: "createThread", aliases: [], availableDuringTask: false, supportsInlineArgs: false },
  { id: "personality", description: "选择交流风格。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有 personality 配置入口。" },
  { id: "realtime", description: "切换实时语音模式。", flavor: "official", executionKind: "direct", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, requiresThread: true, requiresArguments: true, argumentHint: "启动实时模式前，请在命令后输入提示词，例如 /realtime 帮我讲解当前改动。", visibilityGate: "realtime" },
  { id: "settings", description: "配置实时麦克风与扬声器。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有实时音频设置面板。" },
  { id: "test-approval", description: "触发一次审批测试。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有审批测试入口。", debugOnly: true },
  { id: "subagents", description: "切换活动 agent 线程。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: true, supportsInlineArgs: false, unavailableReason: "当前桌面壳还没有活动 agent 线程切换器。" },
  { id: "debug-m-drop", description: "官方调试命令，请勿使用。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: "官方调试命令，请勿使用。" },
  { id: "debug-m-update", description: "官方调试命令，请勿使用。", flavor: "official", executionKind: "unavailable", action: null, aliases: [], availableDuringTask: false, supportsInlineArgs: false, unavailableReason: "官方调试命令，请勿使用。" },
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
  return true;
}
