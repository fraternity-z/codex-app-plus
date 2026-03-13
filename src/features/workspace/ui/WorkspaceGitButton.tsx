import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCommitIcon, GitPullIcon, GitPushIcon } from "../../git/ui/gitIcons";
import { GitPushConfirmDialog } from "../../git/ui/GitPushConfirmDialog";
import { canCommitChanges, canPullChanges, canPushChanges } from "../../git/model/gitActionAvailability";
import type { WorkspaceGitController } from "../../git/model/types";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

const CURRENT_WORKSPACE_LABEL = "当前工作区";
const GIT_MENU_LABEL = "Git 操作";
const GIT_TRIGGER_LABEL = "选择 Git 操作";
const COMMIT_LABEL = "提交";
const PUSH_LABEL = "推送";
const PULL_LABEL = "拉取";

interface WorkspaceGitButtonProps {
  readonly controller: WorkspaceGitController;
  readonly requestedOpen?: "menu" | "push" | null;
  readonly selectedRootPath: string | null;
}

function useRequestedOpen(
  controller: WorkspaceGitController,
  requestedOpen: WorkspaceGitButtonProps["requestedOpen"],
  setMenuOpen: (value: boolean) => void,
  setPushConfirmOpen: (value: boolean) => void,
): void {
  const handledRequestRef = useRef<WorkspaceGitButtonProps["requestedOpen"]>(null);

  useEffect(() => {
    if (requestedOpen === null || requestedOpen === undefined || handledRequestRef.current === requestedOpen || !controller.statusLoaded) {
      return;
    }
    handledRequestRef.current = requestedOpen;
    if (requestedOpen === "menu") {
      setMenuOpen(true);
      return;
    }
    if (canPushChanges(controller)) {
      setPushConfirmOpen(true);
    }
  }, [controller, requestedOpen, setMenuOpen, setPushConfirmOpen]);
}

interface GitMenuAction {
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => Promise<void> | void;
  readonly renderIcon: (className: string) => JSX.Element;
}

function createMenuActions(controller: WorkspaceGitController, requestPush: () => void): ReadonlyArray<GitMenuAction> {
  return [
    { label: COMMIT_LABEL, disabled: !canCommitChanges(controller), onClick: controller.commit, renderIcon: (className) => <GitCommitIcon className={className} /> },
    { label: PUSH_LABEL, disabled: !canPushChanges(controller), onClick: requestPush, renderIcon: (className) => <GitPushIcon className={className} /> },
    { label: PULL_LABEL, disabled: !canPullChanges(controller), onClick: controller.pull, renderIcon: (className) => <GitPullIcon className={className} /> }
  ];
}

function WorkspaceGitMenu(props: {
  readonly actions: ReadonlyArray<GitMenuAction>;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div className="toolbar-split-menu" role="menu" aria-label={GIT_MENU_LABEL}>
      <div className="toolbar-menu-title">{GIT_MENU_LABEL}</div>
      <div className="toolbar-menu-separator" />
      {props.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="toolbar-menu-item"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            if (action.disabled) {
              return;
            }
            props.onClose();
            void action.onClick();
          }}
        >
          {action.renderIcon("toolbar-menu-icon")}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

export function WorkspaceGitButton(props: WorkspaceGitButtonProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const [pushConfirmPending, setPushConfirmPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closePushConfirm = useCallback(() => {
    if (!pushConfirmPending) {
      setPushConfirmOpen(false);
    }
  }, [pushConfirmPending]);
  const requestPush = useCallback(() => {
    if (canPushChanges(props.controller)) {
      setPushConfirmOpen(true);
    }
  }, [props.controller]);
  const confirmPush = useCallback(async () => {
    setPushConfirmPending(true);
    try {
      await props.controller.push();
      setPushConfirmOpen(false);
    } finally {
      setPushConfirmPending(false);
    }
  }, [props.controller]);
  const triggerDisabled = props.selectedRootPath === null || props.controller.pendingAction !== null || props.controller.loading || !props.controller.statusLoaded;
  const pushDisabled = props.selectedRootPath === null || !canPushChanges(props.controller);
  const menuActions = useMemo(() => createMenuActions(props.controller, requestPush), [props.controller, requestPush]);
  const branchName = props.controller.status?.branch?.head ?? null;

  useRequestedOpen(props.controller, props.requestedOpen ?? null, setMenuOpen, setPushConfirmOpen);
  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  return (
    <>
      <div className={menuOpen ? "toolbar-split toolbar-split-open" : "toolbar-split"} ref={containerRef}>
        <button type="button" className="toolbar-split-main" disabled={pushDisabled} aria-label={`${PUSH_LABEL}${CURRENT_WORKSPACE_LABEL}`} onClick={requestPush}>
          <GitPushIcon className="toolbar-action-icon" />
          <span className="toolbar-split-main-text">{PUSH_LABEL}</span>
        </button>
        <button type="button" className="toolbar-split-trigger" disabled={triggerDisabled} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={GIT_TRIGGER_LABEL} onClick={() => setMenuOpen((value) => !value)}>
          <OfficialChevronRightIcon className="toolbar-caret-icon" />
        </button>
        {menuOpen ? <WorkspaceGitMenu actions={menuActions} onClose={closeMenu} /> : null}
      </div>
      <GitPushConfirmDialog branchName={branchName} open={pushConfirmOpen} pending={pushConfirmPending} onClose={closePushConfirm} onConfirm={() => void confirmPush()} />
    </>
  );
}
