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
    expect(isComposerPermissionLevel("autoReview")).toBe(true);
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

  it("lets default thread permissions come from config.toml", () => {
    expect(createThreadPermissionOverrides("default", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({});
  });

  it("maps auto-review thread permissions to auto reviewer only", () => {
    expect(createThreadPermissionOverrides("autoReview", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review"
    });
  });

  it("maps full thread permissions to danger-full-access without approval", () => {
    expect(createThreadPermissionOverrides("full", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: "danger-full-access"
    });
  });

  it("lets default turn permissions come from config.toml", () => {
    expect(createTurnPermissionOverrides("default", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({});
  });

  it("maps full turn permissions to danger-full-access sandbox policy", () => {
    expect(createTurnPermissionOverrides("full", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandboxPolicy: { type: "dangerFullAccess" }
    });
  });

  it("maps auto-review turn permissions to auto reviewer only", () => {
    expect(createTurnPermissionOverrides("autoReview", DEFAULT_COMPOSER_PERMISSION_SETTINGS)).toEqual({
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review"
    });
  });

  it("ignores legacy default permission settings in favor of config.toml", () => {
    expect(createThreadPermissionOverrides("default", {
      defaultApprovalPolicy: "on-failure",
      defaultSandboxMode: "read-only",
      fullApprovalPolicy: "never",
      fullSandboxMode: "danger-full-access"
    })).toEqual({});
    expect(createTurnPermissionOverrides("default", {
      defaultApprovalPolicy: "on-failure",
      defaultSandboxMode: "read-only",
      fullApprovalPolicy: "never",
      fullSandboxMode: "danger-full-access"
    })).toEqual({});
  });

  it("keeps full permission fixed even when settings contain overrides", () => {
    expect(createThreadPermissionOverrides("full", {
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      fullApprovalPolicy: "untrusted",
      fullSandboxMode: "workspace-write"
    })).toEqual({
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: "danger-full-access"
    });
    expect(createTurnPermissionOverrides("full", {
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      fullApprovalPolicy: "untrusted",
      fullSandboxMode: "workspace-write"
    })).toEqual({
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandboxPolicy: { type: "dangerFullAccess" }
    });
  });
});
