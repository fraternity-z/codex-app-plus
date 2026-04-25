import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { canCommitChanges } from "../model/gitActionAvailability";
import type { GitCommitFollowUp, GitCommitOptions, WorkspaceGitController } from "../model/types";
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

function getHelperText(controller: WorkspaceGitController, includeUnstaged: boolean): string {
  if (controller.status === null) {
    return "变更数量暂不可用";
  }
  if (hasUnresolvedConflicts(controller.status)) {
    return "请先解决冲突后再提交。";
  }
  if (!hasCommitableChanges(controller.status)) {
    return "当前没有可提交的更改。";
  }
  if (controller.pendingAction === "生成提交消息") {
    return "正在根据已暂存更改生成提交消息。";
  }
  if (controller.status.staged.length === 0) {
    return includeUnstaged
      ? "将先暂存当前更改；留空时会自动生成提交消息。"
      : "请先暂存更改，或开启包含未暂存的更改。";
  }
  if (controller.commitMessage.trim().length === 0) {
    return "留空时会根据已暂存更改自动生成提交消息。";
  }
  if (includeUnstaged && (controller.status.unstaged.length > 0 || controller.status.untracked.length > 0)) {
    return "提交前会把未暂存和未跟踪更改一并暂存。";
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

function GitCommitToggle(props: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onToggle?: () => void;
}): JSX.Element {
  const switchElement = (
    <span className={props.checked ? "git-commit-dialog-toggle git-commit-dialog-toggle-on" : "git-commit-dialog-toggle"} role="switch" aria-checked={props.checked} aria-disabled={props.disabled === true ? "true" : undefined} aria-label={props.label}>
      <span className="git-commit-dialog-toggle-knob" />
    </span>
  );
  if (props.onToggle === undefined) {
    return (
      <div className="git-commit-dialog-toggle-row">
        {switchElement}
        <span>{props.label}</span>
      </div>
    );
  }
  return (
    <button type="button" className="git-commit-dialog-toggle-row git-commit-dialog-toggle-button" onClick={props.onToggle} disabled={props.disabled}>
      {switchElement}
      <span>{props.label}</span>
    </button>
  );
}

function getContinueLabel(pendingAction: string | null, followUp: GitCommitFollowUp): string {
  if (pendingAction === "生成提交消息") {
    return "生成中...";
  }
  if (pendingAction === "推送分支") {
    return "推送中...";
  }
  if (pendingAction !== null) {
    return "提交中...";
  }
  return followUp === "push" ? "提交并推送" : "继续";
}

export function GitCommitDialog(props: GitCommitDialogProps): JSX.Element | null {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [followUp, setFollowUp] = useState<GitCommitFollowUp>("commit");
  const canSubmit = canCommitChanges(props.controller);
  const pending = props.controller.pendingAction !== null;
  const branchName = props.controller.status?.branch?.head?.trim() || DEFAULT_BRANCH_LABEL;
  const changeCount = getCommitableChangeCount(props.controller.status);
  const helperText = getHelperText(props.controller, includeUnstaged);
  const commitOptions: GitCommitOptions = { includeUnstaged, followUp };
  const hasCommitInstructions = props.controller.commitInstructions.trim().length > 0;

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
          <GitCommitToggle checked={includeUnstaged} label="包含未暂存的更改" disabled={pending} onToggle={() => setIncludeUnstaged((value) => !value)} />
          <div className="git-commit-dialog-message-header">
            <label className="git-commit-dialog-label" htmlFor="git-commit-message">提交消息</label>
            <span className="git-commit-dialog-muted">{hasCommitInstructions ? "自定义指令已启用" : "自定义指令未设置"}</span>
          </div>
          <textarea
            id="git-commit-message"
            ref={inputRef}
            className="git-textarea git-commit-dialog-textarea"
            placeholder="留空以自动生成提交消息"
            value={props.controller.commitMessage}
            disabled={pending}
            onChange={(event) => props.controller.setCommitMessage(event.currentTarget.value)}
            onKeyDown={(event) => handleCommitShortcut(event, canSubmit, () => void props.controller.commit(commitOptions))}
          />
          <p className="git-commit-dialog-helper">{helperText}</p>
          {props.controller.commitDialogError !== null ? <p className="git-commit-dialog-error">{props.controller.commitDialogError}</p> : null}
          <div className="git-commit-dialog-section-title">后续步骤</div>
          <div className="git-commit-dialog-followups" role="radiogroup" aria-label="后续步骤">
            <button type="button" className={followUp === "commit" ? "git-commit-dialog-followup git-commit-dialog-followup-selected" : "git-commit-dialog-followup"} role="radio" aria-checked={followUp === "commit"} disabled={pending} onClick={() => setFollowUp("commit")}>
              <span className="git-commit-dialog-followup-main">
                <GitCommitNodeIcon className="git-commit-dialog-followup-icon" />
                <span>提交</span>
              </span>
              {followUp === "commit" ? <GitCheckIcon className="git-commit-dialog-check-icon" /> : null}
            </button>
            <button type="button" className={followUp === "push" ? "git-commit-dialog-followup git-commit-dialog-followup-selected" : "git-commit-dialog-followup"} role="radio" aria-checked={followUp === "push"} disabled={pending} onClick={() => setFollowUp("push")}>
              <span className="git-commit-dialog-followup-main">
                <GitArrowUpIcon className="git-commit-dialog-followup-icon" />
                <span>提交并推送</span>
              </span>
              {followUp === "push" ? <GitCheckIcon className="git-commit-dialog-check-icon" /> : null}
            </button>
            <button type="button" className="git-commit-dialog-followup" role="radio" aria-checked="false" disabled>
              <span className="git-commit-dialog-followup-main">
                <GitHubMarkIcon className="git-commit-dialog-followup-icon" />
                <span>提交并创建 PR（未接入）</span>
              </span>
            </button>
          </div>
          <div className="git-commit-dialog-footer">
            <GitCommitToggle checked label="草稿 PR（未接入）" disabled />
            <button type="button" className="git-commit-dialog-continue" onClick={() => void props.controller.commit(commitOptions)} disabled={!canSubmit}>
              {getContinueLabel(props.controller.pendingAction, followUp)}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
