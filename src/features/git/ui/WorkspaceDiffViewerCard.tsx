import { confirm } from "@tauri-apps/plugin-dialog";
import { memo, useMemo } from "react";
import type { GitWorkspaceDiffOutput, GitWorkspaceDiffSection } from "../../../bridge/types";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";
import { parseUnifiedDiffCached } from "../model/diffPreviewModel";
import { GitDiffCodeView } from "./GitDiffCodeView";
import {
  GitChevronDownIcon,
  GitChevronUpIcon,
  GitRestoreIcon,
  GitStageIcon,
} from "./gitIcons";

interface WorkspaceDiffViewerCardProps {
  readonly busy: boolean;
  readonly diffKey: string;
  readonly expanded: boolean;
  readonly item: GitWorkspaceDiffOutput;
  readonly onDiscardPaths: (paths: ReadonlyArray<string>, deleteUntracked: boolean) => Promise<void>;
  readonly onStagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly onToggleExpanded: (key: string) => void;
  readonly onUnstagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly showSectionLabel: boolean;
  readonly viewStyle?: DiffViewStyle;
}

const SECTION_LABELS: Readonly<Record<GitWorkspaceDiffSection, string>> = Object.freeze({
  unstaged: "未暂存",
  staged: "已暂存",
  untracked: "未跟踪",
  conflicted: "冲突",
});

function getItemTitle(item: GitWorkspaceDiffOutput): string {
  return item.originalPath === null ? item.displayPath : `${item.originalPath} → ${item.displayPath}`;
}

function getPrimaryActionLabel(item: GitWorkspaceDiffOutput): string {
  return item.staged ? "取消暂存" : "暂存";
}

function getSecondaryActionLabel(item: GitWorkspaceDiffOutput): string | null {
  if (item.section === "untracked") {
    return "删除";
  }
  if (item.staged) {
    return null;
  }
  return "还原";
}

function getStatusLabel(item: GitWorkspaceDiffOutput): string {
  const status = item.status.trim();
  return status.length > 0 ? status : "变更";
}

async function handleSecondaryAction(
  item: GitWorkspaceDiffOutput,
  onDiscardPaths: WorkspaceDiffViewerCardProps["onDiscardPaths"],
): Promise<void> {
  const confirmed = await confirm(`确定要处理文件 ${item.path} 吗？此操作不可撤销。`);
  if (confirmed) {
    await onDiscardPaths([item.path], item.section === "untracked");
  }
}

function handlePrimaryAction(
  item: GitWorkspaceDiffOutput,
  onStagePaths: WorkspaceDiffViewerCardProps["onStagePaths"],
  onUnstagePaths: WorkspaceDiffViewerCardProps["onUnstagePaths"],
): void {
  if (item.staged) {
    void onUnstagePaths([item.path]);
    return;
  }
  void onStagePaths([item.path]);
}

function DiffMeta(props: {
  readonly item: GitWorkspaceDiffOutput;
  readonly showSectionLabel: boolean;
}): JSX.Element {
  return (
    <div className="workspace-diff-file-meta">
      {props.showSectionLabel ? (
        <span className="workspace-diff-file-badge">{SECTION_LABELS[props.item.section]}</span>
      ) : null}
      <span className="workspace-diff-file-badge workspace-diff-file-badge-status">{getStatusLabel(props.item)}</span>
    </div>
  );
}

function DiffSummary(props: { readonly item: GitWorkspaceDiffOutput }): JSX.Element {
  if (props.item.additions === 0 && props.item.deletions === 0) {
    return <span className="workspace-diff-file-summary">说明</span>;
  }
  return (
    <span
      className="workspace-diff-file-summary"
      aria-label={`新增 ${props.item.additions} 行，删除 ${props.item.deletions} 行`}
    >
      <span className="workspace-diff-file-summary-add">+{props.item.additions}</span>
      <span className="workspace-diff-file-summary-delete">-{props.item.deletions}</span>
    </span>
  );
}

function FileActions(props: WorkspaceDiffViewerCardProps): JSX.Element {
  const secondaryLabel = getSecondaryActionLabel(props.item);
  return (
    <div className="workspace-diff-file-actions">
      {secondaryLabel === null ? null : (
        <button
          type="button"
          className="workspace-diff-file-action"
          aria-label={`${secondaryLabel} ${props.item.path}`}
          disabled={props.busy}
          onClick={() => void handleSecondaryAction(props.item, props.onDiscardPaths)}
        >
          <GitRestoreIcon className="workspace-diff-file-action-icon" />
        </button>
      )}
      <button
        type="button"
        className="workspace-diff-file-action"
        aria-label={`${getPrimaryActionLabel(props.item)} ${props.item.path}`}
        disabled={props.busy}
        onClick={() => handlePrimaryAction(props.item, props.onStagePaths, props.onUnstagePaths)}
      >
        <GitStageIcon className="workspace-diff-file-action-icon" />
      </button>
    </div>
  );
}

function FileBody(props: {
  readonly diff: string;
  readonly expanded: boolean;
  readonly path: string;
  readonly viewStyle: DiffViewStyle;
}): JSX.Element | null {
  const parsedDiff = useMemo(() => {
    if (!props.expanded) {
      return null;
    }
    return parseUnifiedDiffCached(props.diff);
  }, [props.diff, props.expanded]);

  if (parsedDiff === null) {
    return null;
  }
  return (
    <div className="workspace-diff-file-body">
      <GitDiffCodeView parsed={parsedDiff} path={props.path} viewStyle={props.viewStyle} />
    </div>
  );
}

function CollapseTrigger(props: {
  readonly diffKey: string;
  readonly expanded: boolean;
  readonly item: GitWorkspaceDiffOutput;
  readonly onToggleExpanded: (key: string) => void;
  readonly showSectionLabel: boolean;
}): JSX.Element {
  const title = getItemTitle(props.item);
  const ChevronIcon = props.expanded ? GitChevronUpIcon : GitChevronDownIcon;
  return (
    <button
      type="button"
      className="workspace-diff-file-trigger"
      aria-expanded={props.expanded}
      aria-label={props.expanded ? `折叠 ${title}` : `展开 ${title}`}
      onClick={() => props.onToggleExpanded(props.diffKey)}
    >
      <span className="workspace-diff-file-chevron-wrap" aria-hidden="true">
        <ChevronIcon className="workspace-diff-file-chevron" />
      </span>
      <span className="workspace-diff-file-title-wrap">
        <span className="workspace-diff-file-title" title={title}>{title}</span>
        <DiffMeta item={props.item} showSectionLabel={props.showSectionLabel} />
      </span>
    </button>
  );
}

export const WorkspaceDiffViewerCard = memo(function WorkspaceDiffViewerCard(
  props: WorkspaceDiffViewerCardProps,
): JSX.Element {
  return (
    <article className="workspace-diff-file-card" data-diff-path={props.item.path}>
      <header className="workspace-diff-file-header">
        <CollapseTrigger
          diffKey={props.diffKey}
          expanded={props.expanded}
          item={props.item}
          onToggleExpanded={props.onToggleExpanded}
          showSectionLabel={props.showSectionLabel}
        />
        <DiffSummary item={props.item} />
        <FileActions {...props} />
      </header>
      <FileBody
        diff={props.item.diff}
        expanded={props.expanded}
        path={props.item.path}
        viewStyle={props.viewStyle ?? "unified"}
      />
    </article>
  );
});
