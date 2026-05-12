import type { AgentEnvironment } from "../../../bridge/types";
import type { ConfigEdit } from "../../../protocol/generated/v2/ConfigEdit";
import type { ConfigLayer } from "../../../protocol/generated/v2/ConfigLayer";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type {
  ComposerApprovalPolicy,
} from "../../composer/model/composerPermission";
import {
  DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  isComposerApprovalPolicy,
} from "../../composer/model/composerPermission";
import type { WorkspaceRoot } from "../../workspace";
import { resolveAgentWorkspacePath } from "../../workspace";

export type PermissionConfigScope = "project" | "user";

export interface PermissionConfigValues {
  readonly approvalPolicy: ComposerApprovalPolicy;
  readonly sandboxMode: SandboxMode;
  readonly networkAccess: boolean;
}

export interface PermissionConfigWriteTarget {
  readonly cwd: string | null;
  readonly filePath: string | null;
  readonly expectedVersion: string | null;
}

const PROJECT_CONFIG_RELATIVE_PATH = ".codex/config.toml";

export const DEFAULT_PERMISSION_CONFIG_VALUES: PermissionConfigValues = Object.freeze({
  approvalPolicy: DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  sandboxMode: DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  networkAccess: false,
});

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function appendAgentPath(rootPath: string, relativePath: string): string {
  const normalizedRoot = trimTrailingSeparators(rootPath).replace(/\\/g, "/");
  return `${normalizedRoot}/${relativePath}`;
}

function findClosestProjectLayer(snapshot: ConfigReadResponse | null): ConfigLayer | null {
  const projectLayers = snapshot?.layers?.filter((layer) => layer.name.type === "project") ?? [];
  return projectLayers[projectLayers.length - 1] ?? null;
}

export function createProjectConfigCwd(root: WorkspaceRoot, agentEnvironment: AgentEnvironment): string {
  return resolveAgentWorkspacePath(root.path, agentEnvironment);
}

export function createProjectConfigFilePath(root: WorkspaceRoot, agentEnvironment: AgentEnvironment): string {
  return appendAgentPath(createProjectConfigCwd(root, agentEnvironment), PROJECT_CONFIG_RELATIVE_PATH);
}

export function readProjectConfigWriteTarget(
  snapshot: ConfigReadResponse | null,
  root: WorkspaceRoot,
  agentEnvironment: AgentEnvironment,
): PermissionConfigWriteTarget {
  return {
    cwd: createProjectConfigCwd(root, agentEnvironment),
    filePath: createProjectConfigFilePath(root, agentEnvironment),
    expectedVersion: findClosestProjectLayer(snapshot)?.version ?? null,
  };
}

export function readPermissionConfigValues(snapshot: ConfigReadResponse | null): PermissionConfigValues {
  const config = snapshot?.config ?? null;
  const approvalPolicy = isComposerApprovalPolicy(config?.approval_policy)
    ? config.approval_policy
    : DEFAULT_PERMISSION_CONFIG_VALUES.approvalPolicy;
  const sandboxMode = config?.sandbox_mode ?? DEFAULT_PERMISSION_CONFIG_VALUES.sandboxMode;
  const networkAccess = config?.sandbox_workspace_write?.network_access ?? DEFAULT_PERMISSION_CONFIG_VALUES.networkAccess;

  return { approvalPolicy, sandboxMode, networkAccess };
}

export function applyPermissionConfigValue<K extends keyof PermissionConfigValues>(
  snapshot: ConfigReadResponse | null,
  key: K,
  value: PermissionConfigValues[K],
): ConfigReadResponse | null {
  if (snapshot === null) {
    return null;
  }
  if (key === "approvalPolicy") {
    const config = {
      ...snapshot.config,
      approval_policy: value as ComposerApprovalPolicy,
    } as ConfigReadResponse["config"];
    return {
      ...snapshot,
      config,
    };
  }
  if (key === "sandboxMode") {
    const config = {
      ...snapshot.config,
      sandbox_mode: value as SandboxMode,
    } as ConfigReadResponse["config"];
    return {
      ...snapshot,
      config,
    };
  }
  const currentWorkspaceWrite = snapshot.config.sandbox_workspace_write;
  const config = {
    ...snapshot.config,
    sandbox_workspace_write: {
      writable_roots: currentWorkspaceWrite?.writable_roots ?? [],
      network_access: Boolean(value),
      exclude_tmpdir_env_var: currentWorkspaceWrite?.exclude_tmpdir_env_var ?? false,
      exclude_slash_tmp: currentWorkspaceWrite?.exclude_slash_tmp ?? false,
    },
  } as ConfigReadResponse["config"];
  return {
    ...snapshot,
    config,
  };
}

export function createPermissionConfigEdit(
  key: keyof PermissionConfigValues,
  value: PermissionConfigValues[typeof key],
): ConfigEdit {
  if (key === "approvalPolicy") {
    return { keyPath: "approval_policy", value, mergeStrategy: "replace" };
  }
  if (key === "sandboxMode") {
    return { keyPath: "sandbox_mode", value, mergeStrategy: "replace" };
  }
  return { keyPath: "sandbox_workspace_write.network_access", value, mergeStrategy: "replace" };
}
