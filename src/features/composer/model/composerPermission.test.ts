import { describe, expect, it } from "vitest";
import {
  createThreadPermissionOverrides,
  createTurnPermissionOverrides,
  DEFAULT_COMPOSER_PERMISSION_SETTINGS,
  isComposerApprovalPolicy,
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

  it("recognizes supported approval policies", () => {
    expect(isComposerApprovalPolicy("untrusted")).toBe(true);
    expect(isComposerApprovalPolicy("on-failure")).toBe(true);
    expect(isComposerApprovalPolicy("on-request")).toBe(true);
    expect(isComposerApprovalPolicy("never")).toBe(true);
    expect(isComposerApprovalPolicy("other")).toBe(false);
  });

  it("maps default thread permissions to workspace-write with approval", () => {
    expect(createThreadPermissionOverrides("default", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "on-request",
      sandbox: "workspace-write"
    });
  });

  it("maps full thread permissions to danger-full-access without approval", () => {
    expect(createThreadPermissionOverrides("full", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    });
  });

  it("maps default turn permissions to workspace-write sandbox policy", () => {
    expect(createTurnPermissionOverrides("default", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      }
    });
  });

  it("maps full turn permissions to danger-full-access sandbox policy", () => {
    expect(createTurnPermissionOverrides("full", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" }
    });
  });

  it("maps default permission to on-failure + read-only when configured", () => {
    expect(createThreadPermissionOverrides("default", {
      defaultApprovalPolicy: "on-failure",
      defaultSandboxMode: "read-only",
      fullApprovalPolicy: "never",
      fullSandboxMode: "danger-full-access"
    })).toEqual({
      approvalPolicy: "on-failure",
      sandbox: "read-only"
    });
    expect(createTurnPermissionOverrides("default", {
      defaultApprovalPolicy: "on-failure",
      defaultSandboxMode: "read-only",
      fullApprovalPolicy: "never",
      fullSandboxMode: "danger-full-access"
    })).toEqual({
      approvalPolicy: "on-failure",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false
      }
    });
  });

  it("keeps full permission fixed even when settings contain overrides", () => {
    expect(createThreadPermissionOverrides("full", {
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      fullApprovalPolicy: "untrusted",
      fullSandboxMode: "workspace-write"
    })).toEqual({
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    });
    expect(createTurnPermissionOverrides("full", {
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      fullApprovalPolicy: "untrusted",
      fullSandboxMode: "workspace-write"
    })).toEqual({
      approvalPolicy: "never",
      sandboxPolicy: { type: "dangerFullAccess" }
    });
  });
});
