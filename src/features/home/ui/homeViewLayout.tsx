import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TimelineEntry } from "../../../domain/types";
import type { GitWorkspaceDiffOutput } from "../../../bridge/types";
import type { ConnectionRetryInfo } from "../model/homeConnectionRetry";
import type { WorkspaceGitController } from "../../git/model/types";
import type { WorkspaceLaunchScriptsState } from "../hooks/useWorkspaceLaunchScripts";
import type { HomeSidebarProps } from "./HomeSidebar";
import type { HomeViewMainContentProps } from "./HomeViewMainContent";
import type { HomeViewProps } from "./HomeView";
import type { DiffSidebarLayoutState } from "../../git/hooks/useDiffSidebarLayout";
import type { QuickPreviewTarget } from "../../preview/model/previewTargets";
import type { WorkspaceSidePanelExpandedTarget } from "../../workspace/model/workspaceSidePanelExpansion";

const NOOP_ARCHIVE_THREAD = async () => undefined;
const NOOP_REGENERATE_EDITED_MESSAGE = async () => undefined;
const DIFF_SIDEBAR_TRANSITION_MS = 260;

export interface HomeViewUiState {
  readonly canShowDiffSidebar: boolean;
  readonly closeDiffSidebar: () => void;
  readonly diffSidebarClosing: boolean;
  readonly diffSidebarOpening: boolean;
  readonly diffSidebarOpen: boolean;
  readonly hideTerminalPanel: () => void;
  readonly openDiffSidebar: () => void;
  readonly openTerminal: boolean;
  readonly showTerminalPanel: () => void;
  readonly sidebarCollapsed: boolean;
  readonly toggleDiffSidebar: () => void;
}

export function useHomeViewUiState(selectedRootPath: string | null, sidebarCollapsed: boolean): HomeViewUiState {
  const [diffSidebarOpen, setDiffSidebarOpen] = useState(false);
  const [diffSidebarClosing, setDiffSidebarClosing] = useState(false);
  const [diffSidebarOpening, setDiffSidebarOpening] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = null;
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(openTimerRef.current);
    }
    openTimerRef.current = null;
  }, []);

  const startOpenAnimation = useCallback(() => {
    clearOpenTimer();
    if (typeof window === "undefined") {
      setDiffSidebarOpening(false);
      return;
    }
    setDiffSidebarOpening(true);
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setDiffSidebarOpening(false);
    }, DIFF_SIDEBAR_TRANSITION_MS);
  }, [clearOpenTimer]);

  const startCloseAnimation = useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    setDiffSidebarOpening(false);
    if (typeof window === "undefined") {
      setDiffSidebarClosing(false);
      return;
    }
    setDiffSidebarClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setDiffSidebarClosing(false);
    }, DIFF_SIDEBAR_TRANSITION_MS);
  }, [clearCloseTimer, clearOpenTimer]);

  const openDiffSidebar = useCallback(() => {
    clearCloseTimer();
    setDiffSidebarClosing(false);
    if (!diffSidebarOpen) {
      startOpenAnimation();
    }
    setDiffSidebarOpen(true);
  }, [clearCloseTimer, diffSidebarOpen, startOpenAnimation]);

  const closeDiffSidebar = useCallback(() => {
    if (!diffSidebarOpen && !diffSidebarClosing) {
      return;
    }
    setDiffSidebarOpen(false);
    startCloseAnimation();
  }, [diffSidebarClosing, diffSidebarOpen, startCloseAnimation]);

  const toggleDiffSidebar = useCallback(() => {
    if (diffSidebarOpen) {
      closeDiffSidebar();
      return;
    }
    openDiffSidebar();
  }, [closeDiffSidebar, diffSidebarOpen, openDiffSidebar]);

  useEffect(() => {
    if (selectedRootPath === null) {
      clearCloseTimer();
      clearOpenTimer();
      setDiffSidebarOpen(false);
      setDiffSidebarClosing(false);
      setDiffSidebarOpening(false);
    }
  }, [clearCloseTimer, clearOpenTimer, selectedRootPath]);

  useEffect(() => () => {
    clearCloseTimer();
    clearOpenTimer();
  }, [clearCloseTimer, clearOpenTimer]);

  const canShowDiffSidebar = (diffSidebarOpen || diffSidebarClosing || diffSidebarOpening) && selectedRootPath !== null;

  return {
    canShowDiffSidebar,
    closeDiffSidebar,
    diffSidebarClosing,
    diffSidebarOpening,
    diffSidebarOpen: diffSidebarOpen && selectedRootPath !== null,
    hideTerminalPanel: useCallback(() => setTerminalOpen(false), []),
    openDiffSidebar,
    openTerminal: terminalOpen,
    showTerminalPanel: useCallback(() => setTerminalOpen(true), []),
    sidebarCollapsed,
    toggleDiffSidebar,
  };
}

export function createReplicaAppClassName(diffSidebarOpen: boolean, diffSidebarExpanded: boolean): string {
  if (!diffSidebarOpen) {
    return "replica-app";
  }
  if (diffSidebarExpanded) {
    return "replica-app replica-app-with-diff-sidebar replica-app-with-diff-sidebar-expanded";
  }
  return "replica-app replica-app-with-diff-sidebar";
}

export function createReplicaAppStyle(
  diffSidebarOpen: boolean,
  width: number,
): CSSProperties {
  if (!diffSidebarOpen) {
    return {};
  }
  return { ["--replica-diff-sidebar-width" as "width"]: `${width}px` } as CSSProperties;
}

export function createHomeSidebarProps(
  props: HomeViewProps,
  collapsed: boolean,
): HomeSidebarProps {
  return {
    appServerClient: props.appServerClient,
    agentEnvironment: props.agentEnvironment ?? "windowsNative",
    authBusy: props.authBusy,
    authLoginPending: props.authLoginPending,
    authMode: props.authMode,
    authStatus: props.authStatus,
    account: props.account,
    codexSessions: props.threads,
    codexSessionsError: null,
    collapsed,
    activeNavItem: props.activeNavItem ?? null,
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
    onOpenAutomation: props.onOpenAutomation,
    onRemoveRoot: props.onRemoveRoot,
    onCreateWorktree: props.onCreateWorktree,
    onDeleteWorktree: props.onDeleteWorktree,
    onReorderRoots: props.onReorderRoots,
    onSelectRoot: props.onSelectRoot,
    onSelectThread: props.onSelectThread,
    onSelectWorkspaceThread: props.onSelectWorkspaceThread,
    onToggleSettingsMenu: props.onToggleSettingsMenu,
    rateLimits: props.rateLimits,
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
  onOpenPreviewTarget: (target: QuickPreviewTarget) => void,
  diffLayout: DiffSidebarLayoutState,
  diffItems: ReadonlyArray<GitWorkspaceDiffOutput>,
  expandedSidePanelTarget: WorkspaceSidePanelExpandedTarget | null,
): HomeViewMainContentProps {
  return {
    account: props.account,
    activeTurnId: props.activeTurnId,
    activities,
    agentEnvironment: props.agentEnvironment,
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
    onEditThreadGoal: props.onEditThreadGoal,
    onToggleThreadGoalStatus: props.onToggleThreadGoalStatus,
    onClearThreadGoal: props.onClearThreadGoal,
    onLogout: props.onLogout,
    onPersistComposerSelection: props.onPersistComposerSelection,
    onPromoteQueuedFollowUp: props.onPromoteQueuedFollowUp,
    onRemoveQueuedFollowUp: props.onRemoveQueuedFollowUp,
    onResolveServerRequest: props.onResolveServerRequest,
    onRetryConnection: props.onRetryConnection,
    onRegenerateFromEditedUserMessage: props.onRegenerateFromEditedUserMessage ?? NOOP_REGENERATE_EDITED_MESSAGE,
    onSelectCollaborationPreset: props.onSelectCollaborationPreset,
    onSelectComposerPermissionLevel: props.onSelectComposerPermissionLevel,
    onSelectRoot: props.onSelectRoot,
    onSelectWorkspaceOpener: props.onSelectWorkspaceOpener,
    onSendTurn: props.onSendTurn,
    onSetMultiAgentEnabled: props.onSetMultiAgentEnabled,
    onTogglePetAwake: props.onTogglePetAwake,
    onToggleDiff,
    onToggleTerminal,
    onOpenPreviewTarget,
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
    diffItems,
    diffPreviewVisible: false,
    diffPreviewStyle: diffLayout.diffStyle,
    diffPreviewDisplayOptions: diffLayout.diffDisplayOptions,
    diffPreviewSelectedPath: diffLayout.selectedDiffPath,
    expandedSidePanelTarget,
  };
}

