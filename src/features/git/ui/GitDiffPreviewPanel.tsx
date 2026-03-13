import { confirm } from "@tauri-apps/plugin-dialog";
import { useMemo } from "react";
import type { GitChangeEntryMode } from "./GitChangeBrowser";
import { GitDiffCodeView } from "./GitDiffCodeView";
import { parseUnifiedDiff, type ParsedDiffFile } from "../model/diffPreviewModel";
import { createGitDiffKey } from "../model/gitDiffKey";
import { GitRestoreIcon, GitStageIcon } from "./gitIcons";
import type { WorkspaceGitController } from "../model/types";

export interface SelectedGitDiffFile {
  readonly path: string;
  readonly title: string;
  readonly mode: GitChangeEntryMode;
  readonly staged: boolean;
}

function getPrimaryActionLabel(mode: GitChangeEntryMode): string {
  return mode === "staged" ? "取消暂存" : "暂存";
}

function getSecondaryActionLabel(mode: GitChangeEntryMode): string | null {
  if (mode === "unstaged") {
    return "还原";
  }
  if (mode === "untracked") {
    return "删除";
  }
  return null;
}

function applyPrimaryAction(controller: WorkspaceGitController, mode: GitChangeEntryMode, path: string): void {
  if (mode === "staged") {
    void controller.unstagePaths([path]);
    return;
  }
  void controller.stagePaths([path]);
}

async function handleSecondaryAction(controller: WorkspaceGitController, mode: GitChangeEntryMode, path: string): Promise<void> {
  const confirmed = await confirm(`确定要处理文件 ${path} 吗？此操作不可撤销。`);
  if (confirmed) {
    void controller.discardPaths([path], mode === "untracked");
  }
}

function PreviewActions(props: { readonly controller: WorkspaceGitController; readonly selectedFile: SelectedGitDiffFile }): JSX.Element {
  const busy = props.controller.loading || props.controller.pendingAction !== null;
  const secondaryLabel = getSecondaryActionLabel(props.selectedFile.mode);

  return (
    <div className="workspace-diff-preview-actions">
      {secondaryLabel !== null ? (
        <button
          type="button"
          className="workspace-diff-preview-action"
          aria-label={`${secondaryLabel} ${props.selectedFile.path}`}
          disabled={busy}
          onClick={() => void handleSecondaryAction(props.controller, props.selectedFile.mode, props.selectedFile.path)}
        >
          <GitRestoreIcon className="workspace-diff-file-action-icon" />
        </button>
      ) : null}
      <button
        type="button"
        className="workspace-diff-preview-action"
        aria-label={`${getPrimaryActionLabel(props.selectedFile.mode)} ${props.selectedFile.path}`}
        disabled={busy}
        onClick={() => applyPrimaryAction(props.controller, props.selectedFile.mode, props.selectedFile.path)}
      >
        <GitStageIcon className="workspace-diff-file-action-icon" />
      </button>
    </div>
  );
}

function PreviewBody(props: { readonly parsedDiff: ParsedDiffFile | null; readonly loading: boolean; readonly selectedPath: string }): JSX.Element {
  if (props.loading && props.parsedDiff === null) {
    return <div className="workspace-diff-preview-loading">正在更新差异…</div>;
  }
  if (props.parsedDiff === null) {
    return <div className="workspace-diff-preview-loading">正在准备差异预览…</div>;
  }
  return <GitDiffCodeView parsed={props.parsedDiff} path={props.selectedPath} />;
}

export function GitDiffPreviewPanel(props: { readonly controller: WorkspaceGitController; readonly selectedFile: SelectedGitDiffFile | null }): JSX.Element {
  if (props.selectedFile === null) {
    return (
      <section className="workspace-diff-preview-card workspace-diff-preview-empty">
        <h3 className="workspace-diff-preview-title">选择一个文件以查看差异</h3>
        <p className="workspace-diff-empty-body">上方文件列表会显示当前分组里的所有改动。</p>
      </section>
    );
  }

  const diffKey = createGitDiffKey(props.selectedFile.path, props.selectedFile.staged);
  const cachedDiff = props.controller.diffCache[diffKey] ?? null;
  const selectedDiff = props.controller.diff;
  const diffText = cachedDiff?.diff
    ?? (selectedDiff?.path === props.selectedFile.path && selectedDiff.staged === props.selectedFile.staged ? selectedDiff.diff : null);
  const parsedDiff = useMemo(() => (diffText === null ? null : parseUnifiedDiff(diffText)), [diffText]);
  const loading = props.controller.loadingDiffKeys.includes(diffKey);
  const pending = loading || props.controller.staleDiffKeys.includes(diffKey);

  return (
    <section className="workspace-diff-preview-card">
      <header className="workspace-diff-preview-header">
        <div className="workspace-diff-preview-meta">
          <h3 className="workspace-diff-preview-title" title={props.selectedFile.title}>{props.selectedFile.title}</h3>
          {parsedDiff === null ? (
            <div className="workspace-diff-preview-summary workspace-diff-file-row-summary-pending">加载中…</div>
          ) : (
            <div className="workspace-diff-preview-summary" aria-label={`新增 ${parsedDiff.additions} 行，删除 ${parsedDiff.deletions} 行`}>
              <span className="workspace-diff-file-summary-add">+{parsedDiff.additions}</span>
              <span className="workspace-diff-file-summary-delete">-{parsedDiff.deletions}</span>
              {pending ? <span className="workspace-diff-preview-status">更新中…</span> : null}
            </div>
          )}
        </div>
        <PreviewActions controller={props.controller} selectedFile={props.selectedFile} />
      </header>
      <PreviewBody parsedDiff={parsedDiff} loading={loading} selectedPath={props.selectedFile.path} />
    </section>
  );
}
