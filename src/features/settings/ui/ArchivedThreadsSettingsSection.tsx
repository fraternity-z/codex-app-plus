import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreadSummary } from "../../../domain/types";

interface ArchivedThreadsSettingsSectionProps {
  listArchivedThreads: () => Promise<ReadonlyArray<ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
}

interface ArchivedThreadRowProps {
  readonly thread: ThreadSummary;
  readonly pending: boolean;
  readonly errorMessage: string | null;
  readonly onUnarchive: (threadId: string) => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatUpdatedAt(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? updatedAt : new Date(timestamp).toLocaleString();
}

function clearThreadError(current: Readonly<Record<string, string>>, threadId: string): Record<string, string> {
  const next = { ...current };
  delete next[threadId];
  return next;
}

function ArchivedThreadRow(props: ArchivedThreadRowProps): JSX.Element {
  return (
    <div className="archived-thread-row">
      <div className="archived-thread-main">
        <div className="archived-thread-title">{props.thread.title}</div>
        <div className="archived-thread-meta">{props.thread.cwd ?? "未记录工作目录"}</div>
        <div className="archived-thread-meta">最近更新：{formatUpdatedAt(props.thread.updatedAt)}</div>
        {props.errorMessage ? <div className="archived-thread-error">{props.errorMessage}</div> : null}
      </div>
      <div className="archived-thread-actions">
        <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => void props.onUnarchive(props.thread.id)} disabled={props.pending}>
          {props.pending ? "取消归档中..." : "取消归档"}
        </button>
      </div>
    </div>
  );
}

function useArchivedThreadsState(props: ArchivedThreadsSettingsSectionProps) {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadSummary>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingThreadIds, setPendingThreadIds] = useState<ReadonlyArray<string>>([]);
  const [rowErrors, setRowErrors] = useState<Readonly<Record<string, string>>>({});
  const pendingThreadIdsSet = useMemo(() => new Set(pendingThreadIds), [pendingThreadIds]);

  const loadThreads = useCallback(async () => {
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
  }, [props.listArchivedThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

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

export function ArchivedThreadsSettingsSection(props: ArchivedThreadsSettingsSectionProps): JSX.Element {
  const state = useArchivedThreadsState(props);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">已归档线程</h1>
        <p className="settings-subtitle">查看已归档会话，并在需要时恢复到主线程列表。</p>
      </header>
      <section className="settings-card">
        <div className="settings-section-head">
          <strong>归档列表</strong>
          <button type="button" className="settings-head-action" onClick={() => void state.loadThreads()} disabled={state.loading}>刷新</button>
        </div>
        <p className="settings-note settings-note-pad">这里只展示 app-server 官方归档线程；本地 `codexData` 会话不在此列表中。</p>
        {state.errorMessage ? <p className="settings-status-note settings-status-note-error">{state.errorMessage}</p> : null}
        {state.loading ? <div className="settings-empty">正在加载已归档线程...</div> : null}
        {!state.loading && state.errorMessage === null && state.threads.length === 0 ? <div className="settings-empty">暂无已归档线程。</div> : null}
        {!state.loading && state.errorMessage === null
          ? state.threads.map((thread) => (
              <ArchivedThreadRow key={thread.id} thread={thread} pending={state.pendingThreadIdsSet.has(thread.id)} errorMessage={state.rowErrors[thread.id] ?? null} onUnarchive={state.handleUnarchive} />
            ))
          : null}
      </section>
    </div>
  );
}