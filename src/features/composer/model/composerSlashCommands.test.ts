import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSER_SLASH_CAPABILITIES } from "./composerSlashCommandCatalog";
import { listComposerSlashCommands } from "./composerSlashCommands";

function listCommandIds(): ReadonlyArray<string> {
  return listComposerSlashCommands("", {
    hasThread: true,
    hasWorkspace: true,
    realtimeActive: false,
    taskRunning: false,
    capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
  }).map((command) => command.id);
}

describe("composerSlashCommands", () => {
  it("matches the latest official command list and order", () => {
    const expected = [
      "model",
      "fast",
      "approvals",
      "permissions",
      "setup-default-sandbox",
      "sandbox-add-read-dir",
      "experimental",
      "skills",
      "review",
      "rename",
      "new",
      "resume",
      "fork",
      "init",
      "compact",
      "plan",
      "collab",
      "agent",
      "diff",
      "copy",
      "mention",
      "status",
      "debug-config",
      "title",
      "statusline",
      "mcp",
      "apps",
      "plugins",
      "logout",
      "quit",
      "exit",
      "feedback",
      "ps",
      "stop",
      "clear",
      "personality",
      "realtime",
      "settings",
      "subagents",
      "debug-m-drop",
      "debug-m-update",
    ];
    if (import.meta.env.DEV) {
      expected.splice(expected.indexOf("feedback") + 1, 0, "rollout");
      expected.splice(expected.indexOf("settings") + 1, 0, "test-approval");
    }
    expect(listCommandIds()).toEqual(expected);
  });

  it("drops stale commands that are not in the latest official package", () => {
    expect(listCommandIds()).not.toEqual(expect.arrayContaining([
      "config",
      "cost",
      "doctor",
      "help",
      "history",
      "login",
      "memory",
      "multi-agents",
      "theme",
      "terminal-setup",
      "upgrade",
      "vim",
    ]));
  });

  it("maps /clean to the canonical /stop command", () => {
    const alias = listComposerSlashCommands("clean", {
      hasThread: true,
      hasWorkspace: true,
      realtimeActive: false,
      taskRunning: false,
      capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
    })[0];
    expect(alias).toMatchObject({
      id: "stop",
      name: "/stop",
      metaLabel: "Alias",
      disabledReason: null,
    });
  });

  it("disables task-blocked commands while a turn is running", () => {
    const busyContext = {
      hasThread: true,
      hasWorkspace: true,
      realtimeActive: false,
      taskRunning: true,
      capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
    } as const;
    const createThread = listComposerSlashCommands("new", busyContext)[0];
    const stop = listComposerSlashCommands("stop", busyContext)[0];

    expect(createThread?.disabledReason).toContain("任务正在执行");
    expect(stop?.disabledReason).toBeNull();
  });

  it("requires arguments for rename and realtime start, and blocks inline /plan prompts", () => {
    const context = {
      hasThread: true,
      hasWorkspace: true,
      realtimeActive: false,
      taskRunning: false,
      capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
    } as const;
    const rename = listComposerSlashCommands("rename", context)[0];
    const realtime = listComposerSlashCommands("realtime", context)[0];
    const plan = listComposerSlashCommands("plan 调研这个仓库", context)[0];

    expect(rename?.disabledReason).toContain("新的线程标题");
    expect(realtime?.disabledReason).toContain("提示词");
    expect(plan?.disabledReason).toContain("/plan");
  });

  it("requires a workspace before /init becomes available", () => {
    const init = listComposerSlashCommands("init", {
      hasThread: true,
      hasWorkspace: false,
      realtimeActive: false,
      taskRunning: false,
      capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
    })[0];

    expect(init).toMatchObject({
      id: "init",
      name: "/init",
    });
    expect(init?.disabledReason).toContain("请先选择工作区");
  });

  it("does not return /theme after the command is removed", () => {
    const results = listComposerSlashCommands("theme", {
      hasThread: true,
      hasWorkspace: true,
      realtimeActive: false,
      taskRunning: false,
      capabilities: DEFAULT_COMPOSER_SLASH_CAPABILITIES,
    });

    expect(results).toEqual([]);
  });
});
