import { useEffect, useMemo, useState } from "react";

interface WorktreeCreateDialogProps {
  readonly open: boolean;
  readonly initialName: string;
  readonly onClose: () => void;
  readonly onConfirm: (name: string) => Promise<void>;
}

export function WorktreeCreateDialog(props: WorktreeCreateDialogProps): JSX.Element | null {
  const [name, setName] = useState(props.initialName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) {
      setName(props.initialName);
      setSubmitting(false);
    }
  }, [props.initialName, props.open]);

  const canSubmit = useMemo(() => name.trim().length > 0 && !submitting, [name, submitting]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="git-dialog-backdrop" role="presentation" onClick={submitting ? undefined : props.onClose}>
      <section className="git-push-confirm-dialog worktree-create-dialog" role="dialog" aria-modal="true" aria-label="创建工作树并保存为项目" onClick={(event) => event.stopPropagation()}>
        <header className="git-push-confirm-header">
          <div />
          <button type="button" className="git-dialog-close" onClick={props.onClose} aria-label="关闭创建工作树对话框" disabled={submitting}>×</button>
        </header>
        <div className="git-push-confirm-body worktree-create-dialog-body">
          <h2 className="git-push-confirm-title">创建工作树并保存为项目</h2>
          <p className="git-push-confirm-text">从 HEAD 创建新的 Git 工作树，将其添加为项目，并保留该工作树直至将其移除。</p>
          <input
            className="git-input worktree-create-dialog-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="请输入工作树名称"
            disabled={submitting}
          />
          <div className="git-commit-dialog-actions">
            <button type="button" className="git-inline-btn" onClick={props.onClose} disabled={submitting}>取消</button>
            <button
              type="button"
              className="git-primary-btn"
              disabled={!canSubmit}
              onClick={() => {
                setSubmitting(true);
                void props.onConfirm(name.trim()).catch(() => {
                  setSubmitting(false);
                });
              }}
            >
              {submitting ? "创建中..." : "创建"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
