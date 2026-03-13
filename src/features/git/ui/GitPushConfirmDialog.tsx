import { GitPushIcon } from "./gitIcons";

const DEFAULT_BRANCH_LABEL = "未命名分支";
const PUSH_CONFIRM_LABEL = "推送更改";

interface GitPushConfirmDialogProps {
  readonly branchName: string | null;
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function GitPushConfirmDialog(props: GitPushConfirmDialogProps): JSX.Element | null {
  if (!props.open) {
    return null;
  }

  const branchName = props.branchName?.trim() || DEFAULT_BRANCH_LABEL;

  return (
    <div className="git-dialog-backdrop" role="presentation" onClick={props.pending ? undefined : props.onClose}>
      <section className="git-push-confirm-dialog" role="dialog" aria-modal="true" aria-label={PUSH_CONFIRM_LABEL} onClick={(event) => event.stopPropagation()}>
        <header className="git-push-confirm-header">
          <div className="git-push-confirm-icon-box" aria-hidden="true">
            <GitPushIcon className="git-push-confirm-icon" />
          </div>
          <button type="button" className="git-dialog-close" onClick={props.onClose} aria-label="关闭推送确认" disabled={props.pending}>×</button>
        </header>
        <div className="git-push-confirm-body">
          <h2 className="git-push-confirm-title">{PUSH_CONFIRM_LABEL}</h2>
          <div className="git-push-confirm-row">
            <span className="git-push-confirm-label">分支</span>
            <strong className="git-push-confirm-value">{branchName}</strong>
          </div>
          <p className="git-push-confirm-text">将你最新的提交内容推送至远程存储库。</p>
          <button type="button" className="git-primary-btn git-full-width git-push-confirm-submit" onClick={props.onConfirm} disabled={props.pending}>
            {props.pending ? "推送中…" : "推送"}
          </button>
        </div>
      </section>
    </div>
  );
}
