import {
  DndContext,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useI18n } from "../../../i18n/useI18n";
import { listThreadsForWorkspace } from "../model/workspaceThread";
import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import type { ThreadSummary } from "../../../domain/types";
import { OfficialChevronRightIcon, OfficialFolderPlusIcon } from "../../shared/ui/officialIcons";
import { ThreadContextMenu } from "./ThreadContextMenu";
import { WorkspaceRootMenu } from "./WorkspaceRootMenu";
import { WorkspaceMoreIcon, WorkspaceNewThreadIcon } from "./WorkspaceRootActionIcons";
import { useWorkspaceRootMenuState } from "./useWorkspaceRootMenuState";
import { useWorkspaceDnD } from "./useWorkspaceDnD";

const DEFAULT_VISIBLE_THREAD_COUNT = 10;
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

interface WorkspaceSidebarSectionProps {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly error: string | null;
  readonly selectedRootId: string | null;
  readonly selectedThreadId: string | null;
  readonly worktreePaths?: ReadonlyArray<string>;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onSelectWorkspaceThread?: (rootId: string, threadId: string | null) => void;
  readonly onArchiveThread: (thread: ThreadSummary) => Promise<void>;
  readonly onDeleteThread: (thread: ThreadSummary) => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onCreateThreadInRoot?: (rootId: string) => Promise<void>;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly onCreateWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onDeleteWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onReorderRoots?: (fromIndex: number, toIndex: number) => void;
}

interface WorkspaceRootRowProps {
  readonly root: WorkspaceRoot;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleExpanded: (rootId: string) => void;
  readonly onOpenMenu: (event: MouseEvent<HTMLButtonElement>, root: WorkspaceRoot) => void;
  readonly dragListeners?: ReturnType<typeof useSortable>["listeners"];
  readonly dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  readonly setDragActivatorRef?: (element: HTMLElement | null) => void;
  readonly dragging?: boolean;
}

interface WorkspaceRootItemProps {
  readonly root: WorkspaceRoot;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly selectedThreadId: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly showAllThreads: boolean;
  readonly onCreateThread: () => Promise<void>;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onToggleExpanded: (rootId: string) => void;
  readonly onOpenMenu: (event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => void;
  readonly onOpenRootMenu: (event: MouseEvent<HTMLButtonElement>, root: WorkspaceRoot) => void;
  readonly onToggleShowAllThreads: (rootId: string) => void;
  readonly dragListeners?: ReturnType<typeof useSortable>["listeners"];
  readonly dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  readonly setDragActivatorRef?: (element: HTMLElement | null) => void;
  readonly dragging?: boolean;
}

interface ThreadMenuState {
  readonly thread: ThreadSummary;
  readonly x: number;
  readonly y: number;
}

function formatThreadUpdatedAt(updatedAt: string, t: ReturnType<typeof useI18n>["t"]): string {
  const timestamp = Date.parse(updatedAt);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const elapsed = Date.now() - timestamp;
  if (elapsed >= 0 && elapsed < HOUR_IN_MS) {
    return t("home.workspaceSection.minutesAgo", { count: Math.max(1, Math.floor(elapsed / MINUTE_IN_MS)) });
  }
  if (elapsed >= 0 && elapsed < DAY_IN_MS) {
    return t("home.workspaceSection.hoursAgo", { count: Math.max(1, Math.floor(elapsed / HOUR_IN_MS)) });
  }
  return new Date(timestamp).toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function getThreadLabel(thread: ThreadSummary, t: ReturnType<typeof useI18n>["t"]): string {
  return thread.title.trim() || t("home.workspaceSection.unnamedThread");
}

function canArchiveThread(thread: ThreadSummary): boolean {
  return thread.source !== "codexData";
}

function createThreadsByRootId(roots: ReadonlyArray<WorkspaceRoot>, codexSessions: ReadonlyArray<ThreadSummary>) {
  return new Map(roots.map((root) => [root.id, listThreadsForWorkspace(codexSessions, root.path)]));
}

function createWorktreePathSet(paths: ReadonlyArray<string> | undefined): ReadonlySet<string> {
  return new Set((paths ?? []).map((path) => path.replace(/\\/g, "/").toLowerCase()));
}

function isWorktreeRoot(root: WorkspaceRoot, worktreePaths: ReadonlySet<string>): boolean {
  return worktreePaths.has(root.path.replace(/\\/g, "/").toLowerCase());
}

function toggleRootId(rootIds: ReadonlyArray<string>, rootId: string): ReadonlyArray<string> {
  return rootIds.includes(rootId) ? rootIds.filter((item) => item !== rootId) : [...rootIds, rootId];
}

function useExpandedRootIds(roots: ReadonlyArray<WorkspaceRoot>) {
  const [expandedRootIds, setExpandedRootIds] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    if (expandedRootIds.length === 0) {
      return;
    }
    const visibleRootIds = new Set(roots.map((root) => root.id));
    setExpandedRootIds((current) => current.filter((rootId) => visibleRootIds.has(rootId)));
  }, [expandedRootIds.length, roots]);

  const toggleExpanded = useCallback((rootId: string) => {
    setExpandedRootIds((current) => toggleRootId(current, rootId));
  }, []);

  return { expandedRootIds, toggleExpanded };
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
  const { t } = useI18n();
  const className = props.selected ? "workspace-thread-button workspace-thread-button-active" : "workspace-thread-button";
  const statusLabel = props.thread.status === "active"
    ? t("home.workspaceSection.running")
    : props.thread.queuedCount > 0
      ? t("home.workspaceSection.queued", { count: props.thread.queuedCount })
      : null;

  return (
    <li>
      <button type="button" className={className} onClick={() => props.onSelect(props.thread.id)} onContextMenu={(event) => props.onOpenMenu(event, props.thread)}>
        <span className="workspace-thread-title-row">
          <span className="workspace-thread-title">{getThreadLabel(props.thread, t)}</span>
          {statusLabel ? <span className="workspace-thread-badge">{statusLabel}</span> : null}
          <span className="workspace-thread-meta">{formatThreadUpdatedAt(props.thread.updatedAt, t)}</span>
        </span>
      </button>
    </li>
  );
});

function WorkspaceRootRow(props: WorkspaceRootRowProps): JSX.Element {
  const { t } = useI18n();

  const handleOpenMenu = useCallback((event: MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    props.onOpenMenu(event as MouseEvent<HTMLButtonElement>, props.root);
  }, [props]);

  const handleCreateThread = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void props.onCreateThread();
  }, [props]);

  const chevronClassName = props.expanded ? "workspace-chevron workspace-chevron-expanded" : "workspace-chevron";
  const rowClassName = [
    props.selected ? "thread-item thread-item-active workspace-root-row" : "thread-item workspace-root-row",
    props.dragging ? "workspace-root-row-dragging" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowClassName} onContextMenu={handleOpenMenu}>
      <button
        ref={props.setDragActivatorRef}
        type="button"
        className="workspace-root-button"
        aria-label={props.expanded ? t("home.workspaceSection.collapseRootAria", { name: props.root.name }) : t("home.workspaceSection.expandRootAria", { name: props.root.name })}
        onClick={() => props.onToggleExpanded(props.root.id)}
        {...props.dragAttributes}
        {...props.dragListeners}
      >
        <OfficialChevronRightIcon className={chevronClassName} />
        <span className="thread-label">{props.root.name}</span>
      </button>
      <div className="workspace-root-actions">
        <button type="button" className="thread-item-tools workspace-root-action" aria-label={t("home.workspaceSection.rootMoreAria", { name: props.root.name })} title={t("home.workspaceSection.rootMoreAria", { name: props.root.name })} onClick={handleOpenMenu} onContextMenu={handleOpenMenu}>
          <WorkspaceMoreIcon className="workspace-root-action-icon" />
        </button>
        <button type="button" className="thread-item-tools workspace-root-action" aria-label={t("home.workspaceSection.rootNewThreadAria", { name: props.root.name })} title={t("home.workspaceSection.rootNewThreadAria", { name: props.root.name })} onClick={handleCreateThread} onContextMenu={handleOpenMenu}>
          <WorkspaceNewThreadIcon className="workspace-root-action-icon" />
        </button>
      </div>
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
  const { t } = useI18n();

  if (props.threads.length === 0) {
    return <ul className="workspace-thread-list"><li className="workspace-thread-empty">{t("home.workspaceSection.emptyThreads")}</li></ul>;
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
          {hasHiddenThreads
            ? t("home.workspaceSection.expandAll", { count: props.threads.length })
            : t("home.workspaceSection.collapseRecent", { count: DEFAULT_VISIBLE_THREAD_COUNT })}
        </button>
      ) : null}
    </>
  );
}

const WorkspaceRootItem = memo(function WorkspaceRootItem(props: WorkspaceRootItemProps): JSX.Element {
  return (
    <div className="workspace-root-item">
      <WorkspaceRootRow
        root={props.root}
        expanded={props.expanded}
        selected={props.selected}
        onCreateThread={props.onCreateThread}
        onToggleExpanded={props.onToggleExpanded}
        onOpenMenu={props.onOpenRootMenu}
        dragListeners={props.dragListeners}
        dragAttributes={props.dragAttributes}
        setDragActivatorRef={props.setDragActivatorRef}
        dragging={props.dragging}
      />
      {props.expanded ? (
        <WorkspaceThreadList rootId={props.root.id} threads={props.threads} selectedThreadId={props.selectedThreadId} showAllThreads={props.showAllThreads} onSelectThread={props.onSelectThread} onOpenMenu={props.onOpenMenu} onToggleShowAllThreads={props.onToggleShowAllThreads} />
      ) : null}
    </div>
  );
});

const SortableWorkspaceRootItem = memo(function SortableWorkspaceRootItem(props: WorkspaceRootItemProps): JSX.Element {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.root.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const className = isDragging
    ? "workspace-root-sortable-item workspace-root-sortable-item-dragging"
    : "workspace-root-sortable-item";

  return (
    <li ref={setNodeRef} style={style} className={className} data-root-id={props.root.id}>
      <WorkspaceRootItem
        {...props}
        dragListeners={listeners}
        dragAttributes={attributes}
        setDragActivatorRef={setActivatorNodeRef}
        dragging={isDragging}
      />
    </li>
  );
});

export function WorkspaceSidebarSection(props: WorkspaceSidebarSectionProps): JSX.Element {
  const { t } = useI18n();
  const { expandedRootIds, toggleExpanded } = useExpandedRootIds(props.roots);
  const [expandedThreadRootIds, setExpandedThreadRootIds] = useState<ReadonlyArray<string>>([]);
  const { menuState, openThreadMenu, closeMenu, handleArchiveThread, handleDeleteThread } = useThreadMenuState(props);
  const worktreePathSet = useMemo(() => createWorktreePathSet(props.worktreePaths), [props.worktreePaths]);
  const workspaceRootMenu = useWorkspaceRootMenuState({
    onRemoveRoot: props.onRemoveRoot,
    onCreateWorktree: props.onCreateWorktree,
    onDeleteWorktree: props.onDeleteWorktree,
    isWorktree: (root) => isWorktreeRoot(root, worktreePathSet),
  });
  const dnd = useWorkspaceDnD(props.roots, props.onReorderRoots);

  useEffect(() => {
    if (expandedThreadRootIds.length === 0) {
      return;
    }
    const visibleRootIds = new Set(props.roots.map((root) => root.id));
    setExpandedThreadRootIds((current) => current.filter((rootId) => visibleRootIds.has(rootId)));
  }, [expandedThreadRootIds.length, props.roots]);

  const threadsByRootId = useMemo(() => createThreadsByRootId(props.roots, props.codexSessions), [props.codexSessions, props.roots]);
  const toggleShowAllThreads = useCallback((rootId: string) => setExpandedThreadRootIds((current) => toggleRootId(current, rootId)), []);
  const handleOpenThreadMenu = useCallback((event: MouseEvent<HTMLButtonElement>, thread: ThreadSummary) => {
    workspaceRootMenu.closeMenu();
    openThreadMenu(event, thread);
  }, [openThreadMenu, workspaceRootMenu]);
  const handleCreateThreadInRoot = useCallback((rootId: string) => (
    props.onCreateThreadInRoot ? props.onCreateThreadInRoot(rootId) : (props.onSelectRoot(rootId), props.onCreateThread())
  ), [props]);
  const handleSelectWorkspaceThread = useCallback((rootId: string, threadId: string | null) => {
    if (props.onSelectWorkspaceThread) {
      props.onSelectWorkspaceThread(rootId, threadId);
      return;
    }
    props.onSelectRoot(rootId);
    props.onSelectThread(threadId);
  }, [props]);
  const handleOpenRootMenu = useCallback((event: MouseEvent<HTMLButtonElement>, root: WorkspaceRoot) => {
    closeMenu();
    workspaceRootMenu.openMenu(event, root);
  }, [closeMenu, workspaceRootMenu]);

  return (
    <section className="thread-section">
      <div className="thread-section-header">
        <div className="thread-section-title">{t("settings.environment.workspacesTitle")}</div>
        <div className="thread-header-actions">
          <button type="button" className="thread-header-btn" onClick={props.onAddRoot} aria-label={t("home.workspaceSection.addAction")}>
            <OfficialFolderPlusIcon className="thread-header-icon" />
          </button>
        </div>
      </div>
      {props.error !== null ? <div className="thread-section-status" role="alert">{t("home.workspaceSection.loadFailed", { error: props.error })}</div> : null}
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={closestCenter}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragMove={dnd.handleDragMove}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <SortableContext items={props.roots.map((root) => root.id)} strategy={verticalListSortingStrategy}>
          <ul className="thread-list workspace-root-list">
            {props.roots.map((root) => (
              <div key={root.id} className="workspace-root-sortable-wrapper">
                {dnd.dropMarkerRootId === root.id ? <div className="workspace-root-drop-indicator" aria-hidden="true" /> : null}
                <SortableWorkspaceRootItem
                  root={root}
                  expanded={expandedRootIds.includes(root.id)}
                  selected={root.id === props.selectedRootId}
                  selectedThreadId={props.selectedThreadId}
                  threads={threadsByRootId.get(root.id) ?? []}
                  showAllThreads={expandedThreadRootIds.includes(root.id)}
                  onCreateThread={() => handleCreateThreadInRoot(root.id)}
                  onSelectThread={(threadId) => handleSelectWorkspaceThread(root.id, threadId)}
                  onToggleExpanded={toggleExpanded}
                  onOpenMenu={handleOpenThreadMenu}
                  onOpenRootMenu={handleOpenRootMenu}
                  onToggleShowAllThreads={toggleShowAllThreads}
                />
              </div>
            ))}
            {props.roots.length === 0 ? <li className="thread-empty">{t("home.workspaceSection.emptyRoots")}</li> : null}
          </ul>
        </SortableContext>
        <DragOverlay>
          {dnd.activeRoot ? (
            <div className="workspace-root-overlay thread-item workspace-root-row thread-item-active">
              <OfficialChevronRightIcon className="workspace-chevron" />
              <span className="thread-label">{dnd.activeRoot.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
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
      {workspaceRootMenu.menuState ? (
        <WorkspaceRootMenu
          rootName={workspaceRootMenu.menuState.root.name}
          x={workspaceRootMenu.menuState.x}
          y={workspaceRootMenu.menuState.y}
          canDeleteWorktree={workspaceRootMenu.canDeleteWorktree}
          onCreateWorktree={props.onCreateWorktree && workspaceRootMenu.menuState ? () => workspaceRootMenu.handleCreateWorktree() : undefined}
          onDeleteWorktree={props.onDeleteWorktree && workspaceRootMenu.menuState ? () => workspaceRootMenu.handleDeleteWorktree() : undefined}
          onRemove={workspaceRootMenu.handleRemoveRoot}
          onClose={workspaceRootMenu.closeMenu}
        />
      ) : null}
    </section>
  );
}
