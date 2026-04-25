import { isGitBusy } from "./gitViewState";
import type { WorkspaceGitController } from "./types";
import {
  hasCommitableChanges,
  hasUnresolvedConflicts,
} from "./workspaceGitHelpers";

function canUseGitActions(controller: WorkspaceGitController): boolean {
  if (isGitBusy(controller) || controller.status?.isRepository !== true) {
    return false;
  }
  return true;
}

export function canOpenCommitDialog(controller: WorkspaceGitController): boolean {
  if (!canUseGitActions(controller)) {
    return false;
  }
  if (hasUnresolvedConflicts(controller.status)) {
    return false;
  }
  return hasCommitableChanges(controller.status);
}

export function canCommitChanges(controller: WorkspaceGitController): boolean {
  return canOpenCommitDialog(controller);
}

export function canPullChanges(controller: WorkspaceGitController): boolean {
  return canUseGitActions(controller);
}

export function canPushChanges(controller: WorkspaceGitController): boolean {
  return canUseGitActions(controller);
}
