import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { canCommitChanges } from "../model/gitActionAvailability";
import type { WorkspaceGitController } from "../model/types";
import {
  hasCommitableChanges,
  hasUnresolvedConflicts,
  getCommitableChangeCount,
} from "../model/workspaceGitHelpers";
import { GitArrowUpIcon, GitBranchIcon, GitCheckIcon, GitCommitNodeIcon, GitHubMarkIcon } from "./gitIcons";

const COMMIT_DIALOG_LABEL = "提交更改";
const DEFAULT_BRANCH_LABEL = "未命名分支";

interface GitCommitDialogProps {
  readonly controller: WorkspaceGitController;
}

function useCommitInputFocus(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  open: boolean,
): void {
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open, inputRef]);
}

function getHelperText(controller: WorkspaceGitController): string {
  if (controller.status === null) {
    return "变更数量暂不可用";
  }
  if (hasUnresolvedConflicts(controller.status)) {
    return "请先解决冲突后再提交。";
  }
  if (!hasCommitableChanges(controller.status)) {
    return "当前没有可提交的更改。";
  }
  if (controller.status.staged.length === 0) {
    return controller.commitMessage.trim().length === 0
      ? "填写提交消息后，将自动暂存当前更改并提交。"
      : "提交时会自动暂存当前更改。";
  }
  if (controller.commitMessage.trim().length === 0) {
    return "请填写提交消息后再继续。";
  }
  return "将提交当前已暂存的更改。";
}

function handleCommitShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
  canSubmit: boolean,
  onConfirm: () => void,
): void {
  if (!canSubmit || event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) {
    return;
  }
  event.preventDefault();
  onConfirm();
}

function GitCommitToggle(props: { readonly checked: boolean; readonly label: string }): JSX.Element {
  return (
    <div className="git-commit-dialog-toggle-row">
      <span className={props.checked ? "git-commit-dialog-toggle git-commit-dialog-toggle-on" : "git-commit-dialog-toggle"} role="switch" aria-checked={props.checked} aria-disabled="true" aria-label={props.label}>
        <span className="git-commit-dialog-toggle-knob" />
      </span>
      <span>{props.label}</span>
    </div>
  );
}

export function GitCommitDialog(props: GitCommitDialogProps): JSX.Element | null {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = canCommitChanges(props.controller);
  const pending = props.controller.pendingAction === "提交更改";
  const branchName = props.controller.status?.branch?.head?.trim() || DEFAULT_BRANCH_LABEL;
  const changeCount = getCommitableChangeCount(props.controller.status);
  const helperText = getHelperText(props.controller);

  useCommitInputFocus(inputRef, props.controller.commitDialogOpen);

  if (!props.controller.commitDialogOpen) {
    return null;
  }

  return (
    <div className="git-dialog-backdrop git-dialog-backdrop-main" role="presentation" onClick={pending ? undefined : props.controller.closeCommitDialog}>
      <section className="git-commit-dialog" role="dialog" aria-modal="true" aria-label={COMMIT_DIALOG_LABEL} onClick={(event) => event.stopPropagation()}>
        <header className="git-commit-dialog-header">
          <div className="git-commit-dialog-icon-box" aria-hidden="true">
            <GitCommitNodeIcon className="git-commit-dialog-icon" />
          </div>
          <button type="button" className="git-dialog-close" onClick={props.controller.closeCommitDialog} aria-label="关闭提交卡片" disabled={pending}>×</button>
        </header>
        <div className="git-commit-dialog-body">
          <h2 className="git-commit-dialog-title">{COMMIT_DIALOG_LABEL}</h2>
          <div className="git-commit-dialog-meta-row">
            <span className="git-commit-dialog-label">分支</span>
            <strong className="git-commit-dialog-meta-value">
              <GitBranchIcon className="git-commit-dialog-meta-icon" />
              {branchName}
            </strong>
          </div>
          <div className="git-commit-dialog-meta-row">
            <span className="git-commit-dialog-label">变更</span>
            <strong className="git-commit-dialog-meta-value">{changeCount > 0 ? `${changeCount} 项` : "-"}</strong>
          </div>
          <GitCommitToggle checked label="包含取消暂存的更改（未接入）" />
          <div className="git-commit-dialog-message-header">
            <label className="git-commit-dialog-label" htmlFor="git-commit-message">提交消息</label>
            <span className="git-commit-dialog-muted">自定义指令（未接入）</span>
          </div>
          <textarea
            id="git-commit-message"
            ref={inputRef}
            className="git-textarea git-commit-dialog-textarea"
            placeholder="留空以自动生成提交消息（未接入）"
            value={props.controller.commitMessage}
            disabled={pending}
            onChange={(event) => props.controller.setCommitMessage(event.currentTarget.value)}
            onKeyDown={(event) => handleCommitShortcut(event, canSubmit, () => void props.controller.commit())}
          />
          <p className="git-commit-dialog-helper">{helperText}</p>
          {props.controller.commitDialogError !== null ? <p className="git-commit-dialog-error">{props.controller.commitDialogError}</p> : null}
          <div className="git-commit-dialog-section-title">后续步骤</div>
          <div className="git-commit-dialog-followups" role="radiogroup" aria-label="后续步骤">
            <button type="button" className="git-commit-dialog-followup git-commit-dialog-followup-selected" role="radio" aria-checked="true" disabled={pending}>
              <span className="git-commit-dialog-followup-main">
                <GitCommitNodeIcon className="git-commit-dialog-followup-icon" />
                <span>提交</span>
              </span>
              <GitCheckIcon className="git-commit-dialog-check-icon" />
            </button>
            <button type="button" className="git-commit-dialog-followup" role="radio" aria-checked="false" disabled>
              <span className="git-commit-dialog-followup-main">
                <GitArrowUpIcon className="git-commit-dialog-followup-icon" />
                <span>提交并推送（未接入）</span>
              </span>
            </button>
            <button type="button" className="git-commit-dialog-followup" role="radio" aria-checked="false" disabled>
              <span className="git-commit-dialog-followup-main">
                <GitHubMarkIcon className="git-commit-dialog-followup-icon" />
                <span>提交并创建 PR（未接入）</span>
              </span>
            </button>
          </div>
          <div className="git-commit-dialog-footer">
            <GitCommitToggle checked label="草稿（未接入）" />
            <button type="button" className="git-commit-dialog-continue" onClick={() => void props.controller.commit()} disabled={!canSubmit}>
              {pending ? "提交中..." : "继续"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
