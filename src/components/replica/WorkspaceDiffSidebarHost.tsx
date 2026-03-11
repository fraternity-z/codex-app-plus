import { Suspense, lazy } from "react";
import type { HostBridge } from "../../bridge/types";
import { useWorkspaceGit } from "./git/useWorkspaceGit";

const LazyWorkspaceDiffSidebar = lazy(async () => {
  const module = await import("./git/WorkspaceDiffSidebar");
  return { default: module.WorkspaceDiffSidebar };
});

interface WorkspaceDiffSidebarHostProps {
  readonly hostBridge: HostBridge;
  readonly onClose: () => void;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
}

export function WorkspaceDiffSidebarHost(props: WorkspaceDiffSidebarHostProps): JSX.Element | null {
  const controller = useWorkspaceGit({
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: true,
  });

  if (props.selectedRootPath === null) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyWorkspaceDiffSidebar
        controller={controller}
        onClose={props.onClose}
        open={true}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
      />
    </Suspense>
  );
}
