import { useMemo } from "react";
import { parseTurnDiffSummary } from "../model/turnDiffSummaryModel";

interface TurnDiffSummaryListProps {
  readonly diffText: string;
  readonly showHeader?: boolean;
}

export function TurnDiffSummaryList(props: TurnDiffSummaryListProps): JSX.Element {
  const summary = useMemo(() => parseTurnDiffSummary(props.diffText), [props.diffText]);

  if (summary.files.length === 0) {
    return <p className="home-turn-diff-summary-empty">未检测到文件变更</p>;
  }

  return (
    <div className="home-turn-diff-summary">
      {props.showHeader !== false ? (
        <div className="home-turn-diff-summary-header">
          <span className="home-turn-diff-summary-title">{formatFileCount(summary.files.length)}</span>
          <DiffCountBadge additions={summary.additions} deletions={summary.deletions} />
        </div>
      ) : null}
      <div className="home-turn-diff-summary-list" role="list">
        {summary.files.map((file) => (
          <DiffSummaryRow key={file.path} path={file.path} additions={file.additions} deletions={file.deletions} />
        ))}
      </div>
    </div>
  );
}

function DiffSummaryRow(props: { readonly path: string; readonly additions: number; readonly deletions: number }): JSX.Element {
  return (
    <div className="home-turn-diff-summary-row" role="listitem">
      <span className="home-turn-diff-summary-row-title" title={props.path}>{props.path}</span>
      <DiffCountBadge additions={props.additions} deletions={props.deletions} />
    </div>
  );
}

function DiffCountBadge(props: { readonly additions: number; readonly deletions: number }): JSX.Element {
  return (
    <span className="workspace-diff-file-row-summary" aria-label={`新增 ${props.additions} 行，删除 ${props.deletions} 行`}>
      <span className="workspace-diff-file-summary-add">+{props.additions}</span>
      <span className="workspace-diff-file-summary-delete">-{props.deletions}</span>
    </span>
  );
}

function formatFileCount(count: number): string {
  return `${count} 个文件已更改`;
}
