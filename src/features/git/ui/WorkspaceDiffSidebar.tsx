import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GitWorkspaceDiffOutput, HostBridge } from "../../../bridge/types";
import type { FuzzyFileSearchResponse } from "../../../protocol/generated/FuzzyFileSearchResponse";
import type { FuzzyFileSearchResult } from "../../../protocol/generated/FuzzyFileSearchResult";
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
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

type WorkspaceSidePanelTab = "review" | "browser";
type BrowserOpenRequest = { readonly id: number; readonly url: string | null };

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
  readonly browserOpenRequest?: BrowserOpenRequest | null;
  readonly onResizeStart?: (event: ReactMouseEvent) => void;
  readonly canResize?: boolean;
  readonly isResizing?: boolean;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFuzzyFileSearchResponse(value: unknown): value is FuzzyFileSearchResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Array.isArray((value as { readonly files?: unknown }).files);
}

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

function resolveProjectFilePath(file: FuzzyFileSearchResult): string {
  if (isAbsolutePath(file.path)) {
    return file.path;
  }
  const separator = file.root.includes("\\") ? "\\" : "/";
  const root = file.root.replace(/[\\/]+$/, "");
  const relativePath = file.path.replace(/^[\\/]+/, "");
  return `${root}${separator}${relativePath}`;
}

function ReviewTabIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 6.9v6.2M6.9 10h6.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
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
          const TabIcon = tab.id === "review" ? ReviewTabIcon : null;
          const tabButton = (
            <button
              key={tab.id}
              type="button"
              className={active ? "workspace-side-panel-tab workspace-side-panel-tab-active" : "workspace-side-panel-tab"}
              role="tab"
              aria-selected={active}
              onClick={() => props.onSelectTab(tab.id)}
            >
              {tab.id === "browser" ? <SidebarIcon kind="browser" /> : TabIcon === null ? null : <TabIcon className="workspace-side-panel-tab-icon" />}
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

function ProjectFileSearchDialog(props: {
  readonly open: boolean;
  readonly hostBridge: HostBridge;
  readonly rootPath: string;
  readonly onClose: () => void;
  readonly onOpenFile: (path: string) => Promise<void>;
}): JSX.Element | null {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReadonlyArray<FuzzyFileSearchResult>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!props.open) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(0);
      return;
    }
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) {
      return undefined;
    }
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSelectedIndex(0);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timeoutId = window.setTimeout(() => {
      void props.hostBridge.rpc.request({
        method: "fuzzyFileSearch",
        params: {
          query: trimmedQuery,
          roots: [props.rootPath],
          cancellationToken: null,
        },
      }).then((response) => {
        if (cancelled) {
          return;
        }
        if (!isFuzzyFileSearchResponse(response.result)) {
          throw new Error("文件搜索返回数据格式不正确");
        }
        setResults(response.result.files.filter((file) => file.match_type === "file").slice(0, 24));
        setSelectedIndex(0);
        setLoading(false);
      }).catch((searchError) => {
        if (cancelled) {
          return;
        }
        setResults([]);
        setSelectedIndex(0);
        setLoading(false);
        setError(toErrorMessage(searchError));
      });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [props.hostBridge.rpc, props.open, props.rootPath, query]);

  if (!props.open || typeof document === "undefined") {
    return null;
  }

  const trimmedQuery = query.trim();
  const statusText = trimmedQuery.length === 0
    ? null
    : loading
      ? "搜索中…"
      : error !== null
        ? error
        : results.length === 0
          ? "没有匹配文件"
          : null;

  const openResult = (file: FuzzyFileSearchResult) => {
    void props.onOpenFile(resolveProjectFilePath(file));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && results[selectedIndex] !== undefined) {
      event.preventDefault();
      openResult(results[selectedIndex]);
    }
  };

  return createPortal(
    <div className="workspace-file-search-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="workspace-file-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="搜索文件"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="workspace-file-search-title">搜索文件</h2>
        <label className="workspace-file-search-field">
          <span>文件</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="输入内容搜索文件"
            aria-label="输入内容搜索文件"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        {statusText === null ? null : (
          <div className="workspace-file-search-status" role={error !== null ? "alert" : undefined}>
            {statusText}
          </div>
        )}
        {results.length === 0 ? null : (
          <ul className="workspace-file-search-results" role="list">
            {results.map((file, index) => {
              const className = index === selectedIndex
                ? "workspace-file-search-result workspace-file-search-result-active"
                : "workspace-file-search-result";
              return (
                <li key={`${file.root}:${file.path}`}>
                  <button
                    type="button"
                    className={className}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => openResult(file)}
                  >
                    <span className="workspace-file-search-result-name">{file.file_name}</span>
                    <span className="workspace-file-search-result-path">{file.path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>,
    document.body,
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
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
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

  useEffect(() => {
    if (!expanded || selectedDiffPath === null) {
      return;
    }
    const selectedItem = diffViewer.items.find((item) => item.path === selectedDiffPath);
    if (selectedItem === undefined) {
      return;
    }
    if (selectedItem.diffLoaded === true || selectedItem.diff.length > 0 || selectedItem.diffLoading === true) {
      return;
    }
    void diffViewer.loadDiff(selectedItem);
  }, [diffViewer.items, diffViewer.loadDiff, expanded, selectedDiffPath]);

  const handleSelectFile = useCallback(
    (path: string) => {
      onSelectDiffPath?.(path);
    },
    [onSelectDiffPath],
  );

  const handleOpenFile = useCallback(() => {
    setActionError(null);
    setFileSearchOpen(true);
  }, []);

  const handleOpenProjectFile = useCallback(async (path: string) => {
    setActionError(null);
    try {
      await props.hostBridge.app.openFileInEditor({ path });
      setFileSearchOpen(false);
    } catch (error) {
      setActionError(`打开文件失败：${toErrorMessage(error)}`);
    }
  }, [props.hostBridge.app]);

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
    if (!props.open || props.browserOpenRequest === undefined || props.browserOpenRequest === null) {
      return;
    }
    setActionError(null);
    setBrowserTabOpen(true);
    setActiveTab("browser");
  }, [props.browserOpenRequest?.id, props.open]);

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
        handleOpenFile();
      }
      if (key === "t") {
        event.preventDefault();
        handleOpenBrowserTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenBrowserTab, handleOpenFile, props.open, props.selectedRootPath]);

  useEffect(() => {
    if (!props.open || props.selectedRootPath === null) {
      setFileSearchOpen(false);
    }
  }, [props.open, props.selectedRootPath]);

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
            onLoadDiff={diffViewer.loadDiff}
            onStagePaths={props.controller.stagePaths}
            onUnstagePaths={props.controller.unstagePaths}
            showSectionLabel={scope === "all"}
            viewStyle={effectiveDiffStyle}
          />
        )}
      </div>
    </>
  );
  const activeContent = activeTab === "browser" ? (
    <BrowserSidebarPanel
      active={props.open && activeTab === "browser"}
      hostBridge={props.hostBridge}
      openRequest={props.browserOpenRequest ?? null}
    />
  ) : reviewContent;

  return (
    <aside className={asideClass} aria-label="工作区侧边栏">
      <ResizeHandle onMouseDown={canResize ? props.onResizeStart : undefined} active={isResizing} />
      <SidePanelHeader
        activeTab={activeTab}
        browserTabOpen={browserTabOpen}
        expanded={expanded}
        onSelectTab={handleSelectTab}
        onOpenFile={handleOpenFile}
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
      <ProjectFileSearchDialog
        open={fileSearchOpen}
        hostBridge={props.hostBridge}
        rootPath={props.selectedRootPath}
        onClose={() => setFileSearchOpen(false)}
        onOpenFile={handleOpenProjectFile}
      />
      {activeContent}
    </aside>
  );
}
