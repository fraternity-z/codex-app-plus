import type { WorkspaceGitController } from "../model/types";

interface GitDiffPreviewProps {
  readonly controller: WorkspaceGitController;
  readonly busy: boolean;
  readonly className?: string;
}

export function GitDiffPreview(props: GitDiffPreviewProps): JSX.Element {
  return (
    <section className={props.className ?? "git-card git-diff-card"}>
      <header className="git-section-header">
        <div>
          <h3 className="git-card-title">差异预览</h3>
          <p className="git-card-meta">选择左侧文件即可查看统一 diff。</p>
        </div>
        {props.controller.diff !== null ? (
          <button type="button" className="git-inline-btn" disabled={props.busy} onClick={props.controller.clearDiff}>
            清除
          </button>
        ) : null}
      </header>
      {props.controller.diff === null ? (
        <div className="git-empty-tip">当前还没有选择任何文件。</div>
      ) : (
        <pre className="git-diff-content">{props.controller.diff.diff}</pre>
      )}
    </section>
  );
}
