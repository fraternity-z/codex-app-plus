export {
  useWorkspaceRoots,
  type UpdateWorkspaceLaunchScriptsInput,
  type WorkspaceRoot,
  type WorkspaceRootController,
} from "./hooks/useWorkspaceRoots";
export { useWorkspaceWorktrees } from "./hooks/useWorkspaceWorktrees";
export { listAllThreads, loadThreadCatalog } from "./model/threadCatalog";
export {
  createDefaultWorktreeProjectName,
} from "./model/worktreeRecords";
export {
  inferWorkspaceNameFromPath,
  resolveAgentWorkspacePath,
} from "./model/workspacePath";
export { requestWorkspaceFolder, type WorkspaceFolderSelection } from "./model/workspacePicker";
export { WorktreeCreateDialog } from "./ui/WorktreeCreateDialog";
