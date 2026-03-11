import { useCallback, useEffect, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import { WorkspaceGitButton } from "./WorkspaceGitButton";
import { useWorkspaceGit } from "./git/useWorkspaceGit";
import { GitPushIcon } from "./git/gitIcons";
import { OfficialChevronRightIcon } from "./officialIcons";

const CURRENT_WORKSPACE_LABEL = " current workspace";
const GIT_TRIGGER_LABEL = "Select Git action";
const PUSH_LABEL = "Push";

type RequestedOpen = "menu" | "push" | null;

interface WorkspaceGitButtonLauncherProps {
  readonly hostBridge: HostBridge;
  readonly selectedRootPath: string | null;
}

interface MountedWorkspaceGitButtonProps extends WorkspaceGitButtonLauncherProps {
  readonly requestedOpen: RequestedOpen;
}

function MountedWorkspaceGitButton(props: MountedWorkspaceGitButtonProps): JSX.Element {
  const controller = useWorkspaceGit({
    diffStateEnabled: false,
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: false,
  });

  return (
    <WorkspaceGitButton
      controller={controller}
      requestedOpen={props.requestedOpen}
      selectedRootPath={props.selectedRootPath}
    />
  );
}

function InactiveWorkspaceGitButton(props: {
  readonly disabled: boolean;
  readonly onOpenMenu: () => void;
  readonly onOpenPush: () => void;
}): JSX.Element {
  return (
    <div className="toolbar-split">
      <button
        type="button"
        className="toolbar-split-main"
        disabled={props.disabled}
        aria-label={`${PUSH_LABEL}${CURRENT_WORKSPACE_LABEL}`}
        onClick={props.onOpenPush}
      >
        <GitPushIcon className="toolbar-action-icon" />
        <span className="toolbar-split-main-text">{PUSH_LABEL}</span>
      </button>
      <button
        type="button"
        className="toolbar-split-trigger"
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={false}
        aria-label={GIT_TRIGGER_LABEL}
        onClick={props.onOpenMenu}
      >
        <OfficialChevronRightIcon className="toolbar-caret-icon" />
      </button>
    </div>
  );
}

export function WorkspaceGitButtonLauncher(props: WorkspaceGitButtonLauncherProps): JSX.Element {
  const [activated, setActivated] = useState(false);
  const [requestedOpen, setRequestedOpen] = useState<RequestedOpen>(null);
  const disabled = props.selectedRootPath === null;

  useEffect(() => {
    if (props.selectedRootPath !== null) {
      return;
    }
    setActivated(false);
    setRequestedOpen(null);
  }, [props.selectedRootPath]);

  const activate = useCallback((nextRequestedOpen: Exclude<RequestedOpen, null>) => {
    if (disabled) {
      return;
    }
    setRequestedOpen(nextRequestedOpen);
    setActivated(true);
  }, [disabled]);

  if (activated && props.selectedRootPath !== null) {
    return (
      <MountedWorkspaceGitButton
        hostBridge={props.hostBridge}
        requestedOpen={requestedOpen}
        selectedRootPath={props.selectedRootPath}
      />
    );
  }

  return (
    <InactiveWorkspaceGitButton
      disabled={disabled}
      onOpenMenu={() => activate("menu")}
      onOpenPush={() => activate("push")}
    />
  );
}
