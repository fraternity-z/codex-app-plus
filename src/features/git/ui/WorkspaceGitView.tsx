import { useEffect } from "react";
import { GitChangeBrowser } from "./GitChangeBrowser";
import { GitDiffPreview } from "./GitDiffPreview";
import { GitStateCard } from "./GitStateCard";
import { canCommitChanges, canPullChanges, canPushChanges } from "../model/gitActionAvailability";
import type { WorkspaceGitController } from "../model/types";
import { getCurrentBranchTitle, getGitViewState, getSelectedDiffKey, isGitBusy } from "../model/gitViewState";

interface WorkspaceGitViewProps {
  readonly selectedRootName: string;
  readonly controller: WorkspaceGitController;
  readonly onRequestPush: () => void;
}

function GitWorkspaceState(props: { readonly title: string; readonly body: string; readonly actionLabel?: string; readonly onAction?: () => void }): JSX.Element {
  return (
    <main className="main-canvas main-canvas-workspace">
      <GitStateCard {...props} />
    </main>
  );
}

function GitOverviewBadges(props: { readonly controller: WorkspaceGitController }): JSX.Element | null {
  const status = props.controller.status;
  if (status === null) {
    return null;
  }

  return (
    <div className="git-overview-meta">
      <span className="git-badge">已暂存 {status.staged.length}</span>
      <span className="git-badge">未暂存 {status.unstaged.length}</span>
      <span className="git-badge">未跟踪 {status.untracked.length}</span>
      <span className="git-badge">冲突 {status.conflicted.length}</span>
      <span className={status.isClean ? "git-badge git-badge-success" : "git-badge git-badge-warning"}>
        {status.isClean ? "工作区干净" : "存在待处理变更"}
      </span>
      {status.branch?.upstream !== null ? <span className="git-badge">上游 {status.branch?.upstream}</span> : null}
      {status.branch?.ahead ? <span className="git-badge">领先 {status.branch.ahead}</span> : null}
      {status.branch?.behind ? <span className="git-badge">落后 {status.branch.behind}</span> : null}
    </div>
  );
}

function GitOverviewCard(props: {
  readonly selectedRootName: string;
  readonly controller: WorkspaceGitController;
  readonly busy: boolean;
  readonly branchTitle: string;
  readonly canPull: boolean;
  readonly canPush: boolean;
  readonly onRequestPush: () => void;
}): JSX.Element | null {
  const status = props.controller.status;
  if (status === null) {
    return null;
  }

  return (
    <header className="git-overview-card">
      <div className="git-overview-main">
        <div>
          <h2 className="git-overview-title">{props.branchTitle}</h2>
          <p className="git-overview-subtitle">{status.repoRoot ?? props.selectedRootName}</p>
        </div>
        <div className="git-overview-actions">
          <button type="button" className="git-inline-btn" disabled={props.busy} onClick={() => void props.controller.refresh()}>刷新</button>
          <button type="button" className="git-inline-btn" disabled={props.busy} onClick={() => void props.controller.fetch()}>抓取</button>
          <button type="button" className="git-inline-btn" disabled={!props.canPull} onClick={() => void props.controller.pull()}>拉取</button>
          <button type="button" className="git-primary-btn" disabled={!props.canPush} onClick={props.onRequestPush}>推送</button>
        </div>
      </div>
      <GitOverviewBadges controller={props.controller} />
      {status.remoteUrl !== null ? <div className="git-remote-url">远端：{status.remoteUrl}</div> : null}
      {props.controller.notice !== null ? (
        <div className={props.controller.notice.kind === "success" ? "git-banner git-banner-success" : "git-banner git-banner-error"}>
          {props.controller.notice.text}
        </div>
      ) : null}
    </header>
  );
}

function GitBranchCard(props: { readonly controller: WorkspaceGitController; readonly busy: boolean }): JSX.Element | null {
  const status = props.controller.status;
  if (status === null) {
    return null;
  }

  const canSwitchBranch = props.controller.selectedBranch.trim().length > 0 && props.controller.selectedBranch !== status.branch?.head && !props.busy;
  const canCreateBranch = props.controller.newBranchName.trim().length > 0 && !props.busy;

  return (
    <section className="git-card">
      <h3 className="git-card-title">分支</h3>
      <div className="git-form-row">
        <select className="git-select" value={props.controller.selectedBranch} disabled={props.busy || status.branches.length === 0} onChange={(event) => props.controller.setSelectedBranch(event.currentTarget.value)}>
          <option value="">选择已有分支</option>
          {status.branches.map((branch) => (
            <option key={branch.name} value={branch.name}>{branch.isCurrent ? `当前：${branch.name}` : branch.name}</option>
          ))}
        </select>
        <button type="button" className="git-inline-btn" disabled={!canSwitchBranch} onClick={() => void props.controller.checkoutSelectedBranch()}>切换</button>
      </div>
      <div className="git-form-row">
        <input className="git-input" placeholder="输入新分支名称" value={props.controller.newBranchName} disabled={props.busy} onChange={(event) => props.controller.setNewBranchName(event.currentTarget.value)} />
        <button type="button" className="git-inline-btn" disabled={!canCreateBranch} onClick={() => void props.controller.createBranch()}>新建并切换</button>
      </div>
    </section>
  );
}

function GitCommitCard(props: { readonly controller: WorkspaceGitController; readonly busy: boolean }): JSX.Element | null {
  const status = props.controller.status;
  if (status === null) {
    return null;
  }

  const canCommit = canCommitChanges(props.controller);
  return (
    <section className="git-card">
      <h3 className="git-card-title">提交</h3>
      <textarea className="git-textarea" placeholder="填写提交说明，提交的是当前已暂存的更改。" value={props.controller.commitMessage} disabled={props.busy} onChange={(event) => props.controller.setCommitMessage(event.currentTarget.value)} />
      <button type="button" className="git-primary-btn git-full-width" disabled={!canCommit} onClick={() => void props.controller.commit()}>提交已暂存更改</button>
    </section>
  );
}

export function WorkspaceGitView(props: WorkspaceGitViewProps): JSX.Element {
  useEffect(() => {
    if (
      props.controller.status?.isRepository !== true
      || props.controller.status.remoteName === null
    ) {
      return;
    }
    void props.controller.ensureRemoteUrl?.();
  }, [
    props.controller.ensureRemoteUrl,
    props.controller.status?.isRepository,
    props.controller.status?.remoteName,
  ]);

  const viewState = getGitViewState(props.selectedRootName, props.controller);
  if (viewState !== null) {
    return <GitWorkspaceState {...viewState} />;
  }

  const busy = isGitBusy(props.controller);
  const canPull = canPullChanges(props.controller);
  const canPush = canPushChanges(props.controller);
  const selectedDiffKey = getSelectedDiffKey(props.controller);
  const branchTitle = getCurrentBranchTitle(props.controller);

  return (
    <main className="main-canvas main-canvas-workspace">
      <section className="git-workspace">
        <GitOverviewCard selectedRootName={props.selectedRootName} controller={props.controller} busy={busy} branchTitle={branchTitle} canPull={canPull} canPush={canPush} onRequestPush={props.onRequestPush} />
        <div className="git-columns">
          <div className="git-column git-column-left">
            <GitChangeBrowser controller={props.controller} busy={busy} selectedDiffKey={selectedDiffKey} scope="all" />
          </div>
          <div className="git-column git-column-right">
            <GitBranchCard controller={props.controller} busy={busy} />
            <GitCommitCard controller={props.controller} busy={busy} />
            <GitDiffPreview controller={props.controller} busy={busy} />
          </div>
        </div>
      </section>
    </main>
  );
}
