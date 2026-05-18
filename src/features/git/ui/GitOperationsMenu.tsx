import { useCallback, useRef, useState } from "react";
import { readStoredAppPreferences } from "../../settings/hooks/useAppPreferences";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { canOpenCommitDialog, canPushChanges } from "../model/gitActionAvailability";
import { isGitBusy } from "../model/gitViewState";
import type { WorkspaceGitController } from "../model/types";
import { GitBranchIcon, GitCommitNodeIcon, GitHubMarkIcon, GitPushIcon } from "./gitIcons";
import { GitPushConfirmDialog } from "./GitPushConfirmDialog";

type GitOperationIcon = (props: { readonly className?: string }) => JSX.Element;

interface GitOperationMenuItem {
  readonly label: string;
  readonly Icon: GitOperationIcon;
  readonly disabled?: boolean;
  readonly todo?: boolean;
  readonly onSelect: () => void;
}

interface GitOperationsMenuProps {
  readonly controller: WorkspaceGitController;
  readonly triggerLabel: string;
  readonly triggerClassName: string;
  readonly triggerChildren: JSX.Element;
  readonly activeTriggerClassName?: string;
  readonly disabled?: boolean;
  readonly includePullRequest?: boolean;
  readonly menuClassName?: string;
  readonly onBeforeOpen?: () => void;
  readonly wrapperClassName?: string;
}

function canUseGitOperations(controller: WorkspaceGitController): boolean {
  return !isGitBusy(controller) && controller.statusLoaded && controller.status?.isRepository === true;
}

function requestBranchName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.prompt("请输入新分支名");
  const branchName = value?.trim() ?? "";
  return branchName.length > 0 ? branchName : null;
}

export function GitOperationsMenu(props: GitOperationsMenuProps): JSX.Element {
  const appPreferences = readStoredAppPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const [pushConfirmPending, setPushConfirmPending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const gitOperationsDisabled = props.disabled === true || !canUseGitOperations(props.controller);
  const triggerClassName = menuOpen
    ? props.activeTriggerClassName ?? props.triggerClassName
    : props.triggerClassName;
  const branchName = props.controller.status?.branch?.head ?? null;

  useToolbarMenuDismissal(menuOpen, menuRef, closeMenu);

  const requestPush = useCallback(() => {
    if (canPushChanges(props.controller)) {
      setPushConfirmOpen(true);
    }
  }, [props.controller]);

  const closePushConfirm = useCallback(() => {
    if (!pushConfirmPending) {
      setPushConfirmOpen(false);
    }
  }, [pushConfirmPending]);

  const confirmPush = useCallback(async () => {
    setPushConfirmPending(true);
    try {
      await props.controller.push();
      setPushConfirmOpen(false);
    } finally {
      setPushConfirmPending(false);
    }
  }, [props.controller]);

  const createBranch = useCallback(() => {
    const branchNameInput = requestBranchName();
    if (branchNameInput === null) {
      return;
    }
    void props.controller.createBranchFromName(branchNameInput);
  }, [props.controller]);

  const menuItems: ReadonlyArray<GitOperationMenuItem> = [
    { label: "提交", Icon: GitCommitNodeIcon, disabled: !canOpenCommitDialog(props.controller), onSelect: props.controller.openCommitDialog },
    { label: "推送", Icon: GitPushIcon, disabled: !canPushChanges(props.controller), onSelect: requestPush },
    ...(props.includePullRequest === true
      ? [{ label: "创建拉取请求", Icon: GitHubMarkIcon, disabled: true, todo: true, onSelect: closeMenu }]
      : []),
    { label: "创建分支", Icon: GitBranchIcon, disabled: !canUseGitOperations(props.controller), onSelect: createBranch },
  ];

  return (
    <>
      <div className={props.wrapperClassName ?? "workspace-diff-toolbar-menu-wrap"} ref={menuRef}>
        <button
          type="button"
          className={triggerClassName}
          aria-label={props.triggerLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={gitOperationsDisabled}
          title={props.triggerLabel}
          onClick={() => {
            setMenuOpen((currentValue) => {
              const nextValue = !currentValue;
              if (nextValue) {
                props.onBeforeOpen?.();
              }
              return nextValue;
            });
          }}
        >
          {props.triggerChildren}
        </button>
        {menuOpen ? (
          <div className={props.menuClassName ?? "workspace-diff-actions-menu workspace-diff-git-menu"} role="menu" aria-label={props.triggerLabel}>
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="workspace-diff-actions-menu-item"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  closeMenu();
                  item.onSelect();
                }}
              >
                <item.Icon className="workspace-diff-actions-menu-icon" />
                <span>{item.label}</span>
                {item.todo === true ? <span className="workspace-diff-actions-menu-todo">TODO</span> : null}
              </button>
            ))}
          </div>
        ) : null}
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
