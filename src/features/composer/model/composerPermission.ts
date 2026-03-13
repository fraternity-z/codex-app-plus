import type { AskForApproval } from "../../../protocol/generated/v2/AskForApproval";
import type { ReadOnlyAccess } from "../../../protocol/generated/v2/ReadOnlyAccess";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type { SandboxPolicy } from "../../../protocol/generated/v2/SandboxPolicy";
import type { ThreadStartParams } from "../../../protocol/generated/v2/ThreadStartParams";
import type { TurnStartParams } from "../../../protocol/generated/v2/TurnStartParams";

export type ComposerPermissionLevel = "default" | "full";

export const DEFAULT_COMPOSER_PERMISSION_LEVEL: ComposerPermissionLevel = "default";

const DEFAULT_APPROVAL_POLICY: AskForApproval = "on-request";
const FULL_ACCESS_APPROVAL_POLICY: AskForApproval = "never";
const DEFAULT_SANDBOX_MODE: SandboxMode = "workspace-write";
const FULL_ACCESS_SANDBOX_MODE: SandboxMode = "danger-full-access";
const DEFAULT_READ_ONLY_ACCESS: ReadOnlyAccess = {
  type: "restricted",
  includePlatformDefaults: true,
  readableRoots: []
};

type ThreadPermissionOverrides = Pick<ThreadStartParams, "approvalPolicy" | "sandbox">;
type TurnPermissionOverrides = Pick<TurnStartParams, "approvalPolicy" | "sandboxPolicy">;

export function isComposerPermissionLevel(value: unknown): value is ComposerPermissionLevel {
  return value === "default" || value === "full";
}

function createDefaultSandboxPolicy(): SandboxPolicy {
  return {
    type: "workspaceWrite",
    writableRoots: [],
    readOnlyAccess: DEFAULT_READ_ONLY_ACCESS,
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false
  };
}

export function createThreadPermissionOverrides(level: ComposerPermissionLevel): ThreadPermissionOverrides {
  if (level === "full") {
    return { approvalPolicy: FULL_ACCESS_APPROVAL_POLICY, sandbox: FULL_ACCESS_SANDBOX_MODE };
  }

  return { approvalPolicy: DEFAULT_APPROVAL_POLICY, sandbox: DEFAULT_SANDBOX_MODE };
}

export function createTurnPermissionOverrides(level: ComposerPermissionLevel): TurnPermissionOverrides {
  if (level === "full") {
    return { approvalPolicy: FULL_ACCESS_APPROVAL_POLICY, sandboxPolicy: { type: "dangerFullAccess" } };
  }

  return { approvalPolicy: DEFAULT_APPROVAL_POLICY, sandboxPolicy: createDefaultSandboxPolicy() };
}
