import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import type { PatchChangeKind } from "../../../protocol/generated/v2/PatchChangeKind";
import { parseUnifiedDiffCached, type ParsedDiffFile } from "../../git/model/diffPreviewModel";
import { GitDiffCodeView } from "../../git/ui/GitDiffCodeView";
import { getFileChangeDisplayName } from "../model/fileChangeSummary";

interface HomeAssistantTranscriptFileDiffPanelProps {
  readonly label: string;
  readonly changes: ReadonlyArray<FileUpdateChange>;
  readonly footerStatus: string | null;
}

export function HomeAssistantTranscriptFileDiffPanel(
  props: HomeAssistantTranscriptFileDiffPanelProps,
): JSX.Element {
  const hasFooter = props.footerStatus !== null;
  return (
    <div className="home-assistant-transcript-detail-panel" data-variant="fileDiff">
      {hasFooter ? (
        <div className="home-assistant-transcript-detail-header">
          <span className="home-assistant-transcript-detail-label">{props.label}</span>
        </div>
      ) : null}
      <div className="home-assistant-transcript-file-diff-list">
        {props.changes.map((change) => (
          <TranscriptFileDiffCard key={createChangeKey(change)} change={change} />
        ))}
      </div>
      {hasFooter ? (
        <div className="home-assistant-transcript-detail-footer">
          <span className="home-assistant-transcript-detail-footer-status">{props.footerStatus}</span>
        </div>
      ) : null}
    </div>
  );
}

function TranscriptFileDiffCard(props: { readonly change: FileUpdateChange }): JSX.Element {
  const title = getDiffTitle(props.change);
  const parsedDiff = getParsedDiff(props.change.diff);

  return (
    <section className="workspace-diff-preview-card home-assistant-transcript-file-diff-card">
      <header className="workspace-diff-preview-header">
        <div className="workspace-diff-preview-meta">
          <h3 className="workspace-diff-preview-title" title={title}>{title}</h3>
          <div className="home-assistant-transcript-file-diff-meta">
            <span className="workspace-diff-file-badge">{formatChangeKindLabel(props.change.kind)}</span>
            <DiffSummary parsedDiff={parsedDiff} />
          </div>
        </div>
      </header>
      <div className="home-assistant-transcript-file-diff-card-body">
        {parsedDiff === null ? (
          <div className="home-assistant-transcript-file-diff-empty">未提供 diff 内容</div>
        ) : (
          <GitDiffCodeView parsed={parsedDiff} path={props.change.path} />
        )}
      </div>
    </section>
  );
}

function DiffSummary(props: { readonly parsedDiff: ParsedDiffFile | null }): JSX.Element {
  if (props.parsedDiff === null) {
    return <span className="workspace-diff-preview-summary workspace-diff-file-row-summary-pending">无 diff</span>;
  }
  if (props.parsedDiff.hunks.length === 0) {
    return <span className="workspace-diff-preview-summary workspace-diff-file-row-summary-pending">原始 diff</span>;
  }
  return (
    <span
      className="workspace-diff-preview-summary"
      aria-label={`新增 ${props.parsedDiff.additions} 行，删除 ${props.parsedDiff.deletions} 行`}
    >
      <span className="workspace-diff-file-summary-add">+{props.parsedDiff.additions}</span>
      <span className="workspace-diff-file-summary-delete">-{props.parsedDiff.deletions}</span>
    </span>
  );
}

function createChangeKey(change: FileUpdateChange): string {
  const movedFrom = change.kind.type === "update" ? change.kind.move_path ?? "" : "";
  return `${change.kind.type}:${movedFrom}:${change.path}`;
}

function getParsedDiff(diff: string): ParsedDiffFile | null {
  if (diff.trim().length === 0) {
    return null;
  }
  return parseUnifiedDiffCached(diff);
}

function getDiffTitle(change: FileUpdateChange): string {
  const currentPath = getFileChangeDisplayName(change.path);
  if (change.kind.type !== "update" || change.kind.move_path === null) {
    return currentPath;
  }
  return `${getFileChangeDisplayName(change.kind.move_path)} → ${currentPath}`;
}

function formatChangeKindLabel(kind: PatchChangeKind): string {
  if (kind.type === "add") {
    return "新增";
  }
  if (kind.type === "delete") {
    return "删除";
  }
  if (kind.move_path !== null) {
    return "移动";
  }
  return "修改";
}
