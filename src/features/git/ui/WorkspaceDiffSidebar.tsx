import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitWorkspaceDiffOutput, HostBridge } from "../../../bridge/types";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";
import { BrowserSidebarPanel } from "../../browser/ui/BrowserSidebarPanel";
import { OfficialCloseIcon, OfficialFolderIcon, OfficialPlusIcon } from "../../shared/ui/officialIcons";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import { SidebarIcon } from "../../shared/ui/icons";
import { useWorkspaceDiffViewer } from "../hooks/useWorkspaceDiffViewer";
import { getGitViewState, type GitViewState } from "../model/gitViewState";
import type { WorkspaceGitController } from "../model/types";
import {
  getDefaultGitChangeScope,
  getGitChangeScopeOptions,
  type GitChangeScope,
} from "./GitChangeBrowser";
import { GitStateCard } from "./GitStateCard";
import {
  GitDiffCollapseIcon,
  GitDiffExpandIcon,
  GitDiffIcon,
  GitDiffSplitViewIcon,
  GitDiffUnifiedViewIcon,
  GitRefreshIcon,
} from "./gitIcons";
import { WorkspaceDiffScopeSelector } from "./WorkspaceDiffScopeSelector";
import { WorkspaceDiffViewer } from "./WorkspaceDiffViewer";
import { WorkspaceDiffFileList } from "./WorkspaceDiffFileList";
import type { MouseEvent as ReactMouseEvent } from "react";

type WorkspaceSidePanelTab = "summary" | "review" | "browser";

interface WorkspaceDiffSidebarProps {
  readonly hostBridge: HostBridge;
  readonly open: boolean;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly controller: WorkspaceGitController;
  readonly onClose: () => void;
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveDialogPath(selection: string | string[] | null): string | null {
  if (Array.isArray(selection)) {
    return selection[0] ?? null;
  }
  return selection;
}

function countStatusChanges(status: WorkspaceGitController["status"]): number {
  if (status === null) {
    return 0;
  }
  return status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;
}

function useDiffScope(open: boolean, controller: WorkspaceGitController): [GitChangeScope, (scope: GitChangeScope) => void] {
  const [scope, setScope] = useState<GitChangeScope>("unstaged");
  useEffect(() => {
    if (!open || controller.status === null || !controller.status.isRepository) {
      return;
    }
    setScope((currentScope) => {
      const options = getGitChangeScopeOptions(controller);
      const currentOption = options.find((option) => option.scope === currentScope);
      if (currentOption !== undefined && (currentOption.count > 0 || currentOption.scope === "all")) {
        return currentScope;
      }
      return getDefaultGitChangeScope(controller);
    });
  }, [controller, open]);
  return [scope, setScope];
}

function DiffChangeSummary(props: {
  readonly additions: number;
  readonly deletions: number;
  readonly files: number;
  readonly loading: boolean;
}): JSX.Element | null {
  if (props.files === 0) {
    return null;
  }
  if (props.loading) {
    return <div className="workspace-diff-sidebar-summary workspace-diff-sidebar-summary-pending">更新中…</div>;
  }
  return (
    <div className="workspace-diff-sidebar-summary" aria-label={`当前分组新增 ${props.additions} 行，删除 ${props.deletions} 行`}>
      <span className="workspace-diff-sidebar-summary-add">+{props.additions}</span>
      <span className="workspace-diff-sidebar-summary-delete">-{props.deletions}</span>
    </div>
  );
}

interface SidePanelHeaderProps {
  readonly activeTab: WorkspaceSidePanelTab;
  readonly browserTabOpen: boolean;
  readonly expanded: boolean;
  readonly onSelectTab: (tab: WorkspaceSidePanelTab) => void;
  readonly onOpenFile: () => void;
  readonly onOpenBrowser: () => void;
  readonly onCloseBrowserTab: () => void;
  readonly onClose: () => void;
  readonly onToggleExpanded?: () => void;
}

function SidePanelHeader(props: SidePanelHeaderProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const tabs: ReadonlyArray<{ readonly id: WorkspaceSidePanelTab; readonly label: string }> = [
    { id: "summary", label: "概览" },
    { id: "review", label: "审查" },
    ...(props.browserTabOpen ? [{ id: "browser" as const, label: "浏览器" }] : []),
  ];
  const expandLabel = props.expanded ? "收起侧边栏预览" : "展开侧边栏预览";
  const ExpandIcon = props.expanded ? GitDiffCollapseIcon : GitDiffExpandIcon;

  useToolbarMenuDismissal(menuOpen, menuRef, closeMenu);

  return (
    <header className="workspace-diff-sidebar-header workspace-side-panel-header">
      <div className="workspace-side-panel-tabs" role="tablist" aria-label="侧边面板标签页">
        {tabs.map((tab) => {
          const active = props.activeTab === tab.id;
          const tabButton = (
            <button
              key={tab.id}
              type="button"
              className={active ? "workspace-side-panel-tab workspace-side-panel-tab-active" : "workspace-side-panel-tab"}
              role="tab"
              aria-selected={active}
              onClick={() => props.onSelectTab(tab.id)}
            >
              {tab.id === "browser" ? <SidebarIcon kind="browser" /> : null}
              <span>{tab.label}</span>
            </button>
          );
          if (tab.id !== "browser") {
            return tabButton;
          }
          return (
            <div
              key={tab.id}
              className={active ? "workspace-side-panel-tab-shell workspace-side-panel-tab-shell-active" : "workspace-side-panel-tab-shell"}
              role="presentation"
            >
              {tabButton}
              <button
                type="button"
                className="workspace-side-panel-tab-close"
                aria-label="关闭浏览器标签页"
                title="关闭浏览器标签页"
                onClick={props.onCloseBrowserTab}
              >
                <OfficialCloseIcon className="workspace-side-panel-tab-close-icon" />
              </button>
            </div>
          );
        })}
        <div className="workspace-side-panel-add-wrap" ref={menuRef}>
          <button
            type="button"
            className="workspace-side-panel-add"
            aria-label="打开侧边面板标签页"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((currentValue) => !currentValue)}
          >
            <OfficialPlusIcon className="workspace-diff-sidebar-close-icon" />
          </button>
          {menuOpen ? (
            <div className="workspace-side-panel-add-menu" role="menu">
              <button
                type="button"
                className="workspace-side-panel-menu-item"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  props.onOpenFile();
                }}
              >
                <OfficialFolderIcon className="workspace-side-panel-menu-icon" />
                <span>打开文件</span>
                <kbd>Ctrl+P</kbd>
              </button>
              <button
                type="button"
                className="workspace-side-panel-menu-item"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  props.onOpenBrowser();
                }}
              >
                <SidebarIcon kind="browser" />
                <span>浏览器</span>
                <kbd>Ctrl+T</kbd>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="workspace-side-panel-window-actions">
        {props.onToggleExpanded === undefined ? null : (
          <button
            type="button"
            className="workspace-diff-sidebar-close"
            aria-label={expandLabel}
            aria-pressed={props.expanded}
            title={expandLabel}
            onClick={props.onToggleExpanded}
          >
            <ExpandIcon className="workspace-diff-sidebar-close-icon" />
          </button>
        )}
        <button type="button" className="workspace-diff-sidebar-close" aria-label="关闭差异侧栏" onClick={props.onClose}>
          <OfficialCloseIcon className="workspace-diff-sidebar-close-icon" />
        </button>
      </div>
    </header>
  );
}

interface DiffReviewToolbarProps {
  readonly controller: WorkspaceGitController;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly loading: boolean;
  readonly scope?: GitChangeScope;
  readonly onRefresh: () => Promise<void>;
  readonly onScopeChange?: (scope: GitChangeScope) => void;
  readonly expanded?: boolean;
  readonly diffStyle?: DiffViewStyle;
  readonly onToggleDiffStyle?: () => void;
  readonly allowDiffStyleToggle?: boolean;
}

function DiffReviewToolbar(props: DiffReviewToolbarProps): JSX.Element {
  const options = getGitChangeScopeOptions(props.controller);
  const showSelector = props.scope !== undefined && props.onScopeChange !== undefined && options.length > 0;
  const diffStyle = props.diffStyle ?? "unified";
  const diffStyleLabel = diffStyle === "split" ? "切换为统一差异" : "切换为拆分差异";
  const DiffStyleIcon = diffStyle === "split" ? GitDiffUnifiedViewIcon : GitDiffSplitViewIcon;
  const allowDiffStyleToggle = props.allowDiffStyleToggle ?? false;
  return (
    <div className="workspace-diff-sidebar-review-controls">
      <div className="workspace-diff-sidebar-title-wrap">
        {showSelector ? (
          <>
            <WorkspaceDiffScopeSelector options={options} selectedScope={props.scope!} onChange={props.onScopeChange!} />
            <DiffChangeSummary
              additions={props.additions}
              deletions={props.deletions}
              files={props.files}
              loading={props.loading}
            />
          </>
        ) : (
          <>
            <GitDiffIcon className="workspace-diff-sidebar-icon" />
            <div>
              <h2 className="workspace-diff-sidebar-title">差异</h2>
              <p className="workspace-diff-sidebar-subtitle">{props.controller.status?.repoRoot ?? "当前工作区"}</p>
            </div>
          </>
        )}
      </div>
      <div className="workspace-diff-sidebar-actions">
        {props.onToggleDiffStyle === undefined || !allowDiffStyleToggle ? null : (
          <button
            type="button"
            className="workspace-diff-sidebar-close"
            aria-label={diffStyleLabel}
            aria-pressed={diffStyle === "split"}
            title={diffStyleLabel}
            onClick={props.onToggleDiffStyle}
          >
            <DiffStyleIcon className="workspace-diff-sidebar-close-icon" />
          </button>
        )}
        <button type="button" className="workspace-diff-sidebar-close" aria-label="刷新差异" onClick={() => void props.onRefresh()}>
          <GitRefreshIcon className="workspace-diff-sidebar-close-icon" />
        </button>
      </div>
    </div>
  );
}

function DiffSidebarState(props: { readonly viewState: GitViewState }): JSX.Element {
  return (
    <div className="workspace-diff-sidebar-content">
      <GitStateCard {...props.viewState} className="git-state-card workspace-diff-sidebar-state-card" />
    </div>
  );
}

function SidePanelSummary(props: {
  readonly selectedRootName: string;
  readonly selectedRootPath: string;
  readonly controller: WorkspaceGitController;
  readonly diffSummary: { readonly additions: number; readonly deletions: number; readonly files: number };
  readonly onRefresh: () => Promise<void>;
}): JSX.Element {
  const status = props.controller.status;
  const changedFiles = countStatusChanges(status);
  const branchName = status?.branch?.head ?? "未检测到分支";
  const repoRoot = status?.repoRoot ?? props.selectedRootPath;
  const statusText = status === null
    ? "尚未读取 Git 状态"
    : status.isClean
      ? "无暂存更改"
      : `${changedFiles} 个文件有变更`;

  return (
    <div className="workspace-diff-sidebar-content workspace-side-summary">
      <section className="workspace-side-summary-card" aria-label="工作区概览">
        <div className="workspace-side-summary-card-header">
          <div>
            <h2 className="workspace-side-summary-title">{props.selectedRootName}</h2>
            <p className="workspace-side-summary-path">{repoRoot}</p>
          </div>
          <button
            type="button"
            className="workspace-diff-sidebar-close"
            aria-label="刷新概览"
            disabled={props.controller.loading}
            onClick={() => void props.onRefresh()}
          >
            <GitRefreshIcon className="workspace-diff-sidebar-close-icon" />
          </button>
        </div>
        <dl className="workspace-side-summary-grid">
          <div>
            <dt>分支</dt>
            <dd>{branchName}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{statusText}</dd>
          </div>
          <div>
            <dt>当前审查</dt>
            <dd>{props.diffSummary.files} 个文件</dd>
          </div>
          <div>
            <dt>行变更</dt>
            <dd>
              <span className="workspace-diff-sidebar-summary-add">+{props.diffSummary.additions}</span>
              <span className="workspace-side-summary-separator"> / </span>
              <span className="workspace-diff-sidebar-summary-delete">-{props.diffSummary.deletions}</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ResizeHandle(props: {
  readonly onMouseDown?: (event: ReactMouseEvent) => void;
  readonly active: boolean;
}): JSX.Element | null {
  if (props.onMouseDown === undefined) {
    return null;
  }
  const className = props.active
    ? "workspace-diff-sidebar-resize workspace-diff-sidebar-resize-active"
    : "workspace-diff-sidebar-resize";
  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动以调整差异面板宽度"
      onMouseDown={props.onMouseDown}
    />
  );
}

async function refreshSidebar(
  controller: WorkspaceGitController,
  refreshViewer: () => Promise<void>,
): Promise<void> {
  await controller.refresh();
  await refreshViewer();
}

export function WorkspaceDiffSidebar(props: WorkspaceDiffSidebarProps): JSX.Element | null {
  const [scope, setScope] = useDiffScope(props.open, props.controller);
  const [activeTab, setActiveTab] = useState<WorkspaceSidePanelTab>("review");
  const [browserTabOpen, setBrowserTabOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const viewState = getGitViewState(props.selectedRootName, props.controller);
  const diffViewer = useWorkspaceDiffViewer({
    enabled: props.open,
    hostBridge: props.hostBridge,
    repoPath: props.selectedRootPath,
    scope,
    status: props.controller.status,
  });
  const busy = props.controller.loading || props.controller.pendingAction !== null;
  const expanded = props.expanded ?? false;
  const diffStyle = props.diffStyle ?? "unified";
  const effectiveDiffStyle = expanded ? diffStyle : "unified";
  const canResize = (props.canResize ?? true) && !expanded;
  const isResizing = props.isResizing ?? false;
  const selectedDiffPath = props.selectedDiffPath ?? null;
  const { onDiffItemsChange, onSelectDiffPath } = props;
  const refreshReview = useCallback(
    () => refreshSidebar(props.controller, diffViewer.refresh),
    [diffViewer.refresh, props.controller],
  );

  useEffect(() => {
    onDiffItemsChange?.(diffViewer.items);
  }, [diffViewer.items, onDiffItemsChange]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    if (selectedDiffPath !== null && diffViewer.items.some((item) => item.path === selectedDiffPath)) {
      return;
    }
    const next = diffViewer.items[0]?.path ?? null;
    onSelectDiffPath?.(next);
  }, [diffViewer.items, expanded, onSelectDiffPath, selectedDiffPath]);

  const handleSelectFile = useCallback(
    (path: string) => {
      onSelectDiffPath?.(path);
    },
    [onSelectDiffPath],
  );

  const handleOpenFile = useCallback(async () => {
    setActionError(null);
    try {
      const selection = await openDialog({
        title: "打开文件",
        multiple: false,
        directory: false,
        defaultPath: props.selectedRootPath ?? undefined,
      });
      const path = resolveDialogPath(selection);
      if (path === null) {
        return;
      }
      await props.hostBridge.app.openFileInEditor({ path });
    } catch (error) {
      setActionError(`打开文件失败：${toErrorMessage(error)}`);
    }
  }, [props.hostBridge.app, props.selectedRootPath]);

  const handleOpenBrowserTab = useCallback(() => {
    setActionError(null);
    setBrowserTabOpen(true);
    setActiveTab("browser");
  }, []);

  const handleCloseBrowserTab = useCallback(() => {
    setActionError(null);
    setBrowserTabOpen(false);
    setActiveTab((currentTab) => (currentTab === "browser" ? "review" : currentTab));
  }, []);

  const handleSelectTab = useCallback((tab: WorkspaceSidePanelTab) => {
    setActionError(null);
    if (tab === "browser") {
      setBrowserTabOpen(true);
    }
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (!props.open || props.selectedRootPath === null) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        void handleOpenFile();
      }
      if (key === "t") {
        event.preventDefault();
        handleOpenBrowserTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenBrowserTab, handleOpenFile, props.open, props.selectedRootPath]);

  if (!props.open || props.selectedRootPath === null) {
    return null;
  }
  const asideClass = expanded
    ? "workspace-diff-sidebar workspace-diff-sidebar-open workspace-diff-sidebar-expanded"
    : "workspace-diff-sidebar workspace-diff-sidebar-open";
  const reviewContent = viewState !== null ? (
    <>
      <DiffReviewToolbar
        controller={props.controller}
        additions={0}
        deletions={0}
        files={0}
        loading={props.controller.loading}
        onRefresh={props.controller.refresh}
        diffStyle={effectiveDiffStyle}
        onToggleDiffStyle={props.onToggleDiffStyle}
        allowDiffStyleToggle={expanded}
      />
      <DiffSidebarState viewState={viewState} />
    </>
  ) : (
    <>
      <DiffReviewToolbar
        controller={props.controller}
        additions={diffViewer.summary.additions}
        deletions={diffViewer.summary.deletions}
        files={diffViewer.summary.files}
        loading={diffViewer.loading}
        scope={scope}
        onRefresh={refreshReview}
        onScopeChange={setScope}
        diffStyle={effectiveDiffStyle}
        onToggleDiffStyle={props.onToggleDiffStyle}
        allowDiffStyleToggle={expanded}
      />
      <div className="workspace-diff-sidebar-content workspace-diff-sidebar-content-stream">
        {props.controller.notice !== null ? (
          <div className={props.controller.notice.kind === "success" ? "git-banner git-banner-success" : "git-banner git-banner-error"}>
            {props.controller.notice.text}
          </div>
        ) : null}
        {expanded ? (
          <WorkspaceDiffFileList
            items={diffViewer.items}
            onSelect={handleSelectFile}
            selectedDiffPath={selectedDiffPath}
            showSectionLabel={scope === "all"}
          />
        ) : (
          <WorkspaceDiffViewer
            busy={busy}
            error={diffViewer.error}
            items={diffViewer.items}
            loading={diffViewer.loading}
            onDiscardPaths={props.controller.discardPaths}
            onStagePaths={props.controller.stagePaths}
            onUnstagePaths={props.controller.unstagePaths}
            showSectionLabel={scope === "all"}
            viewStyle={effectiveDiffStyle}
          />
        )}
      </div>
    </>
  );
  const activeContent = activeTab === "summary" ? (
    <SidePanelSummary
      selectedRootName={props.selectedRootName}
      selectedRootPath={props.selectedRootPath}
      controller={props.controller}
      diffSummary={diffViewer.summary}
      onRefresh={refreshReview}
    />
  ) : activeTab === "browser" ? (
    <BrowserSidebarPanel active={props.open && activeTab === "browser"} hostBridge={props.hostBridge} />
  ) : reviewContent;

  return (
    <aside className={asideClass} aria-label="工作区侧边栏">
      <ResizeHandle onMouseDown={canResize ? props.onResizeStart : undefined} active={isResizing} />
      <SidePanelHeader
        activeTab={activeTab}
        browserTabOpen={browserTabOpen}
        expanded={expanded}
        onSelectTab={handleSelectTab}
        onOpenFile={() => void handleOpenFile()}
        onOpenBrowser={handleOpenBrowserTab}
        onCloseBrowserTab={handleCloseBrowserTab}
        onClose={props.onClose}
        onToggleExpanded={props.onToggleExpanded}
      />
      {actionError === null ? null : (
        <div className="workspace-side-panel-action-error" role="alert">
          {actionError}
        </div>
      )}
      {activeContent}
    </aside>
  );
}
