import {
  collapseDiffRows,
  parseUnifiedDiff,
  type CollapsedDiffRow,
  type DiffDisplayRow,
  type ParsedDiffFile,
  type ParsedDiffHunk,
  type ParsedDiffLine
} from "../model/diffPreviewModel";
import { HighlightedCodeContent } from "./diffCodeHighlight";

interface GitDiffCodeViewProps {
  readonly diff?: string;
  readonly parsed?: ParsedDiffFile;
  readonly path?: string;
}

function formatLineNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function getRowClassName(row: DiffDisplayRow): string {
  if (row.kind === "collapsed") {
    return "workspace-diff-code-row workspace-diff-code-row-collapsed";
  }
  if (row.kind === "add") {
    return "workspace-diff-code-row workspace-diff-code-row-add";
  }
  if (row.kind === "delete") {
    return "workspace-diff-code-row workspace-diff-code-row-delete";
  }
  if (row.kind === "meta") {
    return "workspace-diff-code-row workspace-diff-code-row-meta";
  }
  return "workspace-diff-code-row";
}

function DiffCodeLineNumbers(props: { readonly row: ParsedDiffLine | CollapsedDiffRow }): JSX.Element {
  return (
    <>
      <span className="workspace-diff-line-number">{formatLineNumber(props.row.oldLine)}</span>
      <span className="workspace-diff-line-number">{formatLineNumber(props.row.newLine)}</span>
    </>
  );
}

function CollapsedDiffRowView(props: { readonly row: CollapsedDiffRow }): JSX.Element {
  return (
    <div className={getRowClassName(props.row)}>
      <DiffCodeLineNumbers row={props.row} />
      <div className="workspace-diff-collapsed-pill">{props.row.count} unmodified lines</div>
    </div>
  );
}

function ParsedDiffRowView(props: { readonly row: ParsedDiffLine; readonly path?: string }): JSX.Element {
  return (
    <div className={getRowClassName(props.row)}>
      <DiffCodeLineNumbers row={props.row} />
      <HighlightedCodeContent className="workspace-diff-code-content" content={props.row.content} path={props.path} />
    </div>
  );
}

function DiffCodeRow(props: { readonly row: DiffDisplayRow; readonly path?: string }): JSX.Element {
  if (props.row.kind === "collapsed") {
    return <CollapsedDiffRowView row={props.row} />;
  }
  return <ParsedDiffRowView row={props.row} path={props.path} />;
}

function HunkHeader(props: { readonly hunk: ParsedDiffHunk }): JSX.Element | null {
  if (props.hunk.sectionTitle.length === 0) {
    return null;
  }
  return <div className="workspace-diff-hunk-header">{props.hunk.sectionTitle}</div>;
}

function HunkBody(props: { readonly hunk: ParsedDiffHunk; readonly path?: string }): JSX.Element {
  const rows = collapseDiffRows(props.hunk.lines);
  return (
    <div className="workspace-diff-hunk-body">
      {rows.map((row, index) => (
        <DiffCodeRow key={`${props.hunk.header}:${index}`} row={row} path={props.path} />
      ))}
    </div>
  );
}

function DiffHunkView(props: { readonly hunk: ParsedDiffHunk; readonly path?: string }): JSX.Element {
  return (
    <section className="workspace-diff-hunk">
      <HunkHeader hunk={props.hunk} />
      <HunkBody hunk={props.hunk} path={props.path} />
    </section>
  );
}

function RawDiffFallback(props: { readonly parsed: ParsedDiffFile }): JSX.Element {
  return (
    <div className="workspace-diff-raw">
      <div className="workspace-diff-raw-note">当前 diff 暂时无法结构化展示，下面显示原始输出。</div>
      <pre className="workspace-diff-raw-content">{props.parsed.raw}</pre>
    </div>
  );
}

function StructuredDiff(props: { readonly parsed: ParsedDiffFile; readonly path?: string }): JSX.Element {
  return (
    <div className="workspace-diff-code-scroll" role="presentation">
      <div className="workspace-diff-code-surface">
        {props.parsed.hunks.map((hunk) => (
          <DiffHunkView key={hunk.header} hunk={hunk} path={props.path} />
        ))}
      </div>
    </div>
  );
}

export function GitDiffCodeView(props: GitDiffCodeViewProps): JSX.Element {
  const parsed = props.parsed ?? parseUnifiedDiff(props.diff ?? "");
  if (parsed.hunks.length === 0) {
    return <RawDiffFallback parsed={parsed} />;
  }
  return <StructuredDiff parsed={parsed} path={props.path} />;
}
