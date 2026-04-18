import { useCallback, useEffect, useState } from "react";
import type { GitWorkspaceDiffOutput, HostBridge } from "../../../bridge/types";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";
import { OfficialCloseIcon } from "../../shared/ui/officialIcons";
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

interface DiffSidebarHeaderProps {
  readonly controller: WorkspaceGitController;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly loading: boolean;
  readonly scope?: GitChangeScope;
  readonly onRefresh: () => Promise<void>;
  readonly onScopeChange?: (scope: GitChangeScope) => void;
  readonly onClose: () => void;
  readonly expanded?: boolean;
  readonly onToggleExpanded?: () => void;
  readonly diffStyle?: DiffViewStyle;
  readonly onToggleDiffStyle?: () => void;
  readonly allowDiffStyleToggle?: boolean;
}

function DiffSidebarHeader(props: DiffSidebarHeaderProps): JSX.Element {
  const options = getGitChangeScopeOptions(props.controller);
  const showSelector = props.scope !== undefined && props.onScopeChange !== undefined && options.length > 0;
  const diffStyle = props.diffStyle ?? "unified";
  const expanded = props.expanded ?? false;
  const diffStyleLabel = diffStyle === "split" ? "切换为统一差异" : "切换为拆分差异";
  const DiffStyleIcon = diffStyle === "split" ? GitDiffUnifiedViewIcon : GitDiffSplitViewIcon;
  const expandLabel = expanded ? "收起差异预览面板" : "展开差异预览到对话区";
  const ExpandIcon = expanded ? GitDiffCollapseIcon : GitDiffExpandIcon;
  const allowDiffStyleToggle = props.allowDiffStyleToggle ?? false;
  return (
    <header className="workspace-diff-sidebar-header">
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
        {props.onToggleExpanded === undefined ? null : (
          <button
            type="button"
            className="workspace-diff-sidebar-close"
            aria-label={expandLabel}
            aria-pressed={expanded}
            title={expandLabel}
            onClick={props.onToggleExpanded}
          >
            <ExpandIcon className="workspace-diff-sidebar-close-icon" />
          </button>
        )}
        <button type="button" className="workspace-diff-sidebar-close" aria-label="刷新差异" onClick={() => void props.onRefresh()}>
          <GitRefreshIcon className="workspace-diff-sidebar-close-icon" />
        </button>
        <button type="button" className="workspace-diff-sidebar-close" aria-label="关闭差异侧栏" onClick={props.onClose}>
          <OfficialCloseIcon className="workspace-diff-sidebar-close-icon" />
        </button>
      </div>
    </header>
  );
}

function DiffSidebarState(props: { readonly viewState: GitViewState }): JSX.Element {
  return (
    <div className="workspace-diff-sidebar-content">
      <GitStateCard {...props.viewState} className="git-state-card workspace-diff-sidebar-state-card" />
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

  if (!props.open || props.selectedRootPath === null) {
    return null;
  }
  const asideClass = expanded
    ? "workspace-diff-sidebar workspace-diff-sidebar-open workspace-diff-sidebar-expanded"
    : "workspace-diff-sidebar workspace-diff-sidebar-open";
  if (viewState !== null) {
    return (
      <aside className={asideClass} aria-label="工作区差异侧栏">
        <ResizeHandle onMouseDown={canResize ? props.onResizeStart : undefined} active={isResizing} />
        <DiffSidebarHeader
          controller={props.controller}
          additions={0}
          deletions={0}
          files={0}
          loading={props.controller.loading}
          onRefresh={props.controller.refresh}
          onClose={props.onClose}
          expanded={expanded}
          onToggleExpanded={props.onToggleExpanded}
          diffStyle={effectiveDiffStyle}
          onToggleDiffStyle={props.onToggleDiffStyle}
          allowDiffStyleToggle={expanded}
        />
        <DiffSidebarState viewState={viewState} />
      </aside>
    );
  }
  return (
    <aside className={asideClass} aria-label="工作区差异侧栏">
      <ResizeHandle onMouseDown={canResize ? props.onResizeStart : undefined} active={isResizing} />
      <DiffSidebarHeader
        controller={props.controller}
        additions={diffViewer.summary.additions}
        deletions={diffViewer.summary.deletions}
        files={diffViewer.summary.files}
        loading={diffViewer.loading}
        scope={scope}
        onRefresh={() => refreshSidebar(props.controller, diffViewer.refresh)}
        onScopeChange={setScope}
        onClose={props.onClose}
        expanded={expanded}
        onToggleExpanded={props.onToggleExpanded}
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
    </aside>
  );
}
