import { useCallback, useEffect, useState } from "react";
import type { TimelineEntry } from "../../../domain/types";
import type { ConnectionRetryInfo } from "../model/homeConnectionRetry";
import type { WorkspaceGitController } from "../../git/model/types";
import { OfficialSidebarToggleIcon } from "../../shared/ui/officialIcons";
import type { WorkspaceLaunchScriptsState } from "../hooks/useWorkspaceLaunchScripts";
import type { HomeSidebarProps } from "./HomeSidebar";
import type { HomeViewMainContentProps } from "./HomeViewMainContent";
import type { HomeViewProps } from "./HomeView";

const NOOP_ARCHIVE_THREAD = async () => undefined;

export interface HomeViewUiState {
  readonly canShowDiffSidebar: boolean;
  readonly closeDiffSidebar: () => void;
  readonly hideTerminalPanel: () => void;
  readonly openTerminal: boolean;
  readonly showTerminalPanel: () => void;
  readonly sidebarCollapsed: boolean;
  readonly toggleDiffSidebar: () => void;
  readonly toggleSidebarCollapsed: () => void;
}

export function useHomeViewUiState(selectedRootPath: string | null): HomeViewUiState {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [diffSidebarOpen, setDiffSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    if (selectedRootPath === null) {
      setDiffSidebarOpen(false);
    }
  }, [selectedRootPath]);

  return {
    canShowDiffSidebar: diffSidebarOpen && selectedRootPath !== null,
    closeDiffSidebar: useCallback(() => setDiffSidebarOpen(false), []),
    hideTerminalPanel: useCallback(() => setTerminalOpen(false), []),
    openTerminal: terminalOpen,
    showTerminalPanel: useCallback(() => setTerminalOpen(true), []),
    sidebarCollapsed,
    toggleDiffSidebar: useCallback(
      () => setDiffSidebarOpen((currentValue) => !currentValue),
      [],
    ),
    toggleSidebarCollapsed: useCallback(
      () => setSidebarCollapsed((currentValue) => !currentValue),
      [],
    ),
  };
}

export function createReplicaAppClassName(diffSidebarOpen: boolean): string {
  return diffSidebarOpen ? "replica-app replica-app-with-diff-sidebar" : "replica-app";
}

export function createHomeSidebarProps(
  props: HomeViewProps,
  collapsed: boolean,
): HomeSidebarProps {
  return {
    appServerClient: props.appServerClient,
    authBusy: props.authBusy,
    authLoginPending: props.authLoginPending,
    authMode: props.authMode,
    authStatus: props.authStatus,
    codexSessions: props.threads,
    codexSessionsError: null,
    collapsed,
    hostBridge: props.hostBridge,
    onAddRoot: props.onAddRoot,
    onArchiveThread: props.onArchiveThread ?? NOOP_ARCHIVE_THREAD,
    onCreateThread: props.onCreateThread,
    onCreateThreadInRoot: props.onCreateThreadInRoot,
    onDismissSettingsMenu: props.onDismissSettingsMenu,
    onLogin: props.onLogin,
    onLogout: props.onLogout,
    onOpenSettings: props.onOpenSettings,
    onOpenSkills: props.onOpenSkills,
    onRemoveRoot: props.onRemoveRoot,
    onCreateWorktree: props.onCreateWorktree,
    onDeleteWorktree: props.onDeleteWorktree,
    onReorderRoots: props.onReorderRoots,
    onSelectRoot: props.onSelectRoot,
    onSelectThread: props.onSelectThread,
    onSelectWorkspaceThread: props.onSelectWorkspaceThread,
    onToggleSettingsMenu: props.onToggleSettingsMenu,
    roots: props.roots,
    selectedRootId: props.selectedRootId,
    selectedThreadId: props.selectedThreadId,
    settingsMenuOpen: props.settingsMenuOpen,
    worktrees: props.worktrees,
  };
}

export function createHomeMainContentProps(
  props: HomeViewProps,
  gitController: WorkspaceGitController,
  launchState: WorkspaceLaunchScriptsState | null,
  activities: ReadonlyArray<TimelineEntry>,
  retryInfo: ConnectionRetryInfo | null,
  terminalOpen: boolean,
  diffOpen: boolean,
  onToggleTerminal: () => void,
  onToggleDiff: () => void,
): HomeViewMainContentProps {
  return {
    account: props.account,
    activeTurnId: props.activeTurnId,
    activities,
    appServerClient: props.appServerClient,
    appServerReady: props.appServerReady,
    banners: props.banners,
    busy: props.busy,
    collaborationPreset: props.collaborationPreset,
    composerEnterBehavior: props.composerEnterBehavior,
    composerPermissionLevel: props.composerPermissionLevel,
    connectionRetryInfo: retryInfo,
    connectionStatus: props.connectionStatus,
    defaultEffort: props.defaultEffort,
    defaultModel: props.defaultModel,
    defaultServiceTier: props.defaultServiceTier ?? null,
    diffOpen,
    fatalError: props.fatalError,
    followUpQueueMode: props.followUpQueueMode,
    gitController,
    hostBridge: props.hostBridge,
    inputText: props.inputText,
    interruptPending: props.interruptPending,
    isResponding: props.isResponding,
    launchState,
    models: props.models,
    multiAgentAvailable: props.multiAgentAvailable ?? false,
    multiAgentEnabled: props.multiAgentEnabled ?? false,
    onClearQueuedFollowUps: props.onClearQueuedFollowUps,
    onCreateThread: props.onCreateThread,
    onDismissBanner: props.onDismissBanner,
    onInputChange: props.onInputChange,
    onInterruptTurn: props.onInterruptTurn,
    onLogout: props.onLogout,
    onPersistComposerSelection: props.onPersistComposerSelection,
    onPromoteQueuedFollowUp: props.onPromoteQueuedFollowUp,
    onRemoveQueuedFollowUp: props.onRemoveQueuedFollowUp,
    onResolveServerRequest: props.onResolveServerRequest,
    onRetryConnection: props.onRetryConnection,
    onSelectCollaborationPreset: props.onSelectCollaborationPreset,
    onSelectComposerPermissionLevel: props.onSelectComposerPermissionLevel,
    onSelectRoot: props.onSelectRoot,
    onSelectWorkspaceOpener: props.onSelectWorkspaceOpener,
    onSendTurn: props.onSendTurn,
    onSetMultiAgentEnabled: props.onSetMultiAgentEnabled,
    onToggleDiff,
    onToggleTerminal,
    onUpdateThreadBranch: props.onUpdateThreadBranch,
    queuedFollowUps: props.queuedFollowUps,
    rateLimitSummary: props.rateLimitSummary,
    retryScheduledAt: props.retryScheduledAt,
    roots: props.roots,
    selectedConversationLoading: props.selectedConversationLoading,
    selectedRootId: props.selectedRootId,
    selectedRootName: props.selectedRootName,
    selectedRootPath: props.selectedRootPath,
    selectedThread: props.selectedThread,
    terminalOpen,
    threadDetailLevel: props.threadDetailLevel,
    turnStatuses: props.turnStatuses,
    workspaceOpener: props.workspaceOpener,
    workspaceSwitch: props.workspaceSwitch,
  };
}

export function SidebarCollapseButton(props: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="sidebar-collapse-toggle"
      onClick={props.onToggle}
      aria-label={props.collapsed ? "展开侧边栏" : "折叠侧边栏"}
    >
      <OfficialSidebarToggleIcon className="sidebar-collapse-icon" />
    </button>
  );
}
