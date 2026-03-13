import { describe, expect, it } from "vitest";
import { listComposerSlashCommands } from "./composerSlashCommands";

function listCommandIds(): ReadonlyArray<string> {
  return listComposerSlashCommands("").map((command) => command.id);
}

describe("composerSlashCommands", () => {
  it("includes the latest official slash commands in the palette list", () => {
    expect(listCommandIds()).toEqual(expect.arrayContaining([
      "fast",
      "approvals",
      "setup-default-sandbox",
      "sandbox-add-read-dir",
      "skills",
      "new",
      "resume",
      "fork",
      "plan",
      "collab",
      "agent",
      "copy",
      "debug-config",
      "statusline",
      "theme",
      "apps",
      "quit",
      "exit",
      "feedback",
      "ps",
      "clean",
      "personality",
      "realtime",
      "settings",
      "multi-agents",
      "debug-m-drop",
      "debug-m-update",
    ]));
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
      "terminal-setup",
      "upgrade",
      "vim",
    ]));
  });

  it("keeps wired aliases enabled and marks the rest as unavailable", () => {
    const commands = listComposerSlashCommands("");
    const approvals = commands.find((command) => command.id === "approvals");
    const newThread = commands.find((command) => command.id === "new");
    const skills = commands.find((command) => command.id === "skills");

    expect(approvals?.disabledReason).toBeNull();
    expect(newThread?.disabledReason).toBeNull();
    expect(skills?.disabledReason).toContain("not wired");
  });
});
