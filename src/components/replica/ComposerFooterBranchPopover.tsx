import { useMemo, useState } from "react";
import type { GitBranchRef, GitStatusOutput } from "../../bridge/types";
import type { WorkspaceGitController } from "./git/types";
import { OfficialCloseIcon, OfficialPlusIcon, OfficialWorktreeIcon } from "./officialIcons";

interface ComposerFooterBranchPopoverProps {
  readonly controller: WorkspaceGitController;
  readonly selectedThreadId: string | null;
  readonly selectedThreadBranch: string | null;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onClose: () => void;
}

type BranchMode = "list" | "create";
type BranchViewState = "loading" | "nonRepo" | "error" | "list";

const TEXT = {
  branch: "\u5206\u652f",
  chooseBranch: "\u9009\u62e9\u5206\u652f",
  searchBranch: "\u641c\u7d22\u5206\u652f",
  currentBranch: "\u5f53\u524d\u68c0\u51fa\u5206\u652f",
  localBranch: "\u672c\u5730\u5206\u652f",
  loadingTitle: "\u6b63\u5728\u8bfb\u53d6 Git \u5206\u652f",
  loadingBody: "\u7a0d\u7b49\u4e00\u4e0b\uff0c\u6b63\u5728\u5206\u6790\u5f53\u524d\u5de5\u4f5c\u533a\u7684\u5206\u652f\u4fe1\u606f\u3002",
  nonRepoTitle: "\u5f53\u524d\u5de5\u4f5c\u533a\u4e0d\u662f Git \u4ed3\u5e93",
  nonRepoBody: "\u8bf7\u5148\u521d\u59cb\u5316\u4ed3\u5e93\u6216\u5207\u6362\u5230\u5df2\u6709 Git \u5de5\u4f5c\u533a\u3002",
  errorTitle: "\u8bfb\u53d6\u5206\u652f\u5931\u8d25",
  unavailableBody: "\u8bf7\u9009\u62e9\u4e00\u4e2a\u5de5\u4f5c\u533a\u540e\u518d\u67e5\u770b\u53ef\u5207\u6362\u5206\u652f\u3002",
  reload: "\u91cd\u65b0\u52a0\u8f7d",
  noMatches: "\u6ca1\u6709\u5339\u914d\u7684\u5206\u652f",
  createBranch: "\u521b\u5efa\u5e76\u68c0\u51fa\u65b0\u5206\u652f...",
  createBranchTitle: "\u521b\u5efa\u5e76\u68c0\u51fa\u65b0\u5206\u652f",
  createBranchHelp: "\u521b\u5efa\u540e\u4f1a\u7acb\u523b\u5207\u6362\u5230\u65b0\u5206\u652f\u3002",
  backToList: "\u8fd4\u56de\u5206\u652f\u5217\u8868",
  newBranchName: "\u65b0\u5206\u652f\u540d\u79f0",
  newBranchPlaceholder: "\u8f93\u5165\u65b0\u5206\u652f\u540d\u79f0",
  cancel: "\u53d6\u6d88",
  createAndCheckout: "\u521b\u5efa\u5e76\u68c0\u51fa",
  unknownBranch: "\u672a\u77e5\u5206\u652f",
};

function SearchIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10.4 10.4L13 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function getCurrentBranchName(status: GitStatusOutput | null): string | null {
  if (status === null) {
    return null;
  }
  return status.branches.find((branch) => branch.isCurrent)?.name ?? status.branch?.head ?? null;
}

function hasBranch(branches: ReadonlyArray<GitBranchRef>, branchName: string | null): branchName is string {
  return branchName !== null && branches.some((branch) => branch.name === branchName);
}

function getPreferredBranch(controller: WorkspaceGitController, selectedThreadBranch: string | null): string {
  const branches = controller.status?.branches ?? [];
  const currentBranch = getCurrentBranchName(controller.status);
  if (hasBranch(branches, selectedThreadBranch)) {
    return selectedThreadBranch;
  }
  if (hasBranch(branches, currentBranch)) {
    return currentBranch;
  }
  if (hasBranch(branches, controller.selectedBranch)) {
    return controller.selectedBranch;
  }
  return branches[0]?.name ?? currentBranch ?? TEXT.chooseBranch;
}

function filterBranches(branches: ReadonlyArray<GitBranchRef>, query: string): ReadonlyArray<GitBranchRef> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return branches;
  }
  return branches.filter((branch) => branch.name.toLowerCase().includes(normalizedQuery));
}

function getViewState(controller: WorkspaceGitController): BranchViewState {
  if (controller.loading && controller.status === null) {
    return "loading";
  }
  if (controller.status !== null && controller.status.isRepository === false) {
    return "nonRepo";
  }
  if (controller.error !== null || controller.status === null) {
    return "error";
  }
  return "list";
}

function getErrorText(controller: WorkspaceGitController, localError: string | null): string | null {
  if (localError !== null) {
    return localError;
  }
  if (controller.error !== null) {
    return controller.error;
  }
  return controller.notice?.kind === "error" ? controller.notice.text : null;
}

function formatBranchMismatch(selectedThreadBranch: string, currentBranch: string): string {
  return `\u8be5\u5bf9\u8bdd\u8bb0\u4f4f\u7684\u5206\u652f\u662f ${selectedThreadBranch}\uff0c\u5f53\u524d\u68c0\u51fa\u7684\u662f ${currentBranch}\u3002`;
}

function formatMissingThreadBranch(selectedThreadBranch: string, currentBranch: string | null): string {
  if (currentBranch === null) {
    return `\u8be5\u5bf9\u8bdd\u8bb0\u4f4f\u7684\u5206\u652f ${selectedThreadBranch} \u5f53\u524d\u4e0d\u5728\u4ed3\u5e93\u4e2d\u3002`;
  }
  return `\u8be5\u5bf9\u8bdd\u8bb0\u4f4f\u7684\u5206\u652f ${selectedThreadBranch} \u5f53\u524d\u4e0d\u5728\u4ed3\u5e93\u4e2d\uff0c\u5df2\u56de\u9000\u663e\u793a ${currentBranch}\u3002`;
}

function BranchNotice(props: { readonly kind: "info" | "error"; readonly text: string }): JSX.Element {
  const className = props.kind === "error" ? "branch-banner branch-banner-error" : "branch-banner branch-banner-info";
  return <div className={className}>{props.text}</div>;
}

function BranchEmptyState(props: {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}): JSX.Element {
  return (
    <div className="branch-state-card">
      <strong className="branch-state-title">{props.title}</strong>
      <p className="branch-state-body">{props.body}</p>
      {props.actionLabel && props.onAction ? <button type="button" className="branch-state-action" onClick={props.onAction}>{props.actionLabel}</button> : null}
    </div>
  );
}

function BranchSearchBar(props: { readonly query: string; readonly onChange: (value: string) => void }): JSX.Element {
  return (
    <div className="branch-search">
      <SearchIcon className="branch-search-icon" />
      <input className="branch-search-input" value={props.query} onChange={(event) => props.onChange(event.target.value)} placeholder={TEXT.searchBranch} aria-label={TEXT.searchBranch} />
    </div>
  );
}

function BranchListItem(props: {
  readonly branch: GitBranchRef;
  readonly selected: boolean;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly onSelect: (branchName: string) => void;
}): JSX.Element {
  const secondaryText = props.branch.upstream ?? (props.current ? TEXT.currentBranch : TEXT.localBranch);
  return (
    <button type="button" className="branch-item" role="menuitem" disabled={props.disabled} onClick={() => props.onSelect(props.branch.name)}>
      <span className="branch-item-top">
        <OfficialWorktreeIcon className="branch-icon" />
        <span className="branch-name">{props.branch.name}</span>
        {props.selected ? <span className="branch-check" aria-hidden="true">{"\u2713"}</span> : null}
      </span>
      <span className="branch-item-sub">{secondaryText}</span>
    </button>
  );
}

function CreateBranchView(props: {
  readonly controller: WorkspaceGitController;
  readonly busy: boolean;
  readonly errorText: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}): JSX.Element {
  const canSubmit = props.controller.newBranchName.trim().length > 0 && !props.busy;
  return (
    <div className="branch-create-panel">
      <div className="branch-create-header">
        <div>
          <div className="branch-section-title">{TEXT.createBranchTitle}</div>
          <p className="branch-create-help">{TEXT.createBranchHelp}</p>
        </div>
        <button type="button" className="branch-create-icon-btn" onClick={props.onCancel} aria-label={TEXT.backToList}>
          <OfficialCloseIcon className="branch-create-close" />
        </button>
      </div>
      {props.errorText ? <BranchNotice kind="error" text={props.errorText} /> : null}
      <div className="branch-search branch-create-input-shell">
        <OfficialWorktreeIcon className="branch-search-icon" />
        <input autoFocus className="branch-search-input" value={props.controller.newBranchName} onChange={(event) => props.controller.setNewBranchName(event.target.value)} placeholder={TEXT.newBranchPlaceholder} aria-label={TEXT.newBranchName} />
      </div>
      <div className="branch-create-actions">
        <button type="button" className="branch-create-secondary" disabled={props.busy} onClick={props.onCancel}>{TEXT.cancel}</button>
        <button type="button" className="branch-create-primary" disabled={!canSubmit} onClick={props.onSubmit}>{TEXT.createAndCheckout}</button>
      </div>
    </div>
  );
}

export function ComposerFooterBranchPopover(props: ComposerFooterBranchPopoverProps): JSX.Element {
  const [mode, setMode] = useState<BranchMode>("list");
  const [query, setQuery] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataPending, setMetadataPending] = useState(false);
  const branches = props.controller.status?.branches ?? [];
  const currentBranch = getCurrentBranchName(props.controller.status);
  const preferredBranch = getPreferredBranch(props.controller, props.selectedThreadBranch);
  const visibleBranches = useMemo(() => filterBranches(branches, query), [branches, query]);
  const busy = props.controller.pendingAction !== null || metadataPending;
  const errorText = getErrorText(props.controller, metadataError);
  const rememberedBranchMissing = props.selectedThreadBranch !== null && hasBranch(branches, props.selectedThreadBranch) === false;
  const branchMismatch = props.selectedThreadBranch !== null && currentBranch !== null && props.selectedThreadBranch !== currentBranch;

  const closeCreateMode = () => {
    props.controller.setNewBranchName("");
    setMetadataError(null);
    setMode("list");
  };

  const syncThreadBranch = async (branchName: string): Promise<boolean> => {
    if (props.selectedThreadId === null) {
      return true;
    }
    setMetadataPending(true);
    setMetadataError(null);
    try {
      await props.onUpdateThreadBranch(branchName);
      return true;
    } catch (error) {
      setMetadataError(`\u5df2\u5207\u6362\u5de5\u4f5c\u533a\u5206\u652f\uff0c\u4f46\u5199\u5165\u5bf9\u8bdd\u5206\u652f\u5931\u8d25\uff1a${String(error)}`);
      return false;
    } finally {
      setMetadataPending(false);
    }
  };

  const handleSelectBranch = async (branchName: string) => {
    setMetadataError(null);
    props.controller.setSelectedBranch(branchName);
    const succeeded = await props.controller.checkoutBranch(branchName);
    if (succeeded && await syncThreadBranch(branchName)) {
      props.onClose();
    }
  };

  const handleCreateBranch = async () => {
    const branchName = props.controller.newBranchName.trim();
    if (branchName.length === 0) {
      return;
    }
    setMetadataError(null);
    const succeeded = await props.controller.createBranch();
    if (succeeded && await syncThreadBranch(branchName)) {
      props.onClose();
    }
  };

  if (mode === "create") {
    return <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={TEXT.branch}><CreateBranchView controller={props.controller} busy={busy} errorText={errorText} onCancel={closeCreateMode} onSubmit={() => void handleCreateBranch()} /></div>;
  }

  switch (getViewState(props.controller)) {
    case "loading":
      return <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={TEXT.branch}><BranchEmptyState title={TEXT.loadingTitle} body={TEXT.loadingBody} /></div>;
    case "nonRepo":
      return <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={TEXT.branch}><BranchEmptyState title={TEXT.nonRepoTitle} body={TEXT.nonRepoBody} /></div>;
    case "error":
      return <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={TEXT.branch}><BranchEmptyState title={TEXT.errorTitle} body={props.controller.error ?? TEXT.unavailableBody} actionLabel={TEXT.reload} onAction={() => void props.controller.refresh()} /></div>;
    case "list":
      return (
        <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={TEXT.branch}>
          <BranchSearchBar query={query} onChange={setQuery} />
          {errorText ? <BranchNotice kind="error" text={errorText} /> : null}
          {!errorText && rememberedBranchMissing ? <BranchNotice kind="info" text={formatMissingThreadBranch(props.selectedThreadBranch ?? "", currentBranch)} /> : null}
          {!errorText && !rememberedBranchMissing && branchMismatch ? <BranchNotice kind="info" text={formatBranchMismatch(props.selectedThreadBranch ?? "", currentBranch ?? TEXT.unknownBranch)} /> : null}
          <div className="branch-section-title">{TEXT.branch}</div>
          <div className="branch-list">
            {visibleBranches.length === 0 ? <div className="branch-empty-list">{TEXT.noMatches}</div> : null}
            {visibleBranches.map((branch) => <BranchListItem key={branch.name} branch={branch} selected={branch.name === preferredBranch} current={branch.name === currentBranch} disabled={busy} onSelect={(branchName) => void handleSelectBranch(branchName)} />)}
          </div>
          <div className="branch-divider" />
          <button type="button" className="branch-create" role="menuitem" disabled={busy} onClick={() => { props.controller.setNewBranchName(""); setMetadataError(null); setMode("create"); }}>
            <OfficialPlusIcon className="branch-create-plus-icon" />
            {TEXT.createBranch}
          </button>
        </div>
      );
  }
}
