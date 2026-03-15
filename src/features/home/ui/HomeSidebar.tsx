import { memo, useCallback, useMemo } from "react";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import { collectDescendantThreadIds, createRpcThreadRuntimeCleanupTransport, forceCloseThreadRuntime, reportThreadCleanupError } from "../../conversation/service/threadRuntimeCleanup";
import type { HostBridge } from "../../../bridge/types";
import type { AuthStatus, ThreadSummary } from "../../../domain/types";
import { useAppDispatch, useAppStoreApi } from "../../../state/store";
import { SidebarIcon } from "../../shared/ui/icons";
import { OfficialSettingsGearIcon } from "../../shared/ui/officialIcons";
import { SettingsPopover } from "./SettingsPopover";
import { WorkspaceSidebarSection } from "../../workspace/ui/WorkspaceSidebarSection";

function SidebarLoadingOverlay(): JSX.Element {
  return (
    <div className="sidebar-loading-overlay" role="status" aria-live="polite" aria-label="正在加载会话">
      <div className="sidebar-loading-panel" aria-hidden="true">
        <div className="sidebar-loading-group sidebar-loading-group-nav">
          <span className="sidebar-loading-pill sidebar-loading-pill-primary" />
          <span className="sidebar-loading-pill sidebar-loading-pill-secondary" />
          <span className="sidebar-loading-pill sidebar-loading-pill-tertiary" />
        </div>
        <div className="sidebar-loading-group sidebar-loading-group-section">
          <div className="sidebar-loading-heading-row">
            <span className="sidebar-loading-heading" />
            <span className="sidebar-loading-heading-actions" />
          </div>
          <div className="sidebar-loading-list">
            <span className="sidebar-loading-row sidebar-loading-row-wide" />
            <span className="sidebar-loading-row sidebar-loading-row-medium" />
            <span className="sidebar-loading-row sidebar-loading-row-wide" />
            <span className="sidebar-loading-row sidebar-loading-row-short" />
            <span className="sidebar-loading-row sidebar-loading-row-medium" />
          </div>
        </div>
        <span className="sidebar-loading-footer" />
      </div>
    </div>
  );
}

export interface HomeSidebarProps {
  readonly hostBridge: HostBridge;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly codexSessionsLoading: boolean;
  readonly codexSessionsError: string | null;
  readonly selectedRootId: string | null;
  readonly selectedThreadId: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
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
  readonly onCreateThread: () => Promise<void>;
  readonly onArchiveThread: (threadId: string) => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
}

function SidebarNav(props: {
  readonly onCreateThread: () => Promise<void>;
  readonly onOpenSkills: () => void;
}): JSX.Element {
  return (
    <nav className="sidebar-nav">
      <button type="button" className="sidebar-nav-item" onClick={() => void props.onCreateThread()}>
        <SidebarIcon kind="new-thread" />
        <span>新会话</span>
      </button>
      <button type="button" className="sidebar-nav-item">
        <SidebarIcon kind="automation" />
        <span>自动化</span>
      </button>
      <button type="button" className="sidebar-nav-item" onClick={props.onOpenSkills}>
        <SidebarIcon kind="skills" />
        <span>技能</span>
      </button>
    </nav>
  );
}

function HomeSidebarComponent(props: HomeSidebarProps): JSX.Element {
  const dispatch = useAppDispatch();
  const store = useAppStoreApi();
  const sidebarClassName = props.collapsed ? "replica-sidebar sidebar-collapsed" : "replica-sidebar";
  const cleanupTransport = useMemo(() => createRpcThreadRuntimeCleanupTransport(props.hostBridge), [props.hostBridge]);

  const clearSelectedThread = useCallback((threadId: string) => {
    if (threadId === props.selectedThreadId) {
      props.onSelectThread(null);
    }
  }, [props]);

  const handleArchiveThread = useCallback(async (thread: ThreadSummary) => {
    await props.onArchiveThread(thread.id);
    clearSelectedThread(thread.id);
  }, [clearSelectedThread, props]);

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

    await props.hostBridge.app.deleteCodexSession({ threadId: thread.id, agentEnvironment: thread.agentEnvironment });
    dispatch({ type: "conversation/hiddenChanged", conversationId: thread.id, hidden: true });
    clearSelectedThread(thread.id);
  }, [cleanupTransport, clearSelectedThread, dispatch, props, store]);

  return (
    <aside className={sidebarClassName} aria-busy={props.codexSessionsLoading}>
      {props.settingsMenuOpen ? <button type="button" className="settings-backdrop" onClick={props.onDismissSettingsMenu} aria-label="关闭菜单" /> : null}
      <div className="sidebar-header" aria-hidden="true" />
      <SidebarNav onCreateThread={props.onCreateThread} onOpenSkills={props.onOpenSkills} />
      <WorkspaceSidebarSection
        roots={props.roots}
        codexSessions={props.codexSessions}
        error={props.codexSessionsError}
        selectedRootId={props.selectedRootId}
        selectedThreadId={props.selectedThreadId}
        onSelectRoot={props.onSelectRoot}
        onSelectThread={props.onSelectThread}
        onArchiveThread={handleArchiveThread}
        onDeleteThread={handleDeleteThread}
        onAddRoot={props.onAddRoot}
        onRemoveRoot={props.onRemoveRoot}
      />
      <div className="settings-slot">
        {props.settingsMenuOpen ? (
          <SettingsPopover
            authStatus={props.authStatus}
            authMode={props.authMode}
            authBusy={props.authBusy}
            authLoginPending={props.authLoginPending}
            onOpenSettings={props.onOpenSettings}
            onLogin={props.onLogin}
            onLogout={props.onLogout}
          />
        ) : null}
        <button type="button" className="sidebar-settings" onClick={props.onToggleSettingsMenu}>
          <OfficialSettingsGearIcon className="settings-gear" />
          <span>设置</span>
        </button>
      </div>
      {props.codexSessionsLoading ? <SidebarLoadingOverlay /> : null}
    </aside>
  );
}

export const HomeSidebar = memo(HomeSidebarComponent);

HomeSidebar.displayName = "HomeSidebar";
