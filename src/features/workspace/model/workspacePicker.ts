import { open } from "@tauri-apps/plugin-dialog";
import { inferWorkspaceNameFromPath } from "./workspacePath";

export interface WorkspaceFolderSelection {
  readonly name: string;
  readonly path: string;
}

export async function requestWorkspaceFolder(
  title: string,
  singleSelectionError: string,
): Promise<WorkspaceFolderSelection | null> {
  const selection = await open({ title, directory: true, multiple: false });
  if (selection === null) {
    return null;
  }
  if (Array.isArray(selection)) {
    throw new Error(singleSelectionError);
  }

  const path = selection.trim();
  return path.length === 0 ? null : { name: inferWorkspaceNameFromPath(path), path };
}
