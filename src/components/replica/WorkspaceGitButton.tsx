import { useCallback, useMemo, useRef, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import { GitBranchIcon, GitPullIcon, GitPushIcon, GitRefreshIcon } from "./git/gitIcons";
import { useWorkspaceGit } from "./git/useWorkspaceGit";
import { WorkspaceGitView } from "./git/WorkspaceGitView";
import { OfficialChevronRightIcon } from "./officialIcons";
import { useToolbarMenuDismissal } from "./useToolbarMenuDismissal";

const CURRENT_WORKSPACE_LABEL = "当前工作区";
const GIT_MENU_LABEL = "Git 操作";
const GIT_TRIGGER_LABEL = "选择 Git 操作";
const OPEN_PANEL_LABEL = "打开 Git 工作台";
const INIT_LABEL = "初始化仓库";
const PUSH_LABEL = "推送";
const PULL_LABEL = "拉取";
const FETCH_LABEL = "抓取";
const REFRESH_LABEL = "刷新状态";

interface WorkspaceGitButtonProps {
  readonly hostBridge: HostBridge;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
}

interface GitMenuAction {
  readonly label: string;
  readonly onClick: () => Promise<void> | void;
  readonly renderIcon: (className: string) => JSX.Element;
}

function WorkspaceGitMenu(props: {
  readonly actions: ReadonlyArray<GitMenuAction>;
  readonly disabled: boolean;
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
          disabled={props.disabled}
          onClick={() => {
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
  const [panelOpen, setPanelOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const git = useWorkspaceGit({ hostBridge: props.hostBridge, selectedRootPath: props.selectedRootPath });
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const triggerDisabled = props.selectedRootPath === null || git.pendingAction !== null || git.loading || !git.statusLoaded;
  const pushDisabled = props.selectedRootPath === null || git.pendingAction !== null || git.loading || !git.statusLoaded || !git.hasRepository;
  const menuActions = useMemo<ReadonlyArray<GitMenuAction>>(() => {
    const commonActions: GitMenuAction[] = [
      {
        label: OPEN_PANEL_LABEL,
        onClick: openPanel,
        renderIcon: (className: string) => <GitBranchIcon className={className} />
      },
      {
        label: REFRESH_LABEL,
        onClick: git.refresh,
        renderIcon: (className: string) => <GitRefreshIcon className={className} />
      }
    ];

    if (!git.hasRepository) {
      return [
        {
          label: INIT_LABEL,
          onClick: git.initRepository,
          renderIcon: (className: string) => <GitBranchIcon className={className} />
        },
        ...commonActions
      ];
    }

    return [
      {
        label: PUSH_LABEL,
        onClick: git.push,
        renderIcon: (className: string) => <GitPushIcon className={className} />
      },
      {
        label: PULL_LABEL,
        onClick: git.pull,
        renderIcon: (className: string) => <GitPullIcon className={className} />
      },
      {
        label: FETCH_LABEL,
        onClick: git.fetch,
        renderIcon: (className: string) => <GitRefreshIcon className={className} />
      },
      ...commonActions
    ];
  }, [git.fetch, git.hasRepository, git.initRepository, git.pull, git.push, git.refresh, openPanel]);

  useToolbarMenuDismissal(menuOpen, containerRef, closeMenu);

  return (
    <>
      <div className={menuOpen ? "toolbar-split toolbar-split-open" : "toolbar-split"} ref={containerRef}>
        <button
          type="button"
          className="toolbar-split-main"
          disabled={pushDisabled}
          aria-label={`${PUSH_LABEL}${CURRENT_WORKSPACE_LABEL}`}
          onClick={() => void git.push()}
        >
          <GitPushIcon className="toolbar-action-icon" />
          <span>{PUSH_LABEL}</span>
        </button>
        <button
          type="button"
          className="toolbar-split-trigger"
          disabled={triggerDisabled}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={GIT_TRIGGER_LABEL}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <OfficialChevronRightIcon className="toolbar-caret-icon" />
        </button>
        {menuOpen ? <WorkspaceGitMenu actions={menuActions} disabled={triggerDisabled} onClose={closeMenu} /> : null}
      </div>
      {panelOpen && props.selectedRootPath !== null ? (
        <div className="git-dialog-backdrop" role="presentation" onClick={closePanel}>
          <section className="git-dialog" role="dialog" aria-modal="true" aria-label="Git 工作台" onClick={(event) => event.stopPropagation()}>
            <header className="git-dialog-header">
              <strong>Git 工作台</strong>
              <button type="button" className="git-dialog-close" onClick={closePanel} aria-label="关闭 Git 工作台">
                ×
              </button>
            </header>
            <div className="git-dialog-body">
              <WorkspaceGitView selectedRootName={props.selectedRootName} controller={git} />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
