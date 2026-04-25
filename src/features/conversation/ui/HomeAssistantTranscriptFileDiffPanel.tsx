import { useCallback, useRef } from "react";
import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import type { PatchChangeKind } from "../../../protocol/generated/v2/PatchChangeKind";
import { parseUnifiedDiffCached, type ParsedDiffFile } from "../../git/model/diffPreviewModel";
import { GitDiffCodeView } from "../../git/ui/GitDiffCodeView";
import { getFileChangeDisplayName } from "../model/fileChangeSummary";

interface HomeAssistantTranscriptFileDiffPanelProps {
  readonly changes: ReadonlyArray<FileUpdateChange>;
}

export function HomeAssistantTranscriptFileDiffPanel(
  props: HomeAssistantTranscriptFileDiffPanelProps,
): JSX.Element {
  return (
    <div className="home-assistant-transcript-detail-panel" data-variant="fileDiff">
      <div className="home-assistant-transcript-file-diff-list">
        {props.changes.map((change, index) => (
          <TranscriptFileDiffCard key={createChangeKey(change)} change={change} defaultOpen={index === 0} />
        ))}
      </div>
    </div>
  );
}

function TranscriptFileDiffCard(props: { readonly change: FileUpdateChange; readonly defaultOpen: boolean }): JSX.Element {
  const initializedRef = useRef(false);
  const title = getDiffTitle(props.change);
  const parsedDiff = getParsedDiff(props.change.diff);
  const actionLabel = `复制 ${title} diff`;
  const setDetailsRef = useCallback((node: HTMLDetailsElement | null) => {
    if (node === null || initializedRef.current) {
      return;
    }
    node.open = props.defaultOpen;
    initializedRef.current = true;
  }, [props.defaultOpen]);

  return (
    <details ref={setDetailsRef} className="home-assistant-transcript-file-diff-card">
      <summary className="home-assistant-transcript-file-diff-summary">
        <span className="home-assistant-transcript-file-diff-summary-main">
          <span className="home-assistant-transcript-file-diff-kind">{formatChangeKindLabel(props.change.kind)}</span>
          <span className="home-assistant-transcript-file-diff-title" title={title}>{title}</span>
          <DiffSummary parsedDiff={parsedDiff} />
        </span>
        <button
          type="button"
          className="home-assistant-transcript-file-diff-copy"
          aria-label={actionLabel}
          title={actionLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyDiffToClipboard(props.change.diff);
          }}
        >
          <span className="home-assistant-transcript-file-diff-copy-icon" aria-hidden="true" />
        </button>
        <span className="home-assistant-transcript-file-diff-chevron" aria-hidden="true" />
      </summary>
      <div className="home-assistant-transcript-file-diff-card-body">
        {parsedDiff === null ? (
          <div className="home-assistant-transcript-file-diff-empty">未提供 diff 内容</div>
        ) : (
          <GitDiffCodeView parsed={parsedDiff} path={props.change.path} />
        )}
      </div>
    </details>
  );
}

function DiffSummary(props: { readonly parsedDiff: ParsedDiffFile | null }): JSX.Element {
  if (props.parsedDiff === null) {
    return <span className="home-assistant-transcript-file-diff-counts home-assistant-transcript-file-diff-counts-muted">无 diff</span>;
  }
  if (props.parsedDiff.hunks.length === 0) {
    return <span className="home-assistant-transcript-file-diff-counts home-assistant-transcript-file-diff-counts-muted">原始 diff</span>;
  }
  return (
    <span
      className="home-assistant-transcript-file-diff-counts"
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

async function copyDiffToClipboard(diff: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(diff);
  } catch {
    // Clipboard writes may be unavailable in restricted webviews.
  }
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
    return "已新增";
  }
  if (kind.type === "delete") {
    return "已删除";
  }
  if (kind.move_path !== null) {
    return "已移动";
  }
  return "已编辑";
}
