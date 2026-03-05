import type { ThreadSummary } from "../domain/types";

interface SidebarProps {
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly onSelect: (threadId: string) => void;
}

export function Sidebar({ threads, selectedThreadId, onSelect }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <h2>Threads</h2>
      <div className="thread-list">
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={thread.id === selectedThreadId ? "thread-item thread-active" : "thread-item"}
            onClick={() => onSelect(thread.id)}
          >
            <span className="thread-title">{thread.title}</span>
            <span className="thread-meta">
              {thread.archived ? "archived" : "active"} · {thread.updatedAt}
            </span>
          </button>
        ))}
        {threads.length === 0 ? <p className="empty-text">暂无线程</p> : null}
      </div>
    </aside>
  );
}
