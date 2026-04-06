import { useEffect, useMemo, useRef, useState } from "react";
import type { GitBranchRef, GitStatusOutput } from "../../../bridge/types";
import { useI18n } from "../../../i18n/useI18n";
import type { WorkspaceGitController } from "../../git/model/types";
import { OfficialCloseIcon, OfficialPlusIcon, OfficialWorktreeIcon } from "../../shared/ui/officialIcons";

interface ComposerFooterBranchPopoverProps {
  readonly controller: WorkspaceGitController;
  readonly selectedThreadId: string | null;
  readonly selectedThreadBranch: string | null;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onClose: () => void;
}

type BranchMode = "list" | "create";
type BranchViewState = "loading" | "nonRepo" | "error" | "list";
type TranslateFn = ReturnType<typeof useI18n>["t"];

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

function getPreferredBranch(
  controller: WorkspaceGitController,
  selectedThreadBranch: string | null,
  chooseBranchLabel: string,
): string {
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
  return branches[0]?.name ?? currentBranch ?? chooseBranchLabel;
}

function filterBranches(branches: ReadonlyArray<GitBranchRef>, query: string): ReadonlyArray<GitBranchRef> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return branches;
  }
  return branches.filter((branch) => branch.name.toLowerCase().includes(normalizedQuery));
}

function canDeleteBranch(branch: GitBranchRef): boolean {
  return !branch.isCurrent && branch.name !== "main";
}

function formatDeleteBranchConfirm(branchName: string, t: TranslateFn): string {
  return t("home.composer.branchPopover.deleteBranchConfirm", { branch: branchName });
}

function formatForceDeleteBranchConfirm(branchName: string, t: TranslateFn): string {
  return t("home.composer.branchPopover.forceDeleteBranchConfirm", { branch: branchName });
}

function shouldOfferForceDelete(errorText: string | null): boolean {
  if (errorText === null) {
    return false;
  }
  return errorText.includes("not fully merged") || errorText.includes("尚未合并");
}

function BranchContextMenu(props: {
  readonly x: number;
  readonly y: number;
  readonly branchName: string;
  readonly canDelete: boolean;
  readonly deleting: boolean;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.deleting) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node) === true) {
        return;
      }
      props.onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("contextmenu", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("contextmenu", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [props]);

  return (
    <div
      ref={containerRef}
      className="thread-context-menu"
      style={{ left: props.x, top: props.y }}
      role="menu"
      aria-label={t("home.composer.branchPopover.contextMenuAria", { branch: props.branchName })}
    >
      <button
        type="button"
        className="thread-context-menu-item thread-context-menu-item-danger"
        role="menuitem"
        onClick={props.onDelete}
        disabled={!props.canDelete || props.deleting}
      >
        {props.deleting
          ? t("home.composer.branchPopover.deletingBranch")
          : t("home.composer.branchPopover.deleteBranch")}
      </button>
    </div>
  );
}

function getViewState(controller: WorkspaceGitController): BranchViewState {
  const branchRefsLoading = controller.branchRefsLoading ?? false;
  const branchRefsLoaded = controller.branchRefsLoaded ?? true;
  if (controller.loading && controller.status === null) {
    return "loading";
  }
  if (controller.status !== null && controller.status.isRepository === false) {
    return "nonRepo";
  }
  if (controller.error !== null || controller.status === null) {
    return "error";
  }
  if (branchRefsLoading || !branchRefsLoaded) {
    return controller.notice?.kind === "error" ? "error" : "loading";
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

function formatBranchMismatch(selectedThreadBranch: string, currentBranch: string, t: TranslateFn): string {
  return t("home.composer.branchPopover.branchMismatch", {
    selected: selectedThreadBranch,
    current: currentBranch,
  });
}

function formatMissingThreadBranch(selectedThreadBranch: string, currentBranch: string | null, t: TranslateFn): string {
  if (currentBranch === null) {
    return t("home.composer.branchPopover.missingThreadBranch", { selected: selectedThreadBranch });
  }
  return t("home.composer.branchPopover.missingThreadBranchFallback", {
    selected: selectedThreadBranch,
    current: currentBranch,
  });
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
      {props.actionLabel && props.onAction ? (
        <button type="button" className="branch-state-action" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function BranchSearchBar(props: { readonly query: string; readonly onChange: (value: string) => void }): JSX.Element {
  const { t } = useI18n();
  const label = t("home.composer.branchPopover.searchBranch");
  return (
    <div className="branch-search">
      <SearchIcon className="branch-search-icon" />
      <input
        className="branch-search-input"
        value={props.query}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </div>
  );
}

function BranchListItem(props: {
  readonly branch: GitBranchRef;
  readonly selected: boolean;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly onSelect: (branchName: string) => void;
  readonly onOpenMenu: (event: React.MouseEvent<HTMLDivElement>, branch: GitBranchRef) => void;
}): JSX.Element {
  const { t } = useI18n();
  const secondaryText = props.branch.upstream ?? (
    props.current ? t("home.composer.branchPopover.currentBranch") : t("home.composer.branchPopover.localBranch")
  );
  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onOpenMenu(event, props.branch);
      }}
    >
      <button
        type="button"
        className="branch-item"
        role="menuitem"
        disabled={props.disabled}
        onClick={() => props.onSelect(props.branch.name)}
      >
        <span className="branch-item-top">
          <OfficialWorktreeIcon className="branch-icon" />
          <span className="branch-name">{props.branch.name}</span>
          {props.selected ? <span className="branch-check" aria-hidden="true">{"\u2713"}</span> : null}
        </span>
        <span className="branch-item-sub">{secondaryText}</span>
      </button>
    </div>
  );
}

function CreateBranchView(props: {
  readonly controller: WorkspaceGitController;
  readonly busy: boolean;
  readonly errorText: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const canSubmit = props.controller.newBranchName.trim().length > 0 && !props.busy;
  return (
    <div className="branch-create-panel">
      <div className="branch-create-header">
        <div>
          <div className="branch-section-title">{t("home.composer.branchPopover.createBranchTitle")}</div>
          <p className="branch-create-help">{t("home.composer.branchPopover.createBranchHelp")}</p>
        </div>
        <button
          type="button"
          className="branch-create-icon-btn"
          onClick={props.onCancel}
          aria-label={t("home.composer.branchPopover.backToList")}
        >
          <OfficialCloseIcon className="branch-create-close" />
        </button>
      </div>
      {props.errorText ? <BranchNotice kind="error" text={props.errorText} /> : null}
      <div className="branch-search branch-create-input-shell">
        <OfficialWorktreeIcon className="branch-search-icon" />
        <input
          autoFocus
          className="branch-search-input"
          value={props.controller.newBranchName}
          onChange={(event) => props.controller.setNewBranchName(event.target.value)}
          placeholder={t("home.composer.branchPopover.newBranchPlaceholder")}
          aria-label={t("home.composer.branchPopover.newBranchName")}
        />
      </div>
      <div className="branch-create-actions">
        <button type="button" className="branch-create-secondary" disabled={props.busy} onClick={props.onCancel}>
          {t("home.composer.branchPopover.cancel")}
        </button>
        <button type="button" className="branch-create-primary" disabled={!canSubmit} onClick={props.onSubmit}>
          {t("home.composer.branchPopover.createAndCheckout")}
        </button>
      </div>
    </div>
  );
}

export function ComposerFooterBranchPopover(props: ComposerFooterBranchPopoverProps): JSX.Element {
  const { t } = useI18n();
  const [mode, setMode] = useState<BranchMode>("list");
  const [query, setQuery] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataPending, setMetadataPending] = useState(false);
  const [branchMenu, setBranchMenu] = useState<{ readonly branch: GitBranchRef; readonly x: number; readonly y: number } | null>(null);
  const branches = props.controller.status?.branches ?? [];
  const currentBranch = getCurrentBranchName(props.controller.status);
  const preferredBranch = getPreferredBranch(
    props.controller,
    props.selectedThreadBranch,
    t("home.composer.branchPopover.chooseBranch"),
  );
  const visibleBranches = useMemo(() => filterBranches(branches, query), [branches, query]);
  const busy = props.controller.pendingAction !== null || metadataPending;
  const errorText = getErrorText(props.controller, metadataError);
  const rememberedBranchMissing = props.selectedThreadBranch !== null && hasBranch(branches, props.selectedThreadBranch) === false;
  const branchMismatch = props.selectedThreadBranch !== null && currentBranch !== null && props.selectedThreadBranch !== currentBranch;
  const branchRefsLoaded = props.controller.branchRefsLoaded ?? true;

  useEffect(() => {
    if (props.controller.status?.isRepository !== true || branchRefsLoaded) {
      return;
    }
    void props.controller.ensureBranchRefs?.();
  }, [branchRefsLoaded, props.controller.ensureBranchRefs, props.controller.status?.isRepository]);

  useEffect(() => {
    if (branchMenu === null) {
      return;
    }
    const matchedBranch = branches.find((branch) => branch.name === branchMenu.branch.name);
    if (!matchedBranch || !canDeleteBranch(matchedBranch)) {
      setBranchMenu(null);
    }
  }, [branchMenu, branches]);

  const closeCreateMode = () => {
    props.controller.setNewBranchName("");
    setMetadataError(null);
    setMode("list");
  };

  const closeBranchMenu = () => setBranchMenu(null);

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
      setMetadataError(t("home.composer.branchPopover.metadataUpdateFailed", { error: String(error) }));
      return false;
    } finally {
      setMetadataPending(false);
    }
  };

  const handleSelectBranch = async (branchName: string) => {
    closeBranchMenu();
    setMetadataError(null);
    props.controller.setSelectedBranch(branchName);
    const succeeded = await props.controller.checkoutBranch(branchName);
    if (succeeded && await syncThreadBranch(branchName)) {
      props.onClose();
    }
  };

  const handleDeleteBranch = async () => {
    if (branchMenu === null) {
      return;
    }
    const branchName = branchMenu.branch.name;
    if (!canDeleteBranch(branchMenu.branch)) {
      setMetadataError(t("home.composer.branchPopover.cannotDeleteProtectedBranch"));
      closeBranchMenu();
      return;
    }
    if (!window.confirm(formatDeleteBranchConfirm(branchName, t))) {
      closeBranchMenu();
      return;
    }
    setMetadataError(null);
    const succeeded = await props.controller.deleteBranch(branchName);
    if (succeeded) {
      closeBranchMenu();
      return;
    }
    const nextErrorText = props.controller.notice?.kind === "error" ? props.controller.notice.text : props.controller.error;
    if (!shouldOfferForceDelete(nextErrorText)) {
      closeBranchMenu();
      return;
    }
    if (!window.confirm(formatForceDeleteBranchConfirm(branchName, t))) {
      closeBranchMenu();
      return;
    }
    await props.controller.deleteBranch(branchName, true);
    closeBranchMenu();
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

  const deletingBranch = branchMenu !== null && props.controller.pendingAction === "删除分支";
  const branchMenuLabel = t("home.composer.branchPopover.branch");

  if (mode === "create") {
    return (
      <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={branchMenuLabel}>
        <CreateBranchView
          controller={props.controller}
          busy={busy}
          errorText={errorText}
          onCancel={closeCreateMode}
          onSubmit={() => void handleCreateBranch()}
        />
      </div>
    );
  }

  switch (getViewState(props.controller)) {
    case "loading":
      return (
        <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={branchMenuLabel}>
          <BranchEmptyState
            title={t("home.composer.branchPopover.loadingTitle")}
            body={t("home.composer.branchPopover.loadingBody")}
          />
        </div>
      );
    case "nonRepo":
      return (
        <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={branchMenuLabel}>
          <BranchEmptyState
            title={t("home.composer.branchPopover.nonRepoTitle")}
            body={t("home.composer.branchPopover.nonRepoBody")}
          />
        </div>
      );
    case "error":
      return (
        <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={branchMenuLabel}>
          <BranchEmptyState
            title={t("home.composer.branchPopover.errorTitle")}
            body={errorText ?? t("home.composer.branchPopover.unavailableBody")}
            actionLabel={t("home.composer.branchPopover.reload")}
            onAction={() => void (props.controller.status?.isRepository ? props.controller.ensureBranchRefs?.() : props.controller.refresh())}
          />
        </div>
      );
    case "list":
      return (
        <div className="composer-footer-popover composer-branch-popover composer-footer-popover-right" role="menu" aria-label={branchMenuLabel}>
          <BranchSearchBar query={query} onChange={setQuery} />
          {errorText ? <BranchNotice kind="error" text={errorText} /> : null}
          {!errorText && rememberedBranchMissing ? (
            <BranchNotice kind="info" text={formatMissingThreadBranch(props.selectedThreadBranch ?? "", currentBranch, t)} />
          ) : null}
          {!errorText && !rememberedBranchMissing && branchMismatch ? (
            <BranchNotice
              kind="info"
              text={formatBranchMismatch(
                props.selectedThreadBranch ?? "",
                currentBranch ?? t("home.composer.branchPopover.unknownBranch"),
                t,
              )}
            />
          ) : null}
          <div className="branch-section-title">{branchMenuLabel}</div>
          <div className="branch-list">
            {visibleBranches.length === 0 ? <div className="branch-empty-list">{t("home.composer.branchPopover.noMatches")}</div> : null}
            {visibleBranches.map((branch) => (
              <BranchListItem
                key={branch.name}
                branch={branch}
                selected={branch.name === preferredBranch}
                current={branch.name === currentBranch}
                disabled={busy}
                onSelect={(branchName) => void handleSelectBranch(branchName)}
                onOpenMenu={(event, nextBranch) => setBranchMenu({ branch: nextBranch, x: event.clientX, y: event.clientY })}
              />
            ))}
          </div>
          <div className="branch-divider" />
          <button
            type="button"
            className="branch-create"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              props.controller.setNewBranchName("");
              setMetadataError(null);
              setMode("create");
            }}
          >
            <OfficialPlusIcon className="branch-create-plus-icon" />
            {t("home.composer.branchPopover.createBranch")}
          </button>
          {branchMenu ? (
            <BranchContextMenu
              x={branchMenu.x}
              y={branchMenu.y}
              branchName={branchMenu.branch.name}
              canDelete={canDeleteBranch(branchMenu.branch)}
              deleting={deletingBranch}
              onDelete={() => void handleDeleteBranch()}
              onClose={closeBranchMenu}
            />
          ) : null}
        </div>
      );
  }
}
