import type { AskForApproval } from "../../../protocol/generated/v2/AskForApproval";
import type { ApprovalsReviewer } from "../../../protocol/generated/v2/ApprovalsReviewer";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type { SandboxPolicy } from "../../../protocol/generated/v2/SandboxPolicy";
import type { ThreadStartParams } from "../../../protocol/generated/v2/ThreadStartParams";
import type { TurnStartParams } from "../../../protocol/generated/v2/TurnStartParams";

export type ComposerPermissionLevel = "default" | "autoReview" | "full";
export type ComposerApprovalPolicy = Extract<AskForApproval, "untrusted" | "on-failure" | "on-request" | "never">;

export interface ComposerPermissionSettings {
  readonly defaultApprovalPolicy: ComposerApprovalPolicy;
  readonly defaultSandboxMode: SandboxMode;
  readonly fullApprovalPolicy: ComposerApprovalPolicy;
  readonly fullSandboxMode: SandboxMode;
}

export const DEFAULT_COMPOSER_PERMISSION_LEVEL: ComposerPermissionLevel = "default";
export const DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY: ComposerApprovalPolicy = "on-request";
export const DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE: SandboxMode = "workspace-write";
export const DEFAULT_COMPOSER_AUTO_REVIEW_APPROVAL_POLICY: ComposerApprovalPolicy = "on-request";
export const DEFAULT_COMPOSER_AUTO_REVIEW_SANDBOX_MODE: SandboxMode = "workspace-write";
export const DEFAULT_COMPOSER_AUTO_REVIEW_APPROVALS_REVIEWER: ApprovalsReviewer = "auto_review";
export const DEFAULT_COMPOSER_USER_APPROVALS_REVIEWER: ApprovalsReviewer = "user";
export const DEFAULT_COMPOSER_FULL_APPROVAL_POLICY: ComposerApprovalPolicy = "never";
export const DEFAULT_COMPOSER_FULL_SANDBOX_MODE: SandboxMode = "danger-full-access";
export const DEFAULT_COMPOSER_PERMISSION_SETTINGS = Object.freeze<ComposerPermissionSettings>({
  defaultApprovalPolicy: DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  defaultSandboxMode: DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  fullApprovalPolicy: DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
  fullSandboxMode: DEFAULT_COMPOSER_FULL_SANDBOX_MODE
});

type ThreadPermissionOverrides = Pick<ThreadStartParams, "approvalPolicy" | "approvalsReviewer" | "sandbox">;
type TurnPermissionOverrides = Pick<TurnStartParams, "approvalPolicy" | "approvalsReviewer" | "sandboxPolicy">;

export function isComposerPermissionLevel(value: unknown): value is ComposerPermissionLevel {
  return value === "default" || value === "autoReview" || value === "full";
}

export function isComposerApprovalPolicy(value: unknown): value is ComposerApprovalPolicy {
  return value === "untrusted" || value === "on-failure" || value === "on-request" || value === "never";
}

function createReadOnlySandboxPolicy(): SandboxPolicy {
  return {
    type: "readOnly",
    networkAccess: false
  };
}

function createWorkspaceWriteSandboxPolicy(): SandboxPolicy {
  return {
    type: "workspaceWrite",
    writableRoots: [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}

function createSandboxPolicy(mode: SandboxMode): SandboxPolicy {
  if (mode === "read-only") {
    return createReadOnlySandboxPolicy();
  }
  if (mode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  return createWorkspaceWriteSandboxPolicy();
}

function resolveComposerPermissionValues(
  level: ComposerPermissionLevel,
  settings: ComposerPermissionSettings
): {
  readonly approvalPolicy: ComposerApprovalPolicy;
  readonly approvalsReviewer: ApprovalsReviewer;
  readonly sandboxMode: SandboxMode;
} {
  if (level === "full") {
    return {
      approvalPolicy: DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
      approvalsReviewer: DEFAULT_COMPOSER_USER_APPROVALS_REVIEWER,
      sandboxMode: DEFAULT_COMPOSER_FULL_SANDBOX_MODE
    };
  }
  if (level === "autoReview") {
    return {
      approvalPolicy: DEFAULT_COMPOSER_AUTO_REVIEW_APPROVAL_POLICY,
      approvalsReviewer: DEFAULT_COMPOSER_AUTO_REVIEW_APPROVALS_REVIEWER,
      sandboxMode: DEFAULT_COMPOSER_AUTO_REVIEW_SANDBOX_MODE
    };
  }
  return {
    approvalPolicy: settings.defaultApprovalPolicy,
    approvalsReviewer: DEFAULT_COMPOSER_USER_APPROVALS_REVIEWER,
    sandboxMode: settings.defaultSandboxMode
  };
}

export function createThreadPermissionOverrides(
  level: ComposerPermissionLevel,
  settings: ComposerPermissionSettings = DEFAULT_COMPOSER_PERMISSION_SETTINGS
): ThreadPermissionOverrides {
  const values = resolveComposerPermissionValues(level, settings);
  return {
    approvalPolicy: values.approvalPolicy,
    approvalsReviewer: values.approvalsReviewer,
    sandbox: values.sandboxMode
  };
}

export function createTurnPermissionOverrides(
  level: ComposerPermissionLevel,
  settings: ComposerPermissionSettings = DEFAULT_COMPOSER_PERMISSION_SETTINGS
): TurnPermissionOverrides {
  const values = resolveComposerPermissionValues(level, settings);
  return {
    approvalPolicy: values.approvalPolicy,
    approvalsReviewer: values.approvalsReviewer,
    sandboxPolicy: createSandboxPolicy(values.sandboxMode)
  };
}
