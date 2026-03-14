export type ComposerSlashAction =
  | "createThread"
  | "toggleDiff"
  | "openMention"
  | "openModel"
  | "openPermissions"
  | "openCollaboration"
  | "openResume";

export type ComposerSlashCommandFlavor = "official" | "local";

export interface ComposerSlashCommand {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly flavor: ComposerSlashCommandFlavor;
  readonly action: ComposerSlashAction | null;
  readonly disabledReason: string | null;
  readonly metaLabel: string;
}

interface ComposerSlashDefinition {
  readonly id: string;
  readonly description: string;
  readonly flavor: ComposerSlashCommandFlavor;
  readonly action: ComposerSlashAction | null;
  readonly officialUnavailableReason?: string;
  readonly requiresThread?: boolean;
  readonly requiresWorkspace?: boolean;
  readonly requiresArguments?: boolean;
  readonly argumentHint?: string;
}

export interface ComposerSlashQuery {
  readonly raw: string;
  readonly search: string;
  readonly commandId: string | null;
  readonly argumentsText: string;
}

export interface ComposerSlashCommandContext {
  readonly hasThread: boolean;
  readonly hasWorkspace: boolean;
  readonly realtimeActive: boolean;
}

const OFFICIAL_UNAVAILABLE_REASON = "当前 app-server 协议未暴露这条命令的官方链路。";
const MISSING_THREAD_REASON = "请先打开一个线程。";
const MISSING_WORKSPACE_REASON = "请先选择工作区。";
const RENAME_ARGUMENT_HINT = "请在命令后输入新的线程标题，例如 /rename 修复 slash 命令。";
const REALTIME_ARGUMENT_HINT = "启动实时模式前，请在命令后输入提示词，例如 /realtime 帮我讲解当前改动。";

const COMMANDS = Object.freeze<ReadonlyArray<ComposerSlashDefinition>>([
  { id: "model", description: "选择下一轮使用的模型。", flavor: "official", action: "openModel" },
  { id: "fast", description: "切换 Fast service tier。", flavor: "official", action: null },
  { id: "approvals", description: "配置命令审批策略。", flavor: "official", action: "openPermissions" },
  { id: "permissions", description: "配置命令审批策略。", flavor: "official", action: "openPermissions" },
  { id: "setup-default-sandbox", description: "设置默认 Windows Sandbox。", flavor: "official", action: null },
  { id: "sandbox-add-read-dir", description: "为 sandbox 增加额外只读目录。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "experimental", description: "查看实验特性状态。", flavor: "official", action: null },
  { id: "skills", description: "查看当前工作区可用技能。", flavor: "official", action: null },
  { id: "review", description: "对当前未提交改动发起官方 review。", flavor: "official", action: null, requiresThread: true },
  { id: "rename", description: "重命名当前线程。", flavor: "official", action: null, requiresThread: true, requiresArguments: true, argumentHint: RENAME_ARGUMENT_HINT },
  { id: "new", description: "开始一个新的本地草稿线程。", flavor: "local", action: "createThread" },
  { id: "resume", description: "恢复一个已存在的线程。", flavor: "official", action: "openResume" },
  { id: "fork", description: "从当前线程创建分支线程。", flavor: "official", action: null, requiresThread: true },
  { id: "init", description: "生成项目指令。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "compact", description: "压缩当前线程上下文。", flavor: "official", action: null, requiresThread: true },
  { id: "plan", description: "切换到 Plan collaboration preset。", flavor: "official", action: null },
  { id: "collab", description: "选择 collaboration preset。", flavor: "official", action: "openCollaboration" },
  { id: "agent", description: "切换活动 agent 线程。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "diff", description: "切换本地工作区 diff 侧边栏。", flavor: "local", action: "toggleDiff", requiresWorkspace: true },
  { id: "copy", description: "复制最新输出。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "mention", description: "切换到 @ 文件提及。", flavor: "local", action: "openMention", requiresWorkspace: true },
  { id: "status", description: "读取当前连接、账号与配置状态。", flavor: "official", action: null },
  { id: "debug-config", description: "查看配置层与 requirements 摘要。", flavor: "official", action: null },
  { id: "statusline", description: "配置状态栏。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "theme", description: "配置主题。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "mcp", description: "刷新并查看 MCP 服务状态。", flavor: "official", action: null },
  { id: "apps", description: "查看可用 apps。", flavor: "official", action: null },
  { id: "logout", description: "退出当前账号。", flavor: "official", action: null },
  { id: "quit", description: "退出应用。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "exit", description: "退出应用。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "feedback", description: "上传反馈日志。", flavor: "official", action: null, officialUnavailableReason: "当前协议缺少稳定的反馈分类约定，先保持不可用。" },
  { id: "ps", description: "查看后台终端列表。", flavor: "official", action: null, officialUnavailableReason: "当前协议只提供 clean，没有官方 list 能力。" },
  { id: "clean", description: "清理当前线程的后台终端。", flavor: "official", action: null, requiresThread: true },
  { id: "clear", description: "清空当前输入并开始新的本地草稿线程。", flavor: "local", action: "createThread" },
  { id: "personality", description: "配置 personality。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "realtime", description: "启动或停止实时会话。", flavor: "official", action: null, requiresThread: true, requiresArguments: true, argumentHint: REALTIME_ARGUMENT_HINT },
  { id: "settings", description: "配置实时音频设置。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "multi-agents", description: "切换活动 agent 线程。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "debug-m-drop", description: "官方调试命令，请勿使用。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
  { id: "debug-m-update", description: "官方调试命令，请勿使用。", flavor: "official", action: null, officialUnavailableReason: OFFICIAL_UNAVAILABLE_REASON },
]);

export function parseComposerSlashQuery(query: string): ComposerSlashQuery {
  const trimmed = query.trim();
  const separator = trimmed.indexOf(" ");
  if (separator === -1) {
    return { raw: query, search: trimmed.toLowerCase(), commandId: trimmed.length === 0 ? null : trimmed.toLowerCase(), argumentsText: "" };
  }
  const commandId = trimmed.slice(0, separator).toLowerCase();
  const argumentsText = trimmed.slice(separator + 1).trim();
  return { raw: query, search: trimmed.toLowerCase(), commandId, argumentsText };
}

export function findComposerSlashCommand(id: string): ComposerSlashCommand | null {
  const match = listComposerSlashCommands(id, { hasThread: true, hasWorkspace: true, realtimeActive: false })
    .find((command) => command.id === id);
  return match ?? null;
}

export function listComposerSlashCommands(
  query: string,
  context: ComposerSlashCommandContext,
): ReadonlyArray<ComposerSlashCommand> {
  const parsed = parseComposerSlashQuery(query);
  const filtered = selectDefinitions(parsed);
  return filtered.map((command) => createSlashCommand(command, parsed, context));
}

function selectDefinitions(parsed: ComposerSlashQuery): ReadonlyArray<ComposerSlashDefinition> {
  if (parsed.commandId !== null && parsed.argumentsText.length > 0) {
    const exact = COMMANDS.find((command) => command.id === parsed.commandId) ?? null;
    return exact === null ? filterDefinitions(parsed.search) : [exact];
  }
  return filterDefinitions(parsed.search);
}

function filterDefinitions(search: string): ReadonlyArray<ComposerSlashDefinition> {
  if (search.length === 0) {
    return COMMANDS;
  }
  return COMMANDS.filter((command) => `${command.id} ${command.description}`.toLowerCase().includes(search));
}

function createSlashCommand(
  command: ComposerSlashDefinition,
  parsed: ComposerSlashQuery,
  context: ComposerSlashCommandContext,
): ComposerSlashCommand {
  return {
    id: command.id,
    name: `/${command.id}`,
    description: command.description,
    flavor: command.flavor,
    action: command.action,
    disabledReason: resolveDisabledReason(command, parsed, context),
    metaLabel: resolveMetaLabel(command),
  };
}

function resolveDisabledReason(
  command: ComposerSlashDefinition,
  parsed: ComposerSlashQuery,
  context: ComposerSlashCommandContext,
): string | null {
  if (command.officialUnavailableReason !== undefined) {
    return command.officialUnavailableReason;
  }
  if (command.requiresThread === true && !context.hasThread) {
    return MISSING_THREAD_REASON;
  }
  if (command.requiresWorkspace === true && !context.hasWorkspace) {
    return MISSING_WORKSPACE_REASON;
  }
  if (command.id === "realtime" && context.realtimeActive) {
    return null;
  }
  if (command.requiresArguments === true && parsed.commandId === command.id && parsed.argumentsText.length === 0) {
    return command.argumentHint ?? "请在命令后补充参数。";
  }
  return null;
}

function resolveMetaLabel(command: ComposerSlashDefinition): string {
  if (command.officialUnavailableReason !== undefined) {
    return "Unavailable";
  }
  return command.flavor === "local" ? "Local" : "Official";
}
