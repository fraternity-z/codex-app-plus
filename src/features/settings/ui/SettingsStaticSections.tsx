import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SaveSshHostInput, SshHostConfig } from "../../../bridge/types";
import type { ThreadSummary } from "../../../domain/types";
import type { SshRemoteConnectionState } from "../../../domain/types";
import { useI18n, type Locale } from "../../../i18n";
import { OfficialFolderIcon } from "../../shared/ui/officialIcons";
import { OverlayPortal } from "../../shared/ui/OverlayPortal";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";

function SectionHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly badgeLabel?: string;
  readonly notice?: string;
}): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <div className="settings-title-row">
        <h1 className="settings-page-title">{props.title}</h1>
        {props.badgeLabel ? <span className="settings-experimental-badge">{props.badgeLabel}</span> : null}
      </div>
      {props.subtitle ? <p className="settings-subtitle">{props.subtitle}</p> : null}
      {props.notice ? <p className="settings-experimental-notice">{props.notice}</p> : null}
    </header>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatUpdatedAt(updatedAt: string, locale: Locale): string {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return updatedAt;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function clearThreadError(current: Readonly<Record<string, string>>, threadId: string): Record<string, string> {
  const next = { ...current };
  delete next[threadId];
  return next;
}

interface ArchivedThreadRowProps {
  readonly thread: ThreadSummary;
  readonly pending: boolean;
  readonly errorMessage: string | null;
  readonly onUnarchive: (threadId: string) => Promise<void>;
}

function ArchivedThreadRow(props: ArchivedThreadRowProps): JSX.Element {
  const { locale, t } = useI18n();

  return (
    <div className="archived-thread-row">
      <div className="archived-thread-main">
        <div className="archived-thread-title">{props.thread.title}</div>
        <div className="archived-thread-meta">{props.thread.cwd ?? t("settings.archived.cwdMissing")}</div>
        <div className="archived-thread-meta">
          {t("settings.archived.updatedAt", {
            time: formatUpdatedAt(props.thread.updatedAt, locale)
          })}
        </div>
        {props.errorMessage ? <div className="archived-thread-error">{props.errorMessage}</div> : null}
      </div>
      <div className="archived-thread-actions">
        <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => void props.onUnarchive(props.thread.id)} disabled={props.pending}>
          {props.pending ? t("settings.archived.unarchiving") : t("settings.archived.unarchiveAction")}
        </button>
      </div>
    </div>
  );
}

function useArchivedThreadsState(props: {
  readonly ready?: boolean;
  listArchivedThreads: () => Promise<ReadonlyArray<ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
}) {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadSummary>>([]);
  const [loading, setLoading] = useState(props.ready !== false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingThreadIds, setPendingThreadIds] = useState<ReadonlyArray<string>>([]);
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, string>>>({});
  const pendingThreadIdsSet = useMemo(() => new Set(pendingThreadIds), [pendingThreadIds]);

  const loadThreads = useCallback(async () => {
    if (props.ready === false) {
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setRowErrors({});
    try {
      setThreads(await props.listArchivedThreads());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [props.listArchivedThreads, props.ready]);

  useEffect(() => {
    if (props.ready === false) {
      setLoading(true);
      setErrorMessage(null);
      return;
    }
    void loadThreads();
  }, [loadThreads, props.ready]);

  const handleUnarchive = useCallback(async (threadId: string) => {
    setPendingThreadIds((current) => (current.includes(threadId) ? current : [...current, threadId]));
    setRowErrors((current) => clearThreadError(current, threadId));
    try {
      await props.unarchiveThread(threadId);
      setThreads((current) => current.filter((thread) => thread.id !== threadId));
    } catch (error) {
      setRowErrors((current) => ({ ...current, [threadId]: toErrorMessage(error) }));
    } finally {
      setPendingThreadIds((current) => current.filter((id) => id !== threadId));
    }
  }, [props.unarchiveThread]);

  return { threads, loading, errorMessage, rowErrors, pendingThreadIdsSet, loadThreads, handleUnarchive };
}

export function EnvironmentContent(props: {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly ready?: boolean;
  readonly onAddRoot: () => void;
  listArchivedThreads: () => Promise<ReadonlyArray<ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const archivedState = useArchivedThreadsState(props);
  const ready = props.ready !== false;

  return (
    <div className="settings-panel-group">
      <SectionHeader title={t("settings.environment.title")} />
      <section className="settings-card">
        <div className="settings-section-head">
          <strong>{t("settings.environment.workspacesTitle")}</strong>
          <button type="button" className="settings-head-action" onClick={props.onAddRoot}>
            {t("settings.environment.addProjectAction")}
          </button>
        </div>
        {props.roots.map((root) => (
          <div key={root.id} className="settings-env-row">
            <div className="settings-env-main">
              <OfficialFolderIcon className="settings-folder" />
              <strong>{root.name}</strong>
              <span>{root.path}</span>
            </div>
          </div>
        ))}
        {props.roots.length === 0 ? (
          <div className="settings-empty">{t("settings.environment.empty")}</div>
        ) : null}
      </section>
      <section className="settings-panel-group">
        <h2 className="settings-section-title">{t("settings.archived.title")}</h2>
        <section className="settings-card">
          <div className="settings-section-head">
            <strong>{t("settings.archived.listTitle")}</strong>
            <button type="button" className="settings-head-action" onClick={() => void archivedState.loadThreads()} disabled={!ready || archivedState.loading}>
              {t("settings.archived.refreshAction")}
            </button>
          </div>
          {archivedState.errorMessage ? <p className="settings-status-note settings-status-note-error">{archivedState.errorMessage}</p> : null}
          {archivedState.loading ? <div className="settings-empty">{t("settings.archived.loading")}</div> : null}
          {!archivedState.loading && archivedState.errorMessage === null && archivedState.threads.length === 0 ? (
            <div className="settings-empty">{t("settings.archived.empty")}</div>
          ) : null}
          {!archivedState.loading && archivedState.errorMessage === null
            ? archivedState.threads.map((thread) => (
                <ArchivedThreadRow key={thread.id} thread={thread} pending={archivedState.pendingThreadIdsSet.has(thread.id)} errorMessage={archivedState.rowErrors[thread.id] ?? null} onUnarchive={archivedState.handleUnarchive} />
              ))
            : null}
        </section>
      </section>
    </div>
  );
}

export function WorktreeContent(props: {
  readonly worktrees: ReadonlyArray<{ readonly path: string; readonly branch: string | null; readonly isCurrent: boolean }>;
  readonly onCreateWorktree?: () => Promise<void>;
  readonly onDeleteWorktree?: (worktreePath: string) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <SectionHeader title={t("settings.worktree.title")} />
      <section className="settings-panel-group">
        <h2 className="settings-section-title">{t("settings.worktree.managedTitle")}</h2>
        <section className="settings-card">
          {props.worktrees.length === 0 ? (
            <div className="settings-empty">{t("settings.worktree.empty")}</div>
          ) : (
            props.worktrees.map((worktree) => (
              <div key={worktree.path} className="settings-env-row">
                <div className="settings-env-main">
                  <strong>{worktree.branch ?? t("settings.worktree.unknownBranch")}</strong>
                  <span>{worktree.path}</span>
                </div>
                {props.onDeleteWorktree ? (
                  <button type="button" className="settings-head-action" onClick={() => {
                    void props.onDeleteWorktree?.(worktree.path);
                  }}>
                    {t("settings.worktree.deleteAction")}
                  </button>
                ) : null}
              </div>
            ))
          )}
          {props.onCreateWorktree ? (
            <div className="settings-section-head">
              <button type="button" className="settings-head-action" onClick={() => {
                void props.onCreateWorktree?.();
              }}>
                {t("settings.worktree.createAction")}
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}

function PlaceholderTodoBadge(): JSX.Element {
  const { t } = useI18n();

  return <span className="settings-placeholder-todo">{t("settings.placeholder.todo")}</span>;
}

function RefreshIcon(): JSX.Element {
  return (
    <svg className="settings-placeholder-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.6 7.1a4.7 4.7 0 0 0-8.1-2.8L3.3 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.2 2.7v2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 8.9a4.7 4.7 0 0 0 8.1 2.8l1.2-1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.8 13.3v-2.9H9.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LocalDeviceIcon(): JSX.Element {
  return (
    <svg className="settings-connection-placeholder-icon" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M6.5 8.5h15v9h-15z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 20h20M12 17.5v2.5M16 17.5v2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RemoteDeviceIcon(): JSX.Element {
  return (
    <svg className="settings-connection-placeholder-icon" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="6.5" y="5.5" width="15" height="17" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.5 11h15M6.5 16.5h15" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.6" cy="8.3" r="0.9" fill="currentColor" />
      <circle cx="17.6" cy="13.8" r="0.9" fill="currentColor" />
      <circle cx="17.6" cy="19.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function formatSshHostMeta(host: SshHostConfig): string {
  const userPrefix = host.user === null ? "" : `${host.user}@`;
  const name = host.hostName ?? host.alias;
  const port = host.port === null || host.port === 22 ? "" : `:${host.port}`;
  return `${userPrefix}${name}${port}`;
}

function inferRemoteRootName(hostAlias: string, path: string): string {
  const normalized = path.replace(/[\\/]+$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  const baseName = segments[segments.length - 1] ?? normalized;
  return `${hostAlias}:${baseName || path}`;
}

function useSshHostsState(listSshHosts: () => Promise<ReadonlyArray<SshHostConfig>>) {
  const [hosts, setHosts] = useState<ReadonlyArray<SshHostConfig>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      setHosts(await listSshHosts());
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [listSshHosts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { hosts, loading, errorMessage, refresh };
}

type SshAuthMode = "none" | "identityFile";

interface AddSshHostDraft {
  readonly alias: string;
  readonly hostName: string;
  readonly port: string;
  readonly authMode: SshAuthMode;
  readonly identityFile: string;
}

function createEmptySshHostDraft(): AddSshHostDraft {
  return {
    alias: "",
    hostName: "",
    port: "",
    authMode: "none",
    identityFile: "",
  };
}

function createSaveSshHostInput(draft: AddSshHostDraft, invalidPortMessage: string): SaveSshHostInput {
  const portText = draft.port.trim();
  let port: number | null = null;
  if (portText.length > 0) {
    const parsedPort = Number.parseInt(portText, 10);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535 || String(parsedPort) !== portText) {
      throw new Error(invalidPortMessage);
    }
    port = parsedPort;
  }
  const identityFile = draft.authMode === "identityFile" ? draft.identityFile.trim() : null;
  return {
    alias: draft.alias.trim(),
    hostName: draft.hostName.trim(),
    port,
    identityFile: identityFile === "" ? null : identityFile,
  };
}

function AddSshHostDialog(props: {
  readonly draft: AddSshHostDraft;
  readonly errorMessage: string | null;
  readonly saving: boolean;
  readonly onChangeDraft: (draft: AddSshHostDraft) => void;
  readonly onError: (message: string | null) => void;
  readonly onCancel: () => void;
  readonly onSave: () => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const disableSave = props.saving
    || props.draft.alias.trim().length === 0
    || props.draft.hostName.trim().length === 0
    || (props.draft.authMode === "identityFile" && props.draft.identityFile.trim().length === 0);
  const updateDraft = (patch: Partial<AddSshHostDraft>) => {
    props.onChangeDraft({ ...props.draft, ...patch });
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void props.onSave();
  };
  const pickIdentityFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: t("settings.connections.selectIdentityFile"),
      });
      if (typeof selected === "string") {
        updateDraft({ authMode: "identityFile", identityFile: selected });
      }
    } catch (error) {
      props.onError(toErrorMessage(error));
    }
  };

  const dialogNode = (
    <div className="settings-dialog-backdrop" role="presentation" onClick={props.onCancel}>
      <section
        className="settings-dialog settings-ssh-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.connections.addDialogTitle")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <div className="settings-dialog-title-row">
            <strong>{t("settings.connections.addDialogTitle")}</strong>
            <span className="settings-experimental-badge">{t("settings.experimental.badge")}</span>
          </div>
          <button type="button" className="settings-dialog-close" onClick={props.onCancel} aria-label={t("settings.connections.closeDialog")}>×</button>
        </header>
        <form className="settings-dialog-body settings-ssh-dialog-body" onSubmit={handleSubmit}>
          <label className="settings-form-field">
            <span>{t("settings.connections.displayNameLabel")}</span>
            <input
              className="settings-text-input settings-ssh-dialog-input"
              aria-label={t("settings.connections.displayNameLabel")}
              autoFocus
              value={props.draft.alias}
              disabled={props.saving}
              onChange={(event) => updateDraft({ alias: event.target.value })}
            />
          </label>
          <label className="settings-form-field">
            <span>{t("settings.connections.hostNameLabel")}</span>
            <input
              className="settings-text-input settings-ssh-dialog-input"
              aria-label={t("settings.connections.hostNameLabel")}
              placeholder={t("settings.connections.hostNamePlaceholder")}
              value={props.draft.hostName}
              disabled={props.saving}
              onChange={(event) => updateDraft({ hostName: event.target.value })}
            />
          </label>
          <label className="settings-form-field">
            <span>{t("settings.connections.portLabel")}</span>
            <input
              className="settings-text-input settings-ssh-dialog-input"
              aria-label={t("settings.connections.portLabel")}
              inputMode="numeric"
              value={props.draft.port}
              disabled={props.saving}
              onChange={(event) => updateDraft({ port: event.target.value })}
            />
          </label>
          <div className="settings-ssh-auth-toggle" role="group" aria-label={t("settings.connections.authMethodLabel")}>
            <button
              type="button"
              className={["settings-toggle-button", props.draft.authMode === "none" ? "settings-toggle-button-active" : ""].filter(Boolean).join(" ")}
              disabled={props.saving}
              onClick={() => updateDraft({ authMode: "none" })}
            >
              {t("settings.connections.authNone")}
            </button>
            <button
              type="button"
              className={["settings-toggle-button", props.draft.authMode === "identityFile" ? "settings-toggle-button-active" : ""].filter(Boolean).join(" ")}
              disabled={props.saving}
              onClick={() => updateDraft({ authMode: "identityFile" })}
            >
              {t("settings.connections.authIdentityFile")}
            </button>
          </div>
          {props.draft.authMode === "identityFile" ? (
            <label className="settings-form-field">
              <span>{t("settings.connections.identityFileLabel")}</span>
              <div className="settings-ssh-identity-row">
                <input
                  className="settings-text-input settings-ssh-dialog-input"
                  aria-label={t("settings.connections.identityFileLabel")}
                  placeholder={t("settings.connections.identityFilePlaceholder")}
                  value={props.draft.identityFile}
                  disabled={props.saving}
                  onChange={(event) => updateDraft({ identityFile: event.target.value })}
                />
                <button type="button" className="settings-action-btn settings-action-btn-secondary" disabled={props.saving} onClick={() => void pickIdentityFile()}>
                  {t("settings.connections.browseIdentityFile")}
                </button>
              </div>
            </label>
          ) : null}
          {props.errorMessage ? <p className="settings-status-note settings-status-note-error">{props.errorMessage}</p> : null}
          <div className="settings-ssh-dialog-actions">
            <button type="button" className="settings-action-btn settings-action-btn-secondary" disabled={props.saving} onClick={props.onCancel}>
              {t("settings.connections.cancelAction")}
            </button>
            <button type="submit" className="settings-action-btn settings-action-btn-primary" disabled={disableSave}>
              {props.saving ? t("settings.connections.savingHost") : t("settings.connections.saveHost")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  return <OverlayPortal>{dialogNode}</OverlayPortal>;
}

function SshHostRow(props: {
  readonly host: SshHostConfig;
  readonly active: boolean;
  readonly pending: boolean;
  readonly pendingHost: string | null;
  readonly disabled: boolean;
  readonly onConnect: (hostAlias: string) => Promise<void>;
  readonly onDisconnect: () => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const rowPending = props.pending && (props.pendingHost === props.host.alias || (props.active && props.pendingHost === null));
  const buttonLabel = rowPending
    ? (props.active ? t("settings.connections.disconnecting") : t("settings.connections.connecting"))
    : props.active
      ? t("settings.connections.disconnectAction")
      : t("settings.connections.connectAction");
  const handleClick = () => {
    if (props.active) {
      void props.onDisconnect();
      return;
    }
    void props.onConnect(props.host.alias);
  };

  return (
    <div className={["settings-ssh-host-row", props.active ? "settings-ssh-host-row-active" : ""].filter(Boolean).join(" ")}>
      <div className="settings-ssh-host-main">
        <div className="settings-ssh-host-title">
          <strong>{props.host.alias}</strong>
          {props.active ? <span className="settings-ssh-status-pill">{t("settings.connections.activeBadge")}</span> : null}
        </div>
        <span className="settings-ssh-host-meta">{formatSshHostMeta(props.host)}</span>
        {!props.host.resolved && props.host.resolveError ? (
          <span className="settings-ssh-host-warning">{props.host.resolveError}</span>
        ) : null}
      </div>
      <button
        type="button"
        className={props.active ? "settings-action-btn settings-action-btn-secondary" : "settings-action-btn"}
        disabled={props.disabled || rowPending}
        onClick={handleClick}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function HooksPlaceholderContent(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group settings-hooks-page">
      <header className="settings-title-wrap settings-title-wrap-with-action">
        <div>
          <div className="settings-title-row">
            <h1 className="settings-page-title">{t("settings.hooks.title")}</h1>
            <span className="settings-experimental-badge">{t("settings.experimental.badge")}</span>
          </div>
          <p className="settings-subtitle">
            {t("settings.hooks.subtitle")} <span className="settings-placeholder-link">{t("settings.hooks.learnMore")}</span>
          </p>
          <p className="settings-experimental-notice">{t("settings.experimental.availabilityNotice")}</p>
        </div>
        <button type="button" className="settings-placeholder-icon-button" aria-label={t("settings.hooks.refreshAction")} disabled>
          <RefreshIcon />
        </button>
      </header>
      <section className="settings-card settings-hooks-placeholder-card">
        <div className="settings-placeholder-stack">
          <strong>{t("settings.hooks.emptyTitle")}</strong>
          <span>{t("settings.hooks.emptyDescription")}</span>
          <PlaceholderTodoBadge />
        </div>
      </section>
    </div>
  );
}

export function ConnectionsPlaceholderContent(props: {
  readonly busy: boolean;
  readonly sshRemoteConnection: SshRemoteConnectionState;
  readonly listSshHosts: () => Promise<ReadonlyArray<SshHostConfig>>;
  readonly saveSshHost: (input: SaveSshHostInput) => Promise<SshHostConfig>;
  readonly connectSshRemoteHost: (hostAlias: string) => Promise<void>;
  readonly disconnectSshRemoteHost: () => Promise<void>;
  readonly onAddRemoteRoot: (input: { readonly name: string; readonly path: string }) => void;
}): JSX.Element {
  const { t } = useI18n();
  const sshHosts = useSshHostsState(props.listSshHosts);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogDraft, setAddDialogDraft] = useState<AddSshHostDraft>(() => createEmptySshHostDraft());
  const [addDialogError, setAddDialogError] = useState<string | null>(null);
  const [savingHost, setSavingHost] = useState(false);
  const [remoteProjectPath, setRemoteProjectPath] = useState("");
  const [projectFeedback, setProjectFeedback] = useState<string | null>(null);
  const disabled = props.busy || props.sshRemoteConnection.pending;
  const activeHost = props.sshRemoteConnection.activeHost;
  const displayedError = actionError ?? props.sshRemoteConnection.error ?? sshHosts.errorMessage;
  const { connectSshRemoteHost, disconnectSshRemoteHost, onAddRemoteRoot, saveSshHost } = props;

  const connectHost = useCallback(async (hostAlias: string) => {
    setActionError(null);
    try {
      await connectSshRemoteHost(hostAlias);
    } catch (error) {
      setActionError(toErrorMessage(error));
    }
  }, [connectSshRemoteHost]);

  const disconnectHost = useCallback(async () => {
    setActionError(null);
    try {
      await disconnectSshRemoteHost();
    } catch (error) {
      setActionError(toErrorMessage(error));
    }
  }, [disconnectSshRemoteHost]);

  const closeAddDialog = useCallback(() => {
    if (savingHost) {
      return;
    }
    setAddDialogOpen(false);
    setAddDialogError(null);
    setAddDialogDraft(createEmptySshHostDraft());
  }, [savingHost]);

  const saveHost = useCallback(async () => {
    setAddDialogError(null);
    setSavingHost(true);
    try {
      await saveSshHost(createSaveSshHostInput(addDialogDraft, t("settings.connections.invalidPort")));
      await sshHosts.refresh();
      setAddDialogOpen(false);
      setAddDialogDraft(createEmptySshHostDraft());
    } catch (error) {
      setAddDialogError(toErrorMessage(error));
    } finally {
      setSavingHost(false);
    }
  }, [addDialogDraft, saveSshHost, sshHosts.refresh, t]);

  const addRemoteProject = useCallback(() => {
    if (activeHost === null) {
      return;
    }
    const path = remoteProjectPath.trim();
    if (path.length === 0) {
      setProjectFeedback(t("settings.connections.remoteProjectEmpty"));
      return;
    }
    onAddRemoteRoot({
      name: inferRemoteRootName(activeHost, path),
      path,
    });
    setRemoteProjectPath("");
    setProjectFeedback(t("settings.connections.remoteProjectAdded"));
  }, [activeHost, onAddRemoteRoot, remoteProjectPath, t]);

  return (
    <div className="settings-panel-group settings-connections-page">
      <SectionHeader
        title={t("settings.connections.title")}
        subtitle={t("settings.connections.subtitle")}
        badgeLabel={t("settings.experimental.badge")}
        notice={t("settings.experimental.availabilityNotice")}
      />
      <section className="settings-page-section">
        <div className="settings-section-head">
          <div className="settings-section-title-row">
            <h2 className="settings-section-title">{t("settings.connections.sshTitle")}</h2>
            <span className="settings-experimental-badge">{t("settings.experimental.badge")}</span>
          </div>
          <div className="settings-section-actions">
            <button
              type="button"
              className="settings-head-action"
              onClick={() => {
                setAddDialogDraft(createEmptySshHostDraft());
                setAddDialogError(null);
                setAddDialogOpen(true);
              }}
              disabled={savingHost}
            >
              {t("settings.connections.addHost")}
            </button>
            <button type="button" className="settings-head-action" disabled={sshHosts.loading} onClick={() => void sshHosts.refresh()}>
              {sshHosts.loading ? t("settings.connections.refreshingHosts") : t("settings.connections.refreshHosts")}
            </button>
          </div>
        </div>
        <section className="settings-card settings-connection-card">
          <div className="settings-connection-summary">
            <div className="settings-connection-placeholder-visual" aria-hidden="true">
              <LocalDeviceIcon />
              <span className="settings-connection-placeholder-dots">...</span>
              <RemoteDeviceIcon />
            </div>
            <p className="settings-connection-placeholder-copy">
              {activeHost === null
                ? t("settings.connections.localModeDescription")
                : t("settings.connections.remoteModeDescription", { host: activeHost })}
            </p>
          </div>
          {displayedError ? <p className="settings-status-note settings-status-note-error">{displayedError}</p> : null}
          {sshHosts.loading ? <div className="settings-empty">{t("settings.connections.loadingHosts")}</div> : null}
          {!sshHosts.loading && sshHosts.hosts.length === 0 ? (
            <div className="settings-ssh-empty">
              <strong>{t("settings.connections.emptyTitle")}</strong>
              <span>{t("settings.connections.emptyDescription")}</span>
            </div>
          ) : null}
          {!sshHosts.loading ? sshHosts.hosts.map((host) => (
            <SshHostRow
              key={host.alias}
              host={host}
              active={activeHost === host.alias}
              pending={props.sshRemoteConnection.pending}
              pendingHost={props.sshRemoteConnection.pendingHost}
              disabled={disabled}
              onConnect={connectHost}
              onDisconnect={disconnectHost}
            />
          )) : null}
        </section>
      </section>
      <section className="settings-page-section">
        <div className="settings-section-title-row">
          <h2 className="settings-section-title">{t("settings.connections.remoteProjectTitle")}</h2>
          <span className="settings-experimental-badge">{t("settings.experimental.badge")}</span>
        </div>
        <section className="settings-card settings-remote-project-card">
          <div className="settings-form-row">
            <label htmlFor="remote-project-path">{t("settings.connections.remoteProjectLabel")}</label>
            <input
              id="remote-project-path"
              className="settings-text-input settings-remote-project-input"
              value={remoteProjectPath}
              placeholder={t("settings.connections.remoteProjectPlaceholder")}
              disabled={activeHost === null}
              onChange={(event) => {
                setProjectFeedback(null);
                setRemoteProjectPath(event.target.value);
              }}
            />
          </div>
          <div className="settings-section-head">
            <span className="settings-status-note">
              {activeHost === null
                ? t("settings.connections.remoteProjectDisabled")
                : t("settings.connections.remoteProjectHelp", { host: activeHost })}
            </span>
            <button
              type="button"
              className="settings-action-btn"
              disabled={activeHost === null || remoteProjectPath.trim().length === 0}
              onClick={addRemoteProject}
            >
              {t("settings.connections.addRemoteProjectAction")}
            </button>
          </div>
          {projectFeedback ? <p className="settings-status-note">{projectFeedback}</p> : null}
        </section>
      </section>
      {addDialogOpen ? (
        <AddSshHostDialog
          draft={addDialogDraft}
          errorMessage={addDialogError}
          saving={savingHost}
          onChangeDraft={(draft) => {
            setAddDialogError(null);
            setAddDialogDraft(draft);
          }}
          onError={setAddDialogError}
          onCancel={closeAddDialog}
          onSave={saveHost}
        />
      ) : null}
    </div>
  );
}

export function PlaceholderContent(props: { readonly sectionTitle: string }): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group">
      <SectionHeader title={props.sectionTitle} />
      <section className="settings-card">
        <div className="settings-placeholder">{t("settings.placeholder.message")}</div>
      </section>
    </div>
  );
}
