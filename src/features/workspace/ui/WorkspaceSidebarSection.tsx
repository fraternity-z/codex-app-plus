import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { listThreadsForWorkspace } from "../model/workspaceThread";
import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import type { ThreadSummary } from "../../../domain/types";
import { OfficialChevronRightIcon, OfficialCloseIcon, OfficialFolderPlusIcon, OfficialSortIcon } from "../../shared/ui/officialIcons";
import { ThreadContextMenu } from "./ThreadContextMenu";

const DEFAULT_VISIBLE_THREAD_COUNT = 10;
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

interface WorkspaceSidebarSectionProps {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedRootId: string | null;
  readonly selectedThreadId: string | null;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onArchiveThread: (thread: ThreadSummary) => Promise<void>;
  readonly onDeleteThread: (thread: ThreadSummary) => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
}

interface WorkspaceRootRowProps {
  readonly root: WorkspaceRoot;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly threadCount: number;
  readonly onToggleExpanded: (rootId: string) => void;
  readonly onRemove: (rootId: string) => void;
}

interface WorkspaceRootItemProps {
  readonly root: WorkspaceRoot;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly selectedThreadId: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly showAllThreads: boolean;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onToggleExpanded: (rootId: string) => void;
  readonly onOpenMenu: (event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => void;
  readonly onToggleShowAllThreads: (rootId: string) => void;
  readonly onRemoveRoot: (rootId: string) => void;
}

interface ThreadMenuState {
  readonly thread: ThreadSummary;
  readonly x: number;
  readonly y: number;
}

function formatThreadUpdatedAt(updatedAt: string): string {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const elapsed = Date.now() - timestamp;
  if (elapsed >= 0 && elapsed < HOUR_IN_MS) {
    return `${Math.max(1, Math.floor(elapsed / MINUTE_IN_MS))} 分钟前`;
  }
  if (elapsed >= 0 && elapsed < DAY_IN_MS) {
    return `${Math.max(1, Math.floor(elapsed / HOUR_IN_MS))} 小时前`;
  }
  return new Date(timestamp).toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function getThreadLabel(thread: ThreadSummary): string {
  const title = thread.title.trim();
  return title.length > 0 ? title : "未命名会话";
}

function canArchiveThread(thread: ThreadSummary): boolean {
  return thread.source !== "codexData";
}

function createThreadsByRootId(roots: ReadonlyArray<WorkspaceRoot>, codexSessions: ReadonlyArray<ThreadSummary>) {
  return new Map(roots.map((root) => [root.id, listThreadsForWorkspace(codexSessions, root.path)]));
}

function toggleRootId(rootIds: ReadonlyArray<string>, rootId: string): ReadonlyArray<string> {
  return rootIds.includes(rootId) ? rootIds.filter((item) => item !== rootId) : [...rootIds, rootId];
}

function useExpandedRootId(
  roots: ReadonlyArray<WorkspaceRoot>,
  selectedRootId: string | null,
  onSelectRoot: (rootId: string) => void
) {
  const [expandedRootId, setExpandedRootId] = useState<string | null>(null);

  useEffect(() => {
    if (expandedRootId === null || roots.some((root) => root.id === expandedRootId)) {
      return;
    }
    setExpandedRootId(null);
  }, [expandedRootId, roots]);

  const toggleExpanded = useCallback((rootId: string) => {
    if (selectedRootId !== rootId) {
      onSelectRoot(rootId);
    }
    setExpandedRootId((current) => (current === rootId ? null : rootId));
  }, [onSelectRoot, selectedRootId]);

  return { expandedRootId, toggleExpanded };
}

function useThreadMenuState(props: Pick<WorkspaceSidebarSectionProps, "onArchiveThread" | "onDeleteThread">) {
  const [menuState, setMenuState] = useState<ThreadMenuState | null>(null);
  const openThreadMenu = useCallback((event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => {
    event.preventDefault();
    setMenuState({ thread, x: event.clientX, y: event.clientY });
  }, []);
  const closeMenu = useCallback(() => setMenuState(null), []);
  const handleArchiveThread = useCallback(async () => {
    if (menuState !== null) {
      await props.onArchiveThread(menuState.thread);
    }
  }, [menuState, props]);
  const handleDeleteThread = useCallback(async () => {
    if (menuState !== null) {
      await props.onDeleteThread(menuState.thread);
    }
  }, [menuState, props]);
  return { menuState, openThreadMenu, closeMenu, handleArchiveThread, handleDeleteThread };
}

const WorkspaceThreadItem = memo(function WorkspaceThreadItem(props: {
  readonly thread: ThreadSummary;
  readonly selected: boolean;
  readonly onSelect: (threadId: string | null) => void;
  readonly onOpenMenu: (event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => void;
}): JSX.Element {
  const className = props.selected ? "workspace-thread-button workspace-thread-button-active" : "workspace-thread-button";
  const statusLabel = props.thread.status === "active" ? "运行中" : props.thread.queuedCount > 0 ? `队列 ${props.thread.queuedCount}` : null;
  return (
    <li>
      <button type="button" className={className} onClick={() => props.onSelect(props.thread.id)} onContextMenu={(event) => props.onOpenMenu(event, props.thread)}>
        <span className="workspace-thread-title-row">
          <span className="workspace-thread-title">{getThreadLabel(props.thread)}</span>
          {statusLabel ? <span className="workspace-thread-badge">{statusLabel}</span> : null}
          <span className="workspace-thread-meta">{formatThreadUpdatedAt(props.thread.updatedAt)}</span>
        </span>
      </button>
    </li>
  );
});

function WorkspaceRootRow(props: WorkspaceRootRowProps): JSX.Element {
  const handleRemove = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    props.onRemove(props.root.id);
  }, [props]);
  const chevronClassName = props.expanded ? "workspace-chevron workspace-chevron-expanded" : "workspace-chevron";
  const rowClassName = props.selected ? "thread-item thread-item-active workspace-root-row" : "thread-item workspace-root-row";
  return (
    <div className={rowClassName}>
      <button type="button" className="workspace-root-button" aria-label={props.expanded ? `收起工作区 ${props.root.name}` : `展开工作区 ${props.root.name}`} onClick={() => props.onToggleExpanded(props.root.id)}>
        <OfficialChevronRightIcon className={chevronClassName} />
        <span className="thread-label">{props.root.name}</span>
        {props.threadCount > 0 ? <span className="workspace-thread-count">{props.threadCount}</span> : null}
      </button>
      {props.selected ? (
        <button type="button" className="thread-item-tools" aria-label={`移除工作区 ${props.root.name}`} title={`移除工作区 ${props.root.name}`} onClick={handleRemove}>
          <OfficialCloseIcon className="thread-item-tools-icon" />
        </button>
      ) : null}
    </div>
  );
}

function WorkspaceThreadList(props: {
  readonly rootId: string;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly showAllThreads: boolean;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onOpenMenu: (event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => void;
  readonly onToggleShowAllThreads: (rootId: string) => void;
}): JSX.Element {
  if (props.threads.length === 0) {
    return <ul className="workspace-thread-list"><li className="workspace-thread-empty">暂无会话</li></ul>;
  }
  const visibleThreads = props.showAllThreads ? props.threads : props.threads.slice(0, DEFAULT_VISIBLE_THREAD_COUNT);
  const hasHiddenThreads = visibleThreads.length < props.threads.length;
  return (
    <>
      <ul className="workspace-thread-list">
        {visibleThreads.map((thread) => (
          <WorkspaceThreadItem key={thread.id} thread={thread} selected={thread.id === props.selectedThreadId} onSelect={props.onSelectThread} onOpenMenu={props.onOpenMenu} />
        ))}
      </ul>
      {props.threads.length > DEFAULT_VISIBLE_THREAD_COUNT ? (
        <button type="button" className="workspace-thread-toggle" onClick={() => props.onToggleShowAllThreads(props.rootId)}>
          {hasHiddenThreads ? `展开全部 ${props.threads.length} 条` : `收起到最近 ${DEFAULT_VISIBLE_THREAD_COUNT} 条`}
        </button>
      ) : null}
    </>
  );
}

const WorkspaceRootItem = memo(function WorkspaceRootItem(props: WorkspaceRootItemProps): JSX.Element {
  return (
    <li className="workspace-root-item">
      <WorkspaceRootRow root={props.root} expanded={props.expanded} selected={props.selected} threadCount={props.threads.length} onToggleExpanded={props.onToggleExpanded} onRemove={props.onRemoveRoot} />
      {props.expanded ? (
        <WorkspaceThreadList rootId={props.root.id} threads={props.threads} selectedThreadId={props.selectedThreadId} showAllThreads={props.showAllThreads} onSelectThread={props.onSelectThread} onOpenMenu={props.onOpenMenu} onToggleShowAllThreads={props.onToggleShowAllThreads} />
      ) : null}
    </li>
  );
});

export function WorkspaceSidebarSection(props: WorkspaceSidebarSectionProps): JSX.Element {
  const { expandedRootId, toggleExpanded } = useExpandedRootId(props.roots, props.selectedRootId, props.onSelectRoot);
  const [expandedThreadRootIds, setExpandedThreadRootIds] = useState<ReadonlyArray<string>>([]);
  const { menuState, openThreadMenu, closeMenu, handleArchiveThread, handleDeleteThread } = useThreadMenuState(props);

  useEffect(() => {
    if (expandedThreadRootIds.length === 0) {
      return;
    }
    const visibleRootIds = new Set(props.roots.map((root) => root.id));
    setExpandedThreadRootIds((current) => current.filter((rootId) => visibleRootIds.has(rootId)));
  }, [expandedThreadRootIds.length, props.roots]);

  const threadsByRootId = useMemo(() => createThreadsByRootId(props.roots, props.codexSessions), [props.codexSessions, props.roots]);
  const toggleShowAllThreads = useCallback((rootId: string) => setExpandedThreadRootIds((current) => toggleRootId(current, rootId)), []);

  return (
    <section className="thread-section">
      <div className="thread-section-header">
        <div className="thread-section-title">工作区</div>
        <div className="thread-header-actions">
          <button type="button" className="thread-header-btn" onClick={props.onAddRoot} aria-label="添加工作区">
            <OfficialFolderPlusIcon className="thread-header-icon" />
          </button>
          <button type="button" className="thread-header-btn" aria-label="排序">
            <OfficialSortIcon className="thread-header-icon" />
          </button>
        </div>
      </div>
      {props.loading ? <div className="thread-section-status" role="status">加载会话中...</div> : null}
      {props.error !== null ? <div className="thread-section-status" role="alert">加载会话失败：{props.error}</div> : null}
      <ul className="thread-list">
        {props.roots.map((root) => (
          <WorkspaceRootItem
            key={root.id}
            root={root}
            expanded={root.id === expandedRootId}
            selected={root.id === props.selectedRootId}
            selectedThreadId={props.selectedThreadId}
            threads={threadsByRootId.get(root.id) ?? []}
            showAllThreads={expandedThreadRootIds.includes(root.id)}
            onSelectThread={props.onSelectThread}
            onToggleExpanded={toggleExpanded}
            onOpenMenu={openThreadMenu}
            onToggleShowAllThreads={toggleShowAllThreads}
            onRemoveRoot={props.onRemoveRoot}
          />
        ))}
        {props.roots.length === 0 ? <li className="thread-empty">暂无工作区，点击左上角添加</li> : null}
      </ul>
      {menuState ? (
        <ThreadContextMenu
          x={menuState.x}
          y={menuState.y}
          canArchive={canArchiveThread(menuState.thread)}
          onArchive={handleArchiveThread}
          onDelete={handleDeleteThread}
          onClose={closeMenu}
        />
      ) : null}
    </section>
  );
}