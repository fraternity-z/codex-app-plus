import { Suspense, lazy } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { GitWorkspaceDiffOutput, HostBridge } from "../../../bridge/types";
import type { WorkspaceGitController } from "../../git/model/types";
import type { DiffViewStyle } from "../../git/hooks/useDiffSidebarLayout";

const LazyWorkspaceDiffSidebar = lazy(async () => {
  const module = await import("../../git/ui/WorkspaceDiffSidebar");
  return { default: module.WorkspaceDiffSidebar };
});

interface WorkspaceDiffSidebarHostProps {
  readonly hostBridge: HostBridge;
  readonly controller: WorkspaceGitController;
  readonly onClose: () => void;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly expanded?: boolean;
  readonly onToggleExpanded?: () => void;
  readonly diffStyle?: DiffViewStyle;
  readonly onToggleDiffStyle?: () => void;
  readonly selectedDiffPath?: string | null;
  readonly onSelectDiffPath?: (path: string | null) => void;
  readonly onDiffItemsChange?: (items: ReadonlyArray<GitWorkspaceDiffOutput>) => void;
  readonly onResizeStart?: (event: ReactMouseEvent) => void;
  readonly canResize?: boolean;
  readonly isResizing?: boolean;
}

export function WorkspaceDiffSidebarHost(props: WorkspaceDiffSidebarHostProps): JSX.Element | null {
  if (props.selectedRootPath === null) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyWorkspaceDiffSidebar
        hostBridge={props.hostBridge}
        controller={props.controller}
        onClose={props.onClose}
        open={true}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        expanded={props.expanded}
        onToggleExpanded={props.onToggleExpanded}
        diffStyle={props.diffStyle}
        onToggleDiffStyle={props.onToggleDiffStyle}
        selectedDiffPath={props.selectedDiffPath}
        onSelectDiffPath={props.onSelectDiffPath}
        onDiffItemsChange={props.onDiffItemsChange}
        onResizeStart={props.onResizeStart}
        canResize={props.canResize}
        isResizing={props.isResizing}
      />
    </Suspense>
  );
}
