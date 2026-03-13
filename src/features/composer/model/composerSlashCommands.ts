export type ComposerSlashAction =
  | "createThread"
  | "toggleDiff"
  | "openMention"
  | "openModel"
  | "openPermissions";

export interface ComposerSlashCommand {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly action: ComposerSlashAction | null;
  readonly disabledReason: string | null;
}

interface ComposerSlashDefinition {
  readonly id: string;
  readonly description: string;
  readonly action: ComposerSlashAction | null;
}

const NOT_WIRED_REASON = "This official command is not wired in Codex App Plus yet.";

const OFFICIAL_COMMANDS: ReadonlyArray<ComposerSlashDefinition> = [
  { id: "model", description: "Choose the model for the next turn.", action: "openModel" },
  { id: "fast", description: "Toggle Fast mode to enable fastest inference at 2X plan usage.", action: null },
  { id: "approvals", description: "Choose command permissions.", action: "openPermissions" },
  { id: "permissions", description: "Choose command permissions.", action: "openPermissions" },
  { id: "setup-default-sandbox", description: "Set up elevated agent sandbox.", action: null },
  { id: "sandbox-add-read-dir", description: "Allow sandbox read access to a directory.", action: null },
  { id: "experimental", description: "Toggle experimental features.", action: null },
  { id: "skills", description: "Use skills to improve how Codex performs specific tasks.", action: null },
  { id: "review", description: "Review current changes and find issues.", action: null },
  { id: "rename", description: "Rename the current thread.", action: null },
  { id: "new", description: "Start a fresh thread draft.", action: "createThread" },
  { id: "resume", description: "Resume a saved chat.", action: null },
  { id: "fork", description: "Fork the current chat.", action: null },
  { id: "init", description: "Generate project instructions.", action: null },
  { id: "compact", description: "Compact thread context.", action: null },
  { id: "plan", description: "Switch to Plan mode.", action: null },
  { id: "collab", description: "Change collaboration mode.", action: null },
  { id: "agent", description: "Switch the active agent thread.", action: null },
  { id: "diff", description: "Toggle the workspace diff sidebar.", action: "toggleDiff" },
  { id: "copy", description: "Copy the latest Codex output to your clipboard.", action: null },
  { id: "mention", description: "Search files and add a file mention.", action: "openMention" },
  { id: "status", description: "Show client and connection status.", action: null },
  { id: "debug-config", description: "Show config layers and requirement sources for debugging.", action: null },
  { id: "statusline", description: "Configure which items appear in the status line.", action: null },
  { id: "theme", description: "Choose a syntax highlighting theme.", action: null },
  { id: "mcp", description: "Inspect MCP servers and tools.", action: null },
  { id: "apps", description: "Manage apps.", action: null },
  { id: "logout", description: "Log out of the current account.", action: null },
  { id: "quit", description: "Exit Codex App Plus.", action: null },
  { id: "exit", description: "Exit Codex App Plus.", action: null },
  { id: "feedback", description: "Send logs to maintainers.", action: null },
  { id: "ps", description: "List background terminals.", action: null },
  { id: "clean", description: "Stop all background terminals.", action: null },
  { id: "clear", description: "Start a fresh thread draft.", action: "createThread" },
  { id: "personality", description: "Choose a communication style for Codex.", action: null },
  { id: "realtime", description: "Toggle realtime voice mode.", action: null },
  { id: "settings", description: "Configure realtime microphone and speaker.", action: null },
  { id: "multi-agents", description: "Switch the active agent thread.", action: null },
  { id: "debug-m-drop", description: "Official debug command. Do not use.", action: null },
  { id: "debug-m-update", description: "Official debug command. Do not use.", action: null },
];

const COMMANDS: ReadonlyArray<ComposerSlashCommand> = OFFICIAL_COMMANDS.map((command) => ({
  id: command.id,
  name: `/${command.id}`,
  description: command.description,
  action: command.action,
  disabledReason: command.action === null ? NOT_WIRED_REASON : null,
}));

export function listComposerSlashCommands(query: string): ReadonlyArray<ComposerSlashCommand> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return COMMANDS;
  }

  return COMMANDS.filter((command) => {
    const haystack = `${command.name} ${command.description}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
