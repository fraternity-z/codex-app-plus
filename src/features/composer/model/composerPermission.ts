import type { AskForApproval } from "../../../protocol/generated/v2/AskForApproval";
import type { ReadOnlyAccess } from "../../../protocol/generated/v2/ReadOnlyAccess";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type { SandboxPolicy } from "../../../protocol/generated/v2/SandboxPolicy";
import type { ThreadStartParams } from "../../../protocol/generated/v2/ThreadStartParams";
import type { TurnStartParams } from "../../../protocol/generated/v2/TurnStartParams";

export type ComposerPermissionLevel = "default" | "full";
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
export const DEFAULT_COMPOSER_FULL_APPROVAL_POLICY: ComposerApprovalPolicy = "never";
export const DEFAULT_COMPOSER_FULL_SANDBOX_MODE: SandboxMode = "danger-full-access";
export const DEFAULT_COMPOSER_PERMISSION_SETTINGS = Object.freeze<ComposerPermissionSettings>({
  defaultApprovalPolicy: DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  defaultSandboxMode: DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  fullApprovalPolicy: DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
  fullSandboxMode: DEFAULT_COMPOSER_FULL_SANDBOX_MODE
});

const RESTRICTED_READ_ONLY_ACCESS: ReadOnlyAccess = {
  type: "restricted",
  includePlatformDefaults: true,
  readableRoots: []
};

type ThreadPermissionOverrides = Pick<ThreadStartParams, "approvalPolicy" | "sandbox">;
type TurnPermissionOverrides = Pick<TurnStartParams, "approvalPolicy" | "sandboxPolicy">;

export function isComposerPermissionLevel(value: unknown): value is ComposerPermissionLevel {
  return value === "default" || value === "full";
}

export function isComposerApprovalPolicy(value: unknown): value is ComposerApprovalPolicy {
  return value === "untrusted" || value === "on-failure" || value === "on-request" || value === "never";
}

function createReadOnlySandboxPolicy(): SandboxPolicy {
  return {
    type: "readOnly",
    access: RESTRICTED_READ_ONLY_ACCESS,
    networkAccess: false
  };
}

function createWorkspaceWriteSandboxPolicy(): SandboxPolicy {
  return {
    type: "workspaceWrite",
    writableRoots: [],
    readOnlyAccess: RESTRICTED_READ_ONLY_ACCESS,
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
): { readonly approvalPolicy: ComposerApprovalPolicy; readonly sandboxMode: SandboxMode } {
  return level === "full"
    ? {
      approvalPolicy: DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
      sandboxMode: DEFAULT_COMPOSER_FULL_SANDBOX_MODE
    }
    : {
      approvalPolicy: settings.defaultApprovalPolicy,
      sandboxMode: settings.defaultSandboxMode
    };
}

export function createThreadPermissionOverrides(
  level: ComposerPermissionLevel,
  settings: ComposerPermissionSettings = DEFAULT_COMPOSER_PERMISSION_SETTINGS
): ThreadPermissionOverrides {
  const values = resolveComposerPermissionValues(level, settings);
  return { approvalPolicy: values.approvalPolicy, sandbox: values.sandboxMode };
}

export function createTurnPermissionOverrides(
  level: ComposerPermissionLevel,
  settings: ComposerPermissionSettings = DEFAULT_COMPOSER_PERMISSION_SETTINGS
): TurnPermissionOverrides {
  const values = resolveComposerPermissionValues(level, settings);
  return {
    approvalPolicy: values.approvalPolicy,
    sandboxPolicy: createSandboxPolicy(values.sandboxMode)
  };
}
