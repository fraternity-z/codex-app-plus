import { useEffect, useMemo, useState } from "react";
import { OfficialCloseIcon } from "../../shared/ui/officialIcons";
import { GitDiffFileList } from "./GitDiffFileList";
import { GitDiffPreviewPanel, type SelectedGitDiffFile } from "./GitDiffPreviewPanel";
import { getDefaultGitChangeScope, getGitChangeScopeOptions, type GitChangeScope, type GitChangeSectionData } from "./GitChangeBrowser";
import { GitStateCard } from "./GitStateCard";
import { GitDiffIcon, GitRefreshIcon } from "./gitIcons";
import { getGitViewState, type GitViewState } from "../model/gitViewState";
import type { WorkspaceGitController } from "../model/types";
import { isSameDiffTarget } from "../model/workspaceGitHelpers";
import { useWorkspaceDiffData, type WorkspaceDiffSummary } from "../hooks/useWorkspaceDiffData";
import { WorkspaceDiffScopeSelector } from "./WorkspaceDiffScopeSelector";

interface WorkspaceDiffSidebarProps {
  readonly open: boolean;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly controller: WorkspaceGitController;
  readonly onClose: () => void;
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

function flattenSections(sections: ReadonlyArray<GitChangeSectionData>): ReadonlyArray<SelectedGitDiffFile> {
  return sections.flatMap((section) =>
    section.entries.map(({ entry, mode }) => ({
      path: entry.path,
      title: entry.originalPath === null ? entry.path : `${entry.originalPath} → ${entry.path}`,
      mode,
      staged: section.staged
    }))
  );
}

function pickActiveFile(
  files: ReadonlyArray<SelectedGitDiffFile>,
  controller: WorkspaceGitController
): SelectedGitDiffFile | null {
  if (files.length === 0) {
    return null;
  }
  const currentTarget = controller.diffTarget;
  const matched = files.find((file) => isSameDiffTarget(currentTarget, { path: file.path, staged: file.staged }));
  return matched ?? files[0] ?? null;
}

function DiffChangeSummary(props: { readonly summary?: WorkspaceDiffSummary }): JSX.Element | null {
  if (props.summary === undefined || props.summary.files === 0) {
    return null;
  }
  if (props.summary.pending) {
    return <div className="workspace-diff-sidebar-summary workspace-diff-sidebar-summary-pending">更新中…</div>;
  }
  return (
    <div className="workspace-diff-sidebar-summary" aria-label={`当前分组新增 ${props.summary.additions} 行，删除 ${props.summary.deletions} 行`}>
      <span className="workspace-diff-sidebar-summary-add">+{props.summary.additions}</span>
      <span className="workspace-diff-sidebar-summary-delete">-{props.summary.deletions}</span>
    </div>
  );
}

function DiffSidebarHeader(props: {
  readonly controller: WorkspaceGitController;
  readonly scope?: GitChangeScope;
  readonly onScopeChange?: (scope: GitChangeScope) => void;
  readonly summary?: WorkspaceDiffSummary;
  readonly onClose: () => void;
}): JSX.Element {
  const options = getGitChangeScopeOptions(props.controller);
  const showSelector = props.scope !== undefined && props.onScopeChange !== undefined && options.length > 0;

  return (
    <header className="workspace-diff-sidebar-header">
      <div className="workspace-diff-sidebar-title-wrap">
        {showSelector ? (
          <>
            <WorkspaceDiffScopeSelector options={options} selectedScope={props.scope!} onChange={props.onScopeChange!} />
            <DiffChangeSummary summary={props.summary} />
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
        <button type="button" className="workspace-diff-sidebar-close" aria-label="刷新差异" onClick={() => void props.controller.refresh()}>
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

function getScopeLabel(controller: WorkspaceGitController, scope: GitChangeScope): string {
  return getGitChangeScopeOptions(controller).find((option) => option.scope === scope)?.label ?? "未暂存";
}

function DiffSidebarBody(props: {
  readonly controller: WorkspaceGitController;
  readonly scope: GitChangeScope;
  readonly sections: ReadonlyArray<GitChangeSectionData>;
}): JSX.Element {
  const visibleFiles = useMemo(() => flattenSections(props.sections), [props.sections]);
  const activeFile = useMemo(() => pickActiveFile(visibleFiles, props.controller), [props.controller, visibleFiles]);

  useEffect(() => {
    if (visibleFiles.length === 0) {
      if (props.controller.diffTarget !== null) {
        props.controller.clearDiff();
      }
      return;
    }
    if (activeFile === null) {
      return;
    }
    const nextTarget = { path: activeFile.path, staged: activeFile.staged };
    if (!isSameDiffTarget(props.controller.diffTarget, nextTarget)) {
      void props.controller.selectDiff(nextTarget.path, nextTarget.staged);
    }
  }, [activeFile, props.controller, visibleFiles]);

  return (
    <div className="workspace-diff-sidebar-content workspace-diff-sidebar-content-stream">
      {props.controller.notice !== null ? (
        <div className={props.controller.notice.kind === "success" ? "git-banner git-banner-success" : "git-banner git-banner-error"}>
          {props.controller.notice.text}
        </div>
      ) : null}
      <div className="workspace-diff-layout">
        <GitDiffFileList controller={props.controller} scope={props.scope} scopeLabel={getScopeLabel(props.controller, props.scope)} sections={props.sections} />
        <GitDiffPreviewPanel controller={props.controller} selectedFile={activeFile} />
      </div>
    </div>
  );
}

export function WorkspaceDiffSidebar(props: WorkspaceDiffSidebarProps): JSX.Element | null {
  const [scope, setScope] = useDiffScope(props.open, props.controller);
  const viewState = getGitViewState(props.selectedRootName, props.controller);
  const diffData = useWorkspaceDiffData(props.controller, scope, props.open && props.selectedRootPath !== null && viewState === null);

  if (!props.open || props.selectedRootPath === null) {
    return null;
  }

  return (
    <aside className="workspace-diff-sidebar workspace-diff-sidebar-open" aria-label="工作区差异侧栏">
      <DiffSidebarHeader
        controller={props.controller}
        scope={viewState === null ? scope : undefined}
        onScopeChange={viewState === null ? setScope : undefined}
        summary={viewState === null ? diffData.summary : undefined}
        onClose={props.onClose}
      />
      {viewState !== null ? <DiffSidebarState viewState={viewState} /> : <DiffSidebarBody controller={props.controller} scope={scope} sections={diffData.sections} />}
    </aside>
  );
}
