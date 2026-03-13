import { useMemo } from "react";
import { parseUnifiedDiff } from "../model/diffPreviewModel";
import type { GitChangeEntryData, GitChangeScope, GitChangeSectionData } from "./GitChangeBrowser";
import { createGitDiffKey } from "../model/gitDiffKey";
import { getSelectedDiffKey } from "../model/gitViewState";
import type { WorkspaceGitController } from "../model/types";

interface GitDiffFileListProps {
  readonly controller: WorkspaceGitController;
  readonly scope: GitChangeScope;
  readonly scopeLabel: string;
  readonly sections: ReadonlyArray<GitChangeSectionData>;
}

function getEntryTitle(path: string, originalPath: string | null): string {
  if (originalPath === null) {
    return path;
  }
  return `${originalPath} → ${path}`;
}

function getEmptyStateTitle(scope: GitChangeScope, scopeLabel: string): string {
  if (scope === "all") {
    return "暂无代码变更";
  }
  return `当前没有${scopeLabel}变更`;
}

function createDiffMetrics(controller: WorkspaceGitController): Readonly<Record<string, ReturnType<typeof parseUnifiedDiff>>> {
  return Object.fromEntries(
    Object.entries(controller.diffCache).map(([diffKey, diff]) => [diffKey, parseUnifiedDiff(diff.diff)])
  );
}

function DiffSummary(props: {
  readonly diffKey: string;
  readonly controller: WorkspaceGitController;
  readonly diffMetrics: Readonly<Record<string, ReturnType<typeof parseUnifiedDiff>>>;
}): JSX.Element {
  const parsedDiff = props.diffMetrics[props.diffKey];
  if (parsedDiff !== undefined) {
    return (
      <span className="workspace-diff-file-row-summary" aria-label={`新增 ${parsedDiff.additions} 行，删除 ${parsedDiff.deletions} 行`}>
        <span className="workspace-diff-file-summary-add">+{parsedDiff.additions}</span>
        <span className="workspace-diff-file-summary-delete">-{parsedDiff.deletions}</span>
      </span>
    );
  }

  if (props.controller.loadingDiffKeys.includes(props.diffKey)) {
    return <span className="workspace-diff-file-row-summary workspace-diff-file-row-summary-pending">加载中…</span>;
  }

  return <span className="workspace-diff-file-row-summary workspace-diff-file-row-summary-pending">等待计算…</span>;
}

function GitDiffFileRow(props: {
  readonly controller: WorkspaceGitController;
  readonly section: GitChangeSectionData;
  readonly entryData: GitChangeEntryData;
  readonly diffMetrics: Readonly<Record<string, ReturnType<typeof parseUnifiedDiff>>>;
}): JSX.Element {
  const diffKey = createGitDiffKey(props.entryData.entry.path, props.section.staged);
  const selectedDiffKey = getSelectedDiffKey(props.controller);
  const title = getEntryTitle(props.entryData.entry.path, props.entryData.entry.originalPath);
  const className = selectedDiffKey === diffKey ? "workspace-diff-file-row workspace-diff-file-row-active" : "workspace-diff-file-row";

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      onClick={() => void props.controller.selectDiff(props.entryData.entry.path, props.section.staged)}
    >
      <span className="workspace-diff-file-row-title">{title}</span>
      <DiffSummary diffKey={diffKey} controller={props.controller} diffMetrics={props.diffMetrics} />
    </button>
  );
}

function GitDiffSection(props: {
  readonly controller: WorkspaceGitController;
  readonly scope: GitChangeScope;
  readonly section: GitChangeSectionData;
  readonly diffMetrics: Readonly<Record<string, ReturnType<typeof parseUnifiedDiff>>>;
}): JSX.Element {
  return (
    <section className="workspace-diff-file-group">
      {props.scope === "all" ? <div className="workspace-diff-file-group-title">{props.section.label}</div> : null}
      <div className="workspace-diff-file-group-list">
        {props.section.entries.map((entryData) => (
          <GitDiffFileRow
            key={`${props.section.mode}:${entryData.entry.path}`}
            controller={props.controller}
            section={props.section}
            entryData={entryData}
            diffMetrics={props.diffMetrics}
          />
        ))}
      </div>
    </section>
  );
}

function GitDiffEmptyState(props: { readonly scope: GitChangeScope; readonly scopeLabel: string }): JSX.Element {
  return (
    <div className="workspace-diff-empty-state">
      <h3 className="workspace-diff-empty-title">{getEmptyStateTitle(props.scope, props.scopeLabel)}</h3>
      <p className="workspace-diff-empty-body">代码变更会显示在这里</p>
    </div>
  );
}

export function GitDiffFileList(props: GitDiffFileListProps): JSX.Element | null {
  const diffMetrics = useMemo(() => createDiffMetrics(props.controller), [props.controller.diffCache]);
  if (props.controller.status === null) {
    return null;
  }
  if (props.sections.length === 0) {
    return <GitDiffEmptyState scope={props.scope} scopeLabel={props.scopeLabel} />;
  }

  return (
    <div className="workspace-diff-file-list-pane">
      {props.sections.map((section) => (
        <GitDiffSection key={section.mode} controller={props.controller} scope={props.scope} section={section} diffMetrics={diffMetrics} />
      ))}
    </div>
  );
}
