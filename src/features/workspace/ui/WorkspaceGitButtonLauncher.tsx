import { WorkspaceGitButton } from "./WorkspaceGitButton";
import type { WorkspaceGitController } from "../../git/model/types";

interface WorkspaceGitButtonLauncherProps {
  readonly controller: WorkspaceGitController;
  readonly selectedRootPath: string | null;
}

export function WorkspaceGitButtonLauncher(
  props: WorkspaceGitButtonLauncherProps,
): JSX.Element {
  return (
    <WorkspaceGitButton
      controller={props.controller}
      selectedRootPath={props.selectedRootPath}
    />
  );
}
