import { useCallback, useMemo, useState } from "react";
import { parseUnifiedDiffCached } from "../../git/model/diffPreviewModel";
import { GitDiffCodeView } from "../../git/ui/GitDiffCodeView";
import {
  GitChevronDownIcon,
  GitChevronUpIcon,
  GitDiffCollapseIcon,
  GitDiffExpandIcon,
  GitRestoreIcon,
  GitArrowUpIcon,
} from "../../git/ui/gitIcons";
import { parseTurnDiffDetails, type TurnDiffFileDetails } from "../model/turnDiffSummaryModel";

interface TurnDiffSummaryListProps {
  readonly diffText: string;
  readonly showHeader?: boolean;
}

export function TurnDiffSummaryList(props: TurnDiffSummaryListProps): JSX.Element {
  const summary = useMemo(() => parseTurnDiffDetails(props.diffText), [props.diffText]);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const allExpanded = summary.files.length > 0 && summary.files.every((file) => expandedPaths.has(file.path));

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setExpandedPaths((current) => {
      const nextAllExpanded = summary.files.length > 0 && summary.files.every((file) => current.has(file.path));
      return nextAllExpanded ? new Set() : new Set(summary.files.map((file) => file.path));
    });
  }, [summary.files]);

  if (summary.files.length === 0) {
    return <p className="home-turn-diff-summary-empty">未检测到文件变更</p>;
  }

  return (
    <div className="home-turn-diff-summary">
      {props.showHeader !== false ? (
        <div className="home-turn-diff-summary-header">
          <div className="home-turn-diff-summary-title-wrap">
            <span className="home-turn-diff-summary-title">{formatFileCount(summary.files.length)}</span>
            <DiffCountBadge additions={summary.additions} deletions={summary.deletions} />
          </div>
          <div className="home-turn-diff-summary-actions" aria-label="diff 操作">
            <span className="home-turn-diff-summary-action home-turn-diff-summary-action-disabled" aria-disabled="true" title="请在工作区变更面板中撤销">
              <span>撤销</span>
              <GitRestoreIcon className="home-turn-diff-summary-action-icon" />
            </span>
            <span className="home-turn-diff-summary-action home-turn-diff-summary-action-disabled" aria-disabled="true" title="请在工作区变更面板中审核">
              <span>审核</span>
              <GitArrowUpIcon className="home-turn-diff-summary-action-icon" />
            </span>
            <button
              type="button"
              className="home-turn-diff-summary-action home-turn-diff-summary-icon-action"
              aria-label={allExpanded ? "折叠全部 diff" : "展开全部 diff"}
              title={allExpanded ? "折叠全部 diff" : "展开全部 diff"}
              onClick={toggleAll}
            >
              {allExpanded ? (
                <GitDiffCollapseIcon className="home-turn-diff-summary-action-icon" />
              ) : (
                <GitDiffExpandIcon className="home-turn-diff-summary-action-icon" />
              )}
            </button>
          </div>
        </div>
      ) : null}
      <div className="home-turn-diff-summary-list" role="list">
        {summary.files.map((file) => (
          <DiffSummaryRow
            key={file.path}
            file={file}
            expanded={expandedPaths.has(file.path)}
            onToggle={togglePath}
          />
        ))}
      </div>
    </div>
  );
}

function DiffSummaryRow(props: {
  readonly file: TurnDiffFileDetails;
  readonly expanded: boolean;
  readonly onToggle: (path: string) => void;
}): JSX.Element {
  const parsed = useMemo(() => parseUnifiedDiffCached(props.file.diff), [props.file.diff]);
  const ChevronIcon = props.expanded ? GitChevronUpIcon : GitChevronDownIcon;
  return (
    <div className="home-turn-diff-summary-row" data-expanded={props.expanded ? "true" : undefined} role="listitem">
      <button
        type="button"
        className="home-turn-diff-summary-row-trigger"
        aria-expanded={props.expanded}
        aria-label={props.expanded ? `折叠 ${props.file.path}` : `展开 ${props.file.path}`}
        onClick={() => props.onToggle(props.file.path)}
      >
        <span className="home-turn-diff-summary-row-title" title={props.file.path}>{props.file.path}</span>
        <DiffCountBadge additions={props.file.additions} deletions={props.file.deletions} showDot />
        <ChevronIcon className="home-turn-diff-summary-row-chevron" />
      </button>
      {props.expanded ? (
        <div className="home-turn-diff-summary-row-body">
          <GitDiffCodeView parsed={parsed} path={props.file.path} wordWrap richPreview wordDiff={false} />
        </div>
      ) : null}
    </div>
  );
}

function DiffCountBadge(props: { readonly additions: number; readonly deletions: number; readonly showDot?: boolean }): JSX.Element {
  const dotKind = props.additions > 0 ? "add" : props.deletions > 0 ? "delete" : "neutral";
  return (
    <span className="workspace-diff-file-row-summary" aria-label={`新增 ${props.additions} 行，删除 ${props.deletions} 行`}>
      <span className="workspace-diff-file-summary-add">+{props.additions}</span>
      <span className="workspace-diff-file-summary-delete">-{props.deletions}</span>
      {props.showDot === true ? <span className="home-turn-diff-summary-dot" data-kind={dotKind} aria-hidden="true" /> : null}
    </span>
  );
}

function formatFileCount(count: number): string {
  return `${count} 个文件已更改`;
}
