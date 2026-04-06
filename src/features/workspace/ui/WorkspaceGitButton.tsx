import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../../i18n/useI18n";
import { GitCommitIcon, GitPullIcon, GitPushIcon } from "../../git/ui/gitIcons";
import { GitPushConfirmDialog } from "../../git/ui/GitPushConfirmDialog";
import { canOpenCommitDialog, canPullChanges, canPushChanges } from "../../git/model/gitActionAvailability";
import type { WorkspaceGitController } from "../../git/model/types";
import { readStoredAppPreferences } from "../../settings/hooks/useAppPreferences";
import { OfficialChevronRightIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";

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

function WorkspaceGitMenu(props: {
  readonly actions: ReadonlyArray<GitMenuAction>;
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="toolbar-split-menu" role="menu" aria-label={t("home.toolbar.gitActions")}>
      <div className="toolbar-menu-title">{t("home.toolbar.gitActions")}</div>
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
  const { t } = useI18n();
  const appPreferences = readStoredAppPreferences();
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
  const menuActions = useMemo<ReadonlyArray<GitMenuAction>>(() => [
    { label: t("home.toolbar.commit"), disabled: !canOpenCommitDialog(props.controller), onClick: props.controller.openCommitDialog, renderIcon: (className) => <GitCommitIcon className={className} /> },
    { label: t("home.toolbar.push"), disabled: !canPushChanges(props.controller), onClick: requestPush, renderIcon: (className) => <GitPushIcon className={className} /> },
    { label: t("home.toolbar.pull"), disabled: !canPullChanges(props.controller), onClick: props.controller.pull, renderIcon: (className) => <GitPullIcon className={className} /> }
  ], [props.controller, requestPush, t]);
  const branchName = props.controller.status?.branch?.head ?? null;

  useRequestedOpen(props.controller, props.requestedOpen ?? null, setMenuOpen, setPushConfirmOpen);
  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  return (
    <>
      <div className={menuOpen ? "toolbar-split toolbar-split-open" : "toolbar-split"} ref={containerRef}>
        <button type="button" className="toolbar-split-main" disabled={pushDisabled} aria-label={t("home.toolbar.pushCurrentWorkspace")} onClick={requestPush}>
          <GitPushIcon className="toolbar-action-icon" />
          <span className="toolbar-split-main-text">{t("home.toolbar.push")}</span>
        </button>
        <button type="button" className="toolbar-split-trigger" disabled={triggerDisabled} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t("home.toolbar.selectGitAction")} onClick={() => setMenuOpen((value) => !value)}>
          <OfficialChevronRightIcon className="toolbar-caret-icon" />
        </button>
        {menuOpen ? <WorkspaceGitMenu actions={menuActions} onClose={closeMenu} /> : null}
      </div>
      <GitPushConfirmDialog
        branchName={branchName}
        forceWithLease={appPreferences.gitPushForceWithLease}
        open={pushConfirmOpen}
        pending={pushConfirmPending}
        onClose={closePushConfirm}
        onConfirm={() => void confirmPush()}
      />
    </>
  );
}
