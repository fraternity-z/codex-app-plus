import { describe, expect, it } from "vitest";
import {
  appendCommandApprovalPrefix,
  buildCommandApprovalScopeKey,
  extractCommandApprovalCommand,
  extractRememberedCommandPrefix,
  matchesCommandApprovalAllowlist,
} from "./commandApprovalRules";

describe("commandApprovalRules", () => {
  it("extracts command tokens from string commands", () => {
    const result = extractCommandApprovalCommand({
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "Get-ChildItem \"src/features\" -Force",
    });

    expect(result).toEqual({
      preview: "Get-ChildItem src/features -Force",
      tokens: ["Get-ChildItem", "src/features", "-Force"],
    });
  });

  it("prefers the proposed execpolicy amendment when remembering a prefix", () => {
    const prefix = extractRememberedCommandPrefix({
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "Get-Content src/app.ts",
      proposedExecpolicyAmendment: ["Get-ChildItem"],
    });

    expect(prefix).toEqual(["Get-ChildItem"]);
  });

  it("matches longer commands against a remembered prefix", () => {
    const allowlist = appendCommandApprovalPrefix({}, "windowsNative:E:/code/project", [
      "Get-ChildItem",
    ]);

    expect(matchesCommandApprovalAllowlist(
      allowlist,
      "windowsNative:E:/code/project",
      ["Get-ChildItem", "-Force"],
    )).toBe(true);
    expect(matchesCommandApprovalAllowlist(
      allowlist,
      "windowsNative:E:/code/project",
      ["Get-Content", "README.md"],
    )).toBe(false);
  });

  it("keeps Windows path separators when splitting command strings", () => {
    const result = extractCommandApprovalCommand({
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      command: "Get-ChildItem C:\\code\\codex-app-plus",
    });

    expect(result?.tokens).toEqual(["Get-ChildItem", "C:\\code\\codex-app-plus"]);
  });

  it("falls back to a thread scope when cwd is missing", () => {
    const scope = buildCommandApprovalScopeKey("windowsNative", {
      threadId: "thread-1",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
      },
    });

    expect(scope).toBe("windowsNative:thread:thread-1");
  });
});
