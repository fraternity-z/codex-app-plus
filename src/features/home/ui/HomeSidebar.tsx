import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import { collectDescendantThreadIds, createRpcThreadRuntimeCleanupTransport, forceCloseThreadRuntime, reportThreadCleanupError } from "../../conversation/service/threadRuntimeCleanup";
import type { AgentEnvironment, HostBridge, GitWorktreeEntry } from "../../../bridge/types";
import type { AuthStatus, ThreadSummary, AccountSummary } from "../../../domain/types";
import type { CodexSessionSearchResultOutput } from "../../../bridge/types";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { AppServerClient } from "../../../protocol/appServerClient";
import { useAppDispatch, useAppStoreApi } from "../../../state/store";
import { SidebarIcon } from "../../shared/ui/icons";
import { OfficialSettingsGearIcon } from "../../shared/ui/officialIcons";
import { useI18n } from "../../../i18n/useI18n";
import { SettingsPopover } from "./SettingsPopover";
import { WorkspaceSidebarSection } from "../../workspace/ui/WorkspaceSidebarSection";
import { WorkspaceSessionCleanupDialog } from "../../workspace/ui/WorkspaceSessionCleanupDialog";
import {
  listWorkspaceSessionCleanupCandidates,
  parseSessionRetentionDays,
  threadBelongsToWorkspace,
} from "../../workspace/model/workspaceThread";

export interface HomeSidebarProps {
  readonly appServerClient: AppServerClient;
  readonly agentEnvironment: AgentEnvironment;
  readonly hostBridge: HostBridge;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly codexSessionsError: string | null;
  readonly selectedRootId: string | null;
  readonly selectedThreadId: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
  readonly rateLimits: RateLimitSnapshot | null;
  readonly account: AccountSummary | null;
  readonly settingsMenuOpen: boolean;
  readonly collapsed: boolean;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSkills: () => void;
  readonly onLogin: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onSelectWorkspaceThread?: (rootId: string, threadId: string | null) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onCreateThreadInRoot?: (rootId: string) => Promise<void>;
  readonly onArchiveThread: (threadId: string) => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly worktrees?: ReadonlyArray<GitWorktreeEntry>;
  readonly onCreateWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onDeleteWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onReorderRoots?: (fromIndex: number, toIndex: number) => void;
}

function SidebarNav(props: {
  readonly onCreateThread: () => Promise<void>;
  readonly onOpenSearch: () => void;
  readonly onOpenSkills: () => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <nav className="sidebar-nav">
      <button type="button" className="sidebar-nav-item" onClick={() => void props.onCreateThread()}>
        <SidebarIcon kind="new-thread" />
        <span>{t("home.sidebar.newThread")}</span>
      </button>
      <button type="button" className="sidebar-nav-item" onClick={props.onOpenSearch}>
        <SidebarIcon kind="search" />
        <span>{t("home.sidebar.search")}</span>
      </button>
      <button type="button" className="sidebar-nav-item" onClick={props.onOpenSkills}>
        <SidebarIcon kind="skills" />
        <span>{t("home.sidebar.skills")}</span>
      </button>
    </nav>
  );
}

function findRootIdForSession(
  roots: ReadonlyArray<WorkspaceRoot>,
  session: Pick<CodexSessionSearchResultOutput, "cwd">,
): string | null {
  return roots.find((root) => threadBelongsToWorkspace(session.cwd, root.path))?.id ?? null;
}

function formatSearchPreview(
  value: string,
  maxLength = 96,
): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function formatSearchHighlight(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function SearchMatchPreview(props: { readonly match: CodexSessionSearchResultOutput["matches"][number] }): JSX.Element {
  const lineText = props.match.lineText;
  const startIndex = Math.max(0, props.match.startColumn - 1);
  const endIndex = Math.max(startIndex, props.match.endColumn - 1);
  const before = lineText.slice(0, startIndex);
  const highlight = lineText.slice(startIndex, endIndex);
  const after = lineText.slice(endIndex);

  return (
    <span className="sidebar-search-result-preview">
      {formatSearchPreview(before)}
      <mark>{formatSearchHighlight(highlight)}</mark>
      {formatSearchPreview(after)}
    </span>
  );
}

function SearchDialog(props: {
  readonly open: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly query: string;
  readonly results: ReadonlyArray<CodexSessionSearchResultOutput>;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly onChangeQuery: (value: string) => void;
  readonly onClose: () => void;
  readonly onOpenResult: (result: CodexSessionSearchResultOutput, rootId: string) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  const portalTarget = document.querySelector<HTMLElement>(".replica-main") ?? document.body;
  const backdropClassName = portalTarget === document.body
    ? "sidebar-search-backdrop"
    : "sidebar-search-backdrop sidebar-search-backdrop-main";
  const trimmedQuery = props.query.trim();
  const visibleResults = props.results
    .map((result) => ({ result, rootId: findRootIdForSession(props.roots, result) }))
    .filter((entry) => entry.rootId !== null) as ReadonlyArray<{ readonly result: CodexSessionSearchResultOutput; readonly rootId: string }>;
  const emptyState = trimmedQuery.length === 0
    ? t("home.sidebar.searchDialog.hint")
    : props.loading
      ? t("home.sidebar.searchDialog.loading")
      : props.error !== null
        ? t("home.sidebar.searchDialog.error", { error: props.error })
        : visibleResults.length === 0
          ? t("home.sidebar.searchDialog.empty")
          : null;

  return createPortal(
    <div className={backdropClassName} role="presentation" onClick={props.onClose}>
      <section
        className="sidebar-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("home.sidebar.searchDialog.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <label className="sidebar-search-input-shell">
          <SidebarIcon kind="search" />
          <input
            ref={inputRef}
            className="sidebar-search-input"
            type="search"
            value={props.query}
            onChange={(event) => props.onChangeQuery(event.target.value)}
            placeholder={t("home.sidebar.searchDialog.placeholder")}
            aria-label={t("home.sidebar.searchDialog.placeholder")}
          />
        </label>
        {emptyState !== null ? (
          <div className="sidebar-search-empty" role={props.error !== null ? "alert" : undefined}>
            {emptyState}
          </div>
        ) : (
          <ul className="sidebar-search-results" role="list">
            {visibleResults.map(({ result, rootId }) => {
              const match = result.matches[0] ?? null;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    className="sidebar-search-result"
                    onClick={() => props.onOpenResult(result, rootId)}
                  >
                    <span className="sidebar-search-result-title-row">
                      <span className="sidebar-search-result-title">{result.title.trim() || t("home.sidebar.searchDialog.untitled")}</span>
                      <span className="sidebar-search-result-meta">{result.cwd.split(/[\\/]/).filter(Boolean).pop() ?? result.cwd}</span>
                    </span>
                    {match !== null ? <SearchMatchPreview match={match} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>,
    portalTarget,
  );
}

function HomeSidebarComponent(props: HomeSidebarProps): JSX.Element {
  const {
    agentEnvironment,
    appServerClient,
    authBusy,
    authLoginPending,
    authMode,
    authStatus,
    account,
    codexSessions,
    codexSessionsError,
    collapsed,
    hostBridge,
    onAddRoot,
    onArchiveThread,
    onCreateThread,
    onCreateThreadInRoot,
    onDismissSettingsMenu,
    onLogin,
    onLogout,
    onOpenSettings,
    onOpenSkills,
    onRemoveRoot,
    onCreateWorktree,
    onDeleteWorktree,
    onReorderRoots,
    onSelectRoot,
    onSelectThread,
    onSelectWorkspaceThread,
    onToggleSettingsMenu,
    rateLimits,
    roots,
    selectedRootId,
    selectedThreadId,
    settingsMenuOpen,
    worktrees,
  } = props;
  const dispatch = useAppDispatch();
  const store = useAppStoreApi();
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReadonlyArray<CodexSessionSearchResultOutput>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cleanupRoot, setCleanupRoot] = useState<WorkspaceRoot | null>(null);
  const [cleanupRetentionInput, setCleanupRetentionInput] = useState("30");
  const [cleanupPending, setCleanupPending] = useState(false);
  const sidebarClassName = collapsed ? "replica-sidebar sidebar-collapsed" : "replica-sidebar";
  const cleanupTransport = useMemo(
    () => createRpcThreadRuntimeCleanupTransport(appServerClient),
    [appServerClient],
  );
  const cleanupRetentionDays = useMemo(
    () => parseSessionRetentionDays(cleanupRetentionInput),
    [cleanupRetentionInput],
  );
  const cleanupCandidates = useMemo(
    () => cleanupRoot === null || cleanupRetentionDays === null
      ? []
      : listWorkspaceSessionCleanupCandidates(codexSessions, cleanupRoot.path, cleanupRetentionDays),
    [cleanupRetentionDays, cleanupRoot, codexSessions],
  );
  const cleanupError = cleanupRetentionDays === null
    ? t("home.workspaceSection.cleanupSessionsInvalidDays")
    : null;

  const clearSelectedThread = useCallback((threadId: string) => {
    if (threadId === selectedThreadId) {
      onSelectThread(null);
    }
  }, [onSelectThread, selectedThreadId]);

  const handleArchiveThread = useCallback(async (thread: ThreadSummary) => {
    await onArchiveThread(thread.id);
    clearSelectedThread(thread.id);
  }, [clearSelectedThread, onArchiveThread]);

  const handleDeleteThread = useCallback(async (thread: ThreadSummary) => {
    const { conversationsById } = store.getState();
    const conversation = conversationsById[thread.id] ?? null;

    try {
      if (thread.source !== "codexData" || conversation !== null) {
        const descendantThreadIds = collectDescendantThreadIds(thread.id, conversationsById);
        for (const threadId of [...descendantThreadIds, thread.id]) {
          await forceCloseThreadRuntime(threadId, conversationsById[threadId] ?? null, cleanupTransport);
        }
      }
    } catch (error) {
      reportThreadCleanupError(dispatch, conversation, error);
      throw error;
    }

    if (conversation !== null) {
      dispatch({ type: "conversation/statusChanged", conversationId: thread.id, status: "notLoaded", activeFlags: [] });
      dispatch({ type: "conversation/resumeStateChanged", conversationId: thread.id, resumeState: "needs_resume" });
    }

    await hostBridge.app.deleteCodexSession({ threadId: thread.id, agentEnvironment: thread.agentEnvironment });
    dispatch({ type: "conversation/hiddenChanged", conversationId: thread.id, hidden: true });
    clearSelectedThread(thread.id);
  }, [cleanupTransport, clearSelectedThread, dispatch, hostBridge, store]);

  const handleOpenCleanupSessions = useCallback(async (root: WorkspaceRoot) => {
    setCleanupRoot(root);
    setCleanupRetentionInput("30");
    setCleanupPending(false);
  }, []);

  const handleCloseCleanupSessions = useCallback(() => {
    if (!cleanupPending) {
      setCleanupRoot(null);
    }
  }, [cleanupPending]);

  const handleConfirmCleanupSessions = useCallback(async () => {
    if (cleanupRoot === null || cleanupRetentionDays === null || cleanupCandidates.length === 0 || cleanupPending) {
      return;
    }
    setCleanupPending(true);
    try {
      for (const thread of cleanupCandidates) {
        await handleDeleteThread(thread);
      }
      setCleanupRoot(null);
    } finally {
      setCleanupPending(false);
    }
  }, [cleanupCandidates, cleanupPending, cleanupRetentionDays, cleanupRoot, handleDeleteThread]);

  const handleCleanupRetentionInputChange = useCallback((value: string) => {
    if (!cleanupPending) {
      setCleanupRetentionInput(value);
    }
  }, [cleanupPending]);

  const handleCleanupSessions = useCallback(async (root: WorkspaceRoot) => {
    await handleOpenCleanupSessions(root);
  }, [handleOpenCleanupSessions]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length === 0) {
      setSearchLoading(false);
      setSearchError(null);
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void hostBridge.app.searchCodexSessions({
        agentEnvironment,
        query: trimmedQuery,
        limit: 20,
      }).then((results) => {
        if (cancelled) {
          return;
        }
        setSearchResults(results);
        setSearchLoading(false);
      }).catch((error) => {
        if (cancelled) {
          return;
        }
        setSearchResults([]);
        setSearchLoading(false);
        setSearchError(error instanceof Error ? error.message : String(error));
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [agentEnvironment, hostBridge.app, searchOpen, searchQuery]);

  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(false);
  }, []);

  const handleOpenSearchResult = useCallback((result: CodexSessionSearchResultOutput, rootId: string) => {
    if (props.onSelectWorkspaceThread) {
      props.onSelectWorkspaceThread(rootId, result.id);
    } else {
      props.onSelectRoot(rootId);
      props.onSelectThread(result.id);
    }
    handleCloseSearch();
  }, [handleCloseSearch, props]);

  const handleOpenRootInFileExplorer = useCallback((root: WorkspaceRoot) => (
    props.hostBridge.app.openWorkspace({ path: root.path, opener: "explorer" })
  ), [props.hostBridge.app]);

  return (
    <aside className={sidebarClassName}>
      {settingsMenuOpen ? <button type="button" className="settings-backdrop" onClick={onDismissSettingsMenu} aria-label={t("home.sidebar.closeMenu")} /> : null}
      <SidebarNav onCreateThread={onCreateThread} onOpenSearch={handleOpenSearch} onOpenSkills={onOpenSkills} />
      <SearchDialog
        open={searchOpen}
        loading={searchLoading}
        error={searchError}
        query={searchQuery}
        results={searchResults}
        roots={roots}
        onChangeQuery={setSearchQuery}
        onClose={handleCloseSearch}
        onOpenResult={handleOpenSearchResult}
      />
      <WorkspaceSidebarSection
        roots={roots}
        codexSessions={codexSessions}
        error={codexSessionsError}
        selectedRootId={selectedRootId}
        selectedThreadId={selectedThreadId}
        worktreePaths={worktrees?.map((worktree) => worktree.path)}
        onSelectRoot={onSelectRoot}
        onSelectThread={onSelectThread}
        onSelectWorkspaceThread={onSelectWorkspaceThread}
        onArchiveThread={handleArchiveThread}
        onDeleteThread={handleDeleteThread}
        onAddRoot={onAddRoot}
        onCreateThread={onCreateThread}
        onCreateThreadInRoot={onCreateThreadInRoot}
        onRemoveRoot={onRemoveRoot}
        onOpenRootInFileExplorer={handleOpenRootInFileExplorer}
        onCreateWorktree={onCreateWorktree}
        onDeleteWorktree={onDeleteWorktree}
        onCleanupSessions={handleCleanupSessions}
        onReorderRoots={onReorderRoots}
      />
      {cleanupRoot !== null ? (
        <WorkspaceSessionCleanupDialog
          rootName={cleanupRoot.name}
          retentionDays={cleanupRetentionDays}
          retentionInput={cleanupRetentionInput}
          candidateCount={cleanupCandidates.length}
          error={cleanupError}
          pending={cleanupPending}
          onChangeRetentionInput={handleCleanupRetentionInputChange}
          onClose={handleCloseCleanupSessions}
          onConfirm={handleConfirmCleanupSessions}
        />
      ) : null}
      <div className="settings-slot">
        {settingsMenuOpen ? (
          <SettingsPopover
            authStatus={authStatus}
            authMode={authMode}
            authBusy={authBusy}
            authLoginPending={authLoginPending}
            rateLimits={rateLimits}
            account={account}
            appServerClient={appServerClient}
            onOpenSettings={onOpenSettings}
            onLogin={onLogin}
            onLogout={onLogout}
          />
        ) : null}
        <button type="button" className="sidebar-settings" onClick={onToggleSettingsMenu}>
          <OfficialSettingsGearIcon className="settings-gear" />
          <span>{t("home.sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  );
}

export const HomeSidebar = memo(HomeSidebarComponent);

HomeSidebar.displayName = "HomeSidebar";
