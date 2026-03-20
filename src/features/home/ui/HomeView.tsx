import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComposerPermissionLevel } from "../../composer/model/composerPermission";
import type {
  ComposerModelOption,
  ComposerSelection,
} from "../../composer/model/composerPreferences";
import type { SendTurnOptions } from "../../conversation/hooks/useWorkspaceConversation";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type {
  EmbeddedTerminalShell,
  HostBridge,
  WorkspaceOpener,
} from "../../../bridge/types";
import type {
  AccountSummary,
  AuthStatus,
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
  UiBanner,
  WorkspaceSwitchState,
} from "../../../domain/types";
import type {
  CollaborationPreset,
  ComposerEnterBehavior,
  FollowUpMode,
  QueuedFollowUp,
} from "../../../domain/timeline";
import type { ResolvedTheme } from "../../../domain/theme";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { useWorkspaceGit } from "../../git/hooks/useWorkspaceGit";
import type { WorkspaceGitController } from "../../git/model/types";
import { useWorkspaceSwitchTracker } from "../hooks/useWorkspaceSwitchTracker";
import { OfficialSidebarToggleIcon } from "../../shared/ui/officialIcons";
import { useTerminalController } from "../../terminal/hooks/useTerminalController";
import { TerminalDock } from "../../terminal/ui/TerminalDock";
import { TerminalPanel } from "../../terminal/ui/TerminalPanel";
import { WorkspaceDiffSidebarHost } from "../../workspace/ui/WorkspaceDiffSidebarHost";
import { extractConnectionRetryInfo } from "../model/homeConnectionRetry";
import {
  HomeSidebar,
  type HomeSidebarProps,
} from "./HomeSidebar";
import {
  HomeViewMainContent,
  type HomeViewMainContentProps,
} from "./HomeViewMainContent";

export interface HomeViewProps {
  readonly hostBridge: HostBridge;
  readonly busy: boolean;
  readonly inputText: string;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThread: ThreadSummary | null;
  readonly selectedThreadId: string | null;
  readonly activeTurnId: string | null;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly banners: ReadonlyArray<UiBanner>;
  readonly account: AccountSummary | null;
  readonly rateLimitSummary: string | null;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly draftActive: boolean;
  readonly selectedConversationLoading: boolean;
  readonly collaborationPreset: CollaborationPreset;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
  readonly embeddedTerminalUtf8?: boolean;
  readonly gitBranchPrefix: string;
  readonly gitPushForceWithLease: boolean;
  readonly resolvedTheme?: ResolvedTheme;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
  readonly retryScheduledAt: number | null;
  readonly workspaceSwitch: WorkspaceSwitchState;
  readonly settingsMenuOpen: boolean;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSkills: () => void;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onArchiveThread?: (threadId: string) => Promise<void>;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
  readonly onResolveServerRequest: (
    resolution: ServerRequestResolution,
  ) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
  readonly onDismissBanner: (bannerId: string) => void;
}

function createReplicaAppClassName(diffSidebarOpen: boolean): string {
  return diffSidebarOpen ? "replica-app replica-app-with-diff-sidebar" : "replica-app";
}

export function HomeView(props: HomeViewProps): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [diffSidebarOpen, setDiffSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const canShowDiffSidebar = diffSidebarOpen && props.selectedRootPath !== null;
  const gitController = useWorkspaceGit({
    diffStateEnabled: canShowDiffSidebar,
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: canShowDiffSidebar,
    gitBranchPrefix: props.gitBranchPrefix,
    gitPushForceWithLease: props.gitPushForceWithLease,
  });
  useWorkspaceSwitchTracker({
    selectedRootId: props.selectedRootId,
    selectedRootPath: props.selectedRootPath,
    gitError: gitController.error,
    gitLoading: gitController.loading,
    gitStatusLoaded: gitController.statusLoaded,
  });
  const { activities: filteredActivities, retryInfo } = useMemo(
    () => extractConnectionRetryInfo(props.activities),
    [props.activities],
  );

  useEffect(() => {
    if (props.selectedRootPath === null) {
      setDiffSidebarOpen(false);
    }
  }, [props.selectedRootPath]);

  const terminalController = useTerminalController({
    activeRootId: props.selectedRootId,
    activeRootPath: props.selectedRootPath,
    hostBridge: props.hostBridge,
    isOpen: terminalOpen,
    onClosePanel: () => setTerminalOpen(false),
    resolvedTheme: props.resolvedTheme ?? "light",
    shell: props.embeddedTerminalShell,
    enforceUtf8: props.embeddedTerminalUtf8 ?? true,
  });

  const toggleDiffSidebar = useCallback(() => setDiffSidebarOpen((value) => !value), []);
  const toggleTerminal = useCallback(() => setTerminalOpen((value) => !value), []);
  const sidebarProps = createHomeSidebarProps(props, sidebarCollapsed);
  const contentProps = createHomeMainContentProps(
    props,
    gitController,
    filteredActivities,
    retryInfo,
    terminalOpen,
    canShowDiffSidebar,
    props.workspaceSwitch,
    toggleTerminal,
    toggleDiffSidebar,
  );

  return (
    <div className={createReplicaAppClassName(canShowDiffSidebar)}>
      <HomeSidebar {...sidebarProps} />
      <HomeViewMainContent {...contentProps} />
      {canShowDiffSidebar ? (
        <WorkspaceDiffSidebarHost
          hostBridge={props.hostBridge}
          controller={gitController}
          selectedRootName={props.selectedRootName}
          selectedRootPath={props.selectedRootPath}
          onClose={() => setDiffSidebarOpen(false)}
        />
      ) : null}
      <TerminalDock
        activeTabId={terminalController.activeTerminalId}
        hasWorkspace={terminalController.hasWorkspace}
        isOpen={terminalOpen}
        onCloseTab={terminalController.onCloseTerminal}
        onCreateTab={terminalController.onNewTerminal}
        onSelectTab={terminalController.onSelectTerminal}
        tabs={terminalController.terminals}
      >
        {terminalController.activeTerminalId !== null ? (
          <TerminalPanel
            containerRef={terminalController.terminalState.containerRef}
            message={terminalController.terminalState.message}
            onRestart={() => {
              void terminalController.terminalState.restartSession();
            }}
            status={terminalController.terminalState.status}
          />
        ) : null}
      </TerminalDock>
      <SidebarCollapseButton
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
    </div>
  );
}

function createHomeSidebarProps(
  props: HomeViewProps,
  collapsed: boolean,
): HomeSidebarProps {
  return {
    hostBridge: props.hostBridge,
    roots: props.roots,
    codexSessions: props.threads,
    codexSessionsError: null,
    selectedRootId: props.selectedRootId,
    selectedThreadId: props.selectedThreadId,
    authStatus: props.authStatus,
    authMode: props.authMode,
    authBusy: props.authBusy,
    authLoginPending: props.authLoginPending,
    settingsMenuOpen: props.settingsMenuOpen,
    collapsed,
    onToggleSettingsMenu: props.onToggleSettingsMenu,
    onDismissSettingsMenu: props.onDismissSettingsMenu,
    onOpenSettings: props.onOpenSettings,
    onOpenSkills: props.onOpenSkills,
    onLogin: props.onLogin,
    onLogout: props.onLogout,
    onSelectRoot: props.onSelectRoot,
    onSelectThread: props.onSelectThread,
    onCreateThread: props.onCreateThread,
    onArchiveThread: props.onArchiveThread ?? (async () => undefined),
    onAddRoot: props.onAddRoot,
    onRemoveRoot: props.onRemoveRoot,
  };
}

function createHomeMainContentProps(
  props: HomeViewProps,
  gitController: WorkspaceGitController,
  activities: ReadonlyArray<TimelineEntry>,
  retryInfo: ReturnType<typeof extractConnectionRetryInfo>["retryInfo"],
  terminalOpen: boolean,
  diffOpen: boolean,
  workspaceSwitch: WorkspaceSwitchState,
  onToggleTerminal: () => void,
  onToggleDiff: () => void,
): HomeViewMainContentProps {
  return {
    busy: props.busy,
    hostBridge: props.hostBridge,
    gitController,
    inputText: props.inputText,
    activities,
    banners: props.banners,
    account: props.account,
    rateLimitSummary: props.rateLimitSummary,
    queuedFollowUps: props.queuedFollowUps,
    models: props.models,
    collaborationPreset: props.collaborationPreset,
    defaultModel: props.defaultModel,
    defaultEffort: props.defaultEffort,
    defaultServiceTier: props.defaultServiceTier ?? null,
    workspaceOpener: props.workspaceOpener,
    roots: props.roots,
    selectedRootId: props.selectedRootId,
    selectedRootName: props.selectedRootName,
    selectedRootPath: props.selectedRootPath,
    selectedThread: props.selectedThread,
    activeTurnId: props.activeTurnId,
    turnStatuses: props.turnStatuses,
    threadDetailLevel: props.threadDetailLevel,
    isResponding: props.isResponding,
    interruptPending: props.interruptPending,
    selectedConversationLoading: props.selectedConversationLoading,
    workspaceSwitch,
    terminalOpen,
    diffOpen,
    followUpQueueMode: props.followUpQueueMode,
    composerEnterBehavior: props.composerEnterBehavior,
    composerPermissionLevel: props.composerPermissionLevel,
    connectionStatus: props.connectionStatus,
    connectionRetryInfo: retryInfo,
    fatalError: props.fatalError,
    retryScheduledAt: props.retryScheduledAt,
    onSelectWorkspaceOpener: props.onSelectWorkspaceOpener,
    onSelectRoot: props.onSelectRoot,
    onSelectCollaborationPreset: props.onSelectCollaborationPreset,
    onInputChange: props.onInputChange,
    onSendTurn: props.onSendTurn,
    onPersistComposerSelection: props.onPersistComposerSelection,
    multiAgentAvailable: props.multiAgentAvailable ?? false,
    multiAgentEnabled: props.multiAgentEnabled ?? false,
    onSetMultiAgentEnabled: props.onSetMultiAgentEnabled,
    onSelectComposerPermissionLevel: props.onSelectComposerPermissionLevel,
    onUpdateThreadBranch: props.onUpdateThreadBranch,
    onInterruptTurn: props.onInterruptTurn,
    onLogout: props.onLogout,
    onResolveServerRequest: props.onResolveServerRequest,
    onRemoveQueuedFollowUp: props.onRemoveQueuedFollowUp,
    onClearQueuedFollowUps: props.onClearQueuedFollowUps,
    onCreateThread: props.onCreateThread,
    onToggleDiff,
    onToggleTerminal,
    onRetryConnection: props.onRetryConnection,
    onDismissBanner: props.onDismissBanner,
  };
}

function SidebarCollapseButton(props: {
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
