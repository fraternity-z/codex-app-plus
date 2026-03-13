import { describe, expect, it } from "vitest";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
  DEFAULT_COMPOSER_PERMISSION_LEVEL,
  isComposerPermissionLevel,
} from "./composerPermission";

describe("composerPermission", () => {
  it("uses default permission level by default", () => {
    expect(DEFAULT_COMPOSER_PERMISSION_LEVEL).toBe("default");
  });

  it("recognizes supported permission levels", () => {
    expect(isComposerPermissionLevel("default")).toBe(true);
    expect(isComposerPermissionLevel("full")).toBe(true);
    expect(isComposerPermissionLevel("other")).toBe(false);
  });

  it("maps default thread permissions to workspace-write with approval", () => {
    expect(createThreadPermissionOverrides("default")).toEqual({
      approvalPolicy: "on-request",
      sandbox: "workspace-write"
    });
  });

  it("maps full thread permissions to danger-full-access without approval", () => {
    expect(createThreadPermissionOverrides("full")).toEqual({
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    });
  });

  it("maps default turn permissions to workspace-write sandbox policy", () => {
    expect(createTurnPermissionOverrides("default")).toEqual({
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        readOnlyAccess: { type: "restricted", includePlatformDefaults: true, readableRoots: [] },
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      }
    });
  });

  it("maps full turn permissions to danger-full-access sandbox policy", () => {
    expect(createTurnPermissionOverrides("full")).toEqual({
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" }
    });
  });
});
