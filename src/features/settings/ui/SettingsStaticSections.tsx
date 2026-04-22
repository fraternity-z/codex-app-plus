import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../../../domain/types";
import { useI18n, type Locale } from "../../../i18n";
import { OfficialFolderIcon } from "../../shared/ui/officialIcons";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";

function SectionHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
}): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      {props.subtitle ? <p className="settings-subtitle">{props.subtitle}</p> : null}
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
      <section className="settings-card">
        <div className="settings-row">
          <div>
            <strong>{t("settings.worktree.autoCleanLabel")}</strong>
            <p>{t("settings.worktree.autoCleanDescription")}</p>
          </div>
          <span className="settings-toggle settings-toggle-on">
            <span className="settings-toggle-knob" />
          </span>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t("settings.worktree.retentionLabel")}</strong>
            <p>{t("settings.worktree.retentionDescription")}</p>
          </div>
          <span className="settings-chip settings-chip-sm">15</span>
        </div>
      </section>
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
