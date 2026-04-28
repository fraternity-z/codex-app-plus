import { memo, useCallback, useMemo, useState } from "react";
import type { ComposerPermissionLevel } from "../../composer/model/composerPermission";
import type {
  ComposerModelOption,
  ComposerSelection,
} from "../../composer/model/composerPreferences";
import type { RegenerateEditedUserMessageOptions, SendTurnOptions } from "../../conversation/hooks/useWorkspaceConversation";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type {
  AgentEnvironment,
  EmbeddedTerminalShell,
  GitWorkspaceDiffOutput,
  HostBridge,
  WorkspaceOpener,
  GitWorktreeEntry,
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
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type {
  CollaborationPreset,
  ComposerEnterBehavior,
  FollowUpMode,
  QueuedFollowUp,
} from "../../../domain/timeline";
import type { ResolvedTheme } from "../../../domain/theme";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { useWorkspaceGit } from "../../git/hooks/useWorkspaceGit";
import { useDiffSidebarLayout } from "../../git/hooks/useDiffSidebarLayout";
import { useWorkspaceSwitchTracker } from "../hooks/useWorkspaceSwitchTracker";
import { useTerminalController } from "../../terminal/hooks/useTerminalController";
import { TerminalDock } from "../../terminal/ui/TerminalDock";
import { TerminalPanel } from "../../terminal/ui/TerminalPanel";
import { WorkspaceDiffSidebarHost } from "../../workspace/ui/WorkspaceDiffSidebarHost";
import type { UpdateWorkspaceLaunchScriptsInput } from "../../workspace/hooks/useWorkspaceRoots";
import { extractConnectionRetryInfo } from "../model/homeConnectionRetry";
import { HomeSidebar, type HomeNavItem } from "./HomeSidebar";
import { HomeViewMainContent } from "./HomeViewMainContent";
import { useWorkspaceLaunchScripts } from "../hooks/useWorkspaceLaunchScripts";
import {
  createHomeMainContentProps,
  createHomeSidebarProps,
  createReplicaAppClassName,
  createReplicaAppStyle,
  useHomeViewUiState,
} from "./homeViewLayout";

export interface HomeViewProps {
  readonly appServerReady?: boolean;
  readonly appServerClient: AppServerClient;
  readonly agentEnvironment?: AgentEnvironment;
  readonly hostBridge: HostBridge;
  readonly busy: boolean;
  readonly inputText?: string;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly onUpdateWorkspaceLaunchScripts: (
    input: UpdateWorkspaceLaunchScriptsInput,
  ) => void;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThread: ThreadSummary | null;
  readonly selectedThreadId: string | null;
  readonly activeTurnId: string | null;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly banners?: ReadonlyArray<UiBanner>;
  readonly account: AccountSummary | null;
  readonly rateLimits: RateLimitSnapshot | null;
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
  readonly gitCommitInstructions?: string;
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
  readonly sidebarCollapsed?: boolean;
  readonly activeNavItem?: HomeNavItem | null;
  readonly mainContentOverride?: JSX.Element | null;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSkills: () => void;
  readonly onOpenAutomation: () => void;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
  readonly onSelectWorkspaceThread?: (rootId: string, threadId: string | null) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onCreateThreadInRoot?: (rootId: string) => Promise<void>;
  readonly onArchiveThread?: (threadId: string) => Promise<void>;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onRegenerateFromEditedUserMessage?: (options: RegenerateEditedUserMessageOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly worktrees?: ReadonlyArray<GitWorktreeEntry>;
  readonly onCreateWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onDeleteWorktree?: (root: WorkspaceRoot) => Promise<void>;
  readonly onReorderRoots?: (fromIndex: number, toIndex: number) => void;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
  readonly onResolveServerRequest: (
    resolution: ServerRequestResolution,
  ) => Promise<void>;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
  readonly onDismissBanner: (bannerId: string) => void;
}

export const HomeView = memo(function HomeView(props: HomeViewProps): JSX.Element {
  const uiState = useHomeViewUiState(props.selectedRootPath, props.sidebarCollapsed ?? false);
  const diffLayout = useDiffSidebarLayout();
  const [diffItems, setDiffItems] = useState<ReadonlyArray<GitWorkspaceDiffOutput>>([]);
  const selectedRoot = useMemo(
    () => props.roots.find((root) => root.id === props.selectedRootId) ?? null,
    [props.roots, props.selectedRootId],
  );
  const gitController = useWorkspaceGit({
    diffStateEnabled: uiState.canShowDiffSidebar,
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: uiState.canShowDiffSidebar,
    gitBranchPrefix: props.gitBranchPrefix,
    gitPushForceWithLease: props.gitPushForceWithLease,
    gitCommitInstructions: props.gitCommitInstructions ?? "",
    agentEnvironment: props.agentEnvironment,
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

  const terminalController = useTerminalController({
    activeRootId: props.selectedRootId,
    activeRootPath: props.selectedRootPath,
    hostBridge: props.hostBridge,
    isOpen: uiState.openTerminal,
    onHidePanel: uiState.hideTerminalPanel,
    onShowPanel: uiState.showTerminalPanel,
    resolvedTheme: props.resolvedTheme ?? "light",
    shell: props.embeddedTerminalShell,
    enforceUtf8: props.embeddedTerminalUtf8 ?? true,
  });
  const launchState = useWorkspaceLaunchScripts({
    selectedRoot,
    terminalController,
    updateWorkspaceLaunchScripts: props.onUpdateWorkspaceLaunchScripts,
  });

  const toggleTerminal = useCallback(() => {
    if (uiState.openTerminal) {
      terminalController.hidePanel();
      return;
    }
    terminalController.showPanel();
  }, [terminalController, uiState.openTerminal]);
  const sidebarProps = useMemo(
    () => createHomeSidebarProps(props, uiState.sidebarCollapsed),
    [props, uiState.sidebarCollapsed],
  );
  const contentProps = useMemo(
    () => createHomeMainContentProps(
      props,
      gitController,
      launchState,
      filteredActivities,
      retryInfo,
      uiState.openTerminal,
      uiState.canShowDiffSidebar,
      toggleTerminal,
      uiState.toggleDiffSidebar,
      diffLayout,
      diffItems,
    ),
    [props, gitController, launchState, filteredActivities, retryInfo, uiState.openTerminal, uiState.canShowDiffSidebar, toggleTerminal, uiState.toggleDiffSidebar, diffLayout, diffItems],
  );
  const mainContentOverride = props.mainContentOverride ?? null;

  return (
    <div
      className={createReplicaAppClassName(mainContentOverride === null && uiState.canShowDiffSidebar, diffLayout.expanded)}
      style={createReplicaAppStyle(mainContentOverride === null && uiState.canShowDiffSidebar, diffLayout.width)}
    >
      <HomeSidebar {...sidebarProps} />
      {mainContentOverride === null ? (
        <HomeViewMainContent {...contentProps} />
      ) : (
        <main className="replica-main replica-main-embedded-screen">
          {mainContentOverride}
        </main>
      )}
      {mainContentOverride === null && uiState.canShowDiffSidebar ? (
        <WorkspaceDiffSidebarHost
          hostBridge={props.hostBridge}
          controller={gitController}
          selectedRootName={props.selectedRootName}
          selectedRootPath={props.selectedRootPath}
          onClose={uiState.closeDiffSidebar}
          expanded={diffLayout.expanded}
          onToggleExpanded={() => {
            if (!diffLayout.expanded) {
              diffLayout.resetWidth();
            }
            diffLayout.toggleExpanded();
          }}
          diffStyle={diffLayout.diffStyle}
          onToggleDiffStyle={diffLayout.toggleDiffStyle}
          selectedDiffPath={diffLayout.selectedDiffPath}
          onSelectDiffPath={diffLayout.setSelectedDiffPath}
          onDiffItemsChange={setDiffItems}
          onResizeStart={diffLayout.startResize}
          canResize={!diffLayout.expanded}
          isResizing={diffLayout.isResizing}
        />
      ) : null}
      {mainContentOverride === null ? (
        <TerminalDock
          activeTabId={terminalController.activeTerminalId}
          hasWorkspace={terminalController.hasWorkspace}
          isOpen={uiState.openTerminal}
          onCloseTab={terminalController.onCloseTerminal}
          onCreateTab={terminalController.onNewTerminal}
          onHidePanel={terminalController.hidePanel}
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
      ) : null}
    </div>
  );
});
