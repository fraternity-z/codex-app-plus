import type { CommandExecResponse } from "../../../protocol/generated/v2/CommandExecResponse";
import type { WorkspaceGitController } from "../../git/model/types";

export const CODEX_WEB_URL = "https://chatgpt.com/codex";
export const CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY = "codex-app-plus:codex-cloud-environment-id";
export const CODEX_CLOUD_EXEC_TIMEOUT_MS = 120000;

interface CodexCloudEnvironmentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function normalizeCodexCloudEnvironmentId(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length === 0 ? null : trimmedValue;
}

export function readStoredCodexCloudEnvironmentId(storage = getDefaultStorage()): string | null {
  if (storage === null) {
    return null;
  }
  try {
    return normalizeCodexCloudEnvironmentId(storage.getItem(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredCodexCloudEnvironmentId(
  environmentId: string | null,
  storage = getDefaultStorage(),
): string | null {
  if (storage === null) {
    return normalizeCodexCloudEnvironmentId(environmentId);
  }
  const normalizedEnvironmentId = normalizeCodexCloudEnvironmentId(environmentId);
  try {
    if (normalizedEnvironmentId === null) {
      storage.removeItem(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY);
      return null;
    }
    storage.setItem(CODEX_CLOUD_ENVIRONMENT_STORAGE_KEY, normalizedEnvironmentId);
  } catch {
    return normalizedEnvironmentId;
  }
  return normalizedEnvironmentId;
}

export function buildCodexCloudPrompt(args: {
  readonly bodyText: string;
  readonly fileReferencePaths: ReadonlyArray<string>;
}): string {
  const trimmedBody = args.bodyText.trim();
  const fileReferences = args.fileReferencePaths
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  if (fileReferences.length === 0) {
    return trimmedBody;
  }
  const referenceBlock = fileReferences.map((path) => `- ${path}`).join("\n");
  if (trimmedBody.length === 0) {
    return `Use these workspace file references:\n${referenceBlock}`;
  }
  return `${trimmedBody}\n\nWorkspace file references:\n${referenceBlock}`;
}

export function buildCodexCloudExecCommand(args: {
  readonly environmentId: string;
  readonly prompt: string;
  readonly branch: string | null;
}): Array<string> {
  const command = ["codex", "cloud", "exec", "--env", args.environmentId];
  if (args.branch !== null) {
    command.push("--branch", args.branch);
  }
  command.push(args.prompt);
  return command;
}

export function resolveCodexCloudBranch(
  controller: WorkspaceGitController,
  selectedThreadBranch: string | null,
): string | null {
  const selectedBranch = normalizeGitBranchName(selectedThreadBranch);
  if (selectedBranch !== null) {
    return selectedBranch;
  }
  if (controller.status?.branch?.detached) {
    return null;
  }
  return normalizeGitBranchName(controller.status?.branches.find((branch) => branch.isCurrent)?.name)
    ?? normalizeGitBranchName(controller.status?.branch?.head)
    ?? normalizeGitBranchName(controller.selectedBranch);
}

export function formatCodexCloudExecOutput(response: CommandExecResponse, maxLength = 600): string | null {
  const output = (response.stdout.trim() || response.stderr.trim()).trim();
  if (output.length === 0) {
    return null;
  }
  if (output.length <= maxLength) {
    return output;
  }
  return `${output.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function normalizeGitBranchName(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length === 0 ? null : normalizedValue;
}

function getDefaultStorage(): CodexCloudEnvironmentStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
