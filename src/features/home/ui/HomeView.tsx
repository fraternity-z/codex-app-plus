import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComposerPermissionLevel } from "../../composer/model/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../../composer/model/composerPreferences";
import type { SendTurnOptions } from "../../conversation/hooks/useWorkspaceConversation";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type { EmbeddedTerminalShell, HostBridge, WorkspaceOpener } from "../../../bridge/types";
import type {
  AccountSummary,
  AuthStatus,
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
  UiBanner,
} from "../../../domain/types";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../../domain/timeline";
import { TerminalPanel } from "../../terminal/ui/TerminalPanel";
import { WorkspaceDiffSidebarHost } from "../../workspace/ui/WorkspaceDiffSidebarHost";
import type { WorkspaceGitController } from "../../git/model/types";
import { useWorkspaceGit } from "../../git/hooks/useWorkspaceGit";
import { extractConnectionRetryInfo } from "../model/homeConnectionRetry";
import { HomeSidebar } from "./HomeSidebar";
import { OfficialSidebarToggleIcon } from "../../shared/ui/officialIcons";
import { HomeViewMainContent } from "./HomeViewMainContent";

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
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly banners: ReadonlyArray<UiBanner>;
  readonly account: AccountSummary | null;
  readonly rateLimitSummary: string | null;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly draftActive: boolean;
  readonly selectedConversationLoading: boolean;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
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
  readonly settingsMenuOpen: boolean;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string | null) => void;
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
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

function createReplicaAppClassName(diffSidebarOpen: boolean): string {
  return diffSidebarOpen ? "replica-app replica-app-with-diff-sidebar" : "replica-app";
}

export function HomeView(props: HomeViewProps): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [diffSidebarOpen, setDiffSidebarOpen] = useState(false);
  const canShowDiffSidebar = diffSidebarOpen && props.selectedRootPath !== null;
  const gitController = useWorkspaceGit({
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: canShowDiffSidebar,
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

  const toggleTerminal = useCallback(() => setTerminalOpen((value) => !value), []);
  const toggleDiffSidebar = useCallback(() => setDiffSidebarOpen((value) => !value), []);

  return (
    <div className={createReplicaAppClassName(canShowDiffSidebar)}>
      <HomeSidebarPanel
        collapsed={sidebarCollapsed}
        gitController={gitController}
        terminalOpen={terminalOpen}
        diffOpen={canShowDiffSidebar}
        retryInfo={retryInfo}
        filteredActivities={filteredActivities}
        onToggleDiff={toggleDiffSidebar}
        onToggleTerminal={toggleTerminal}
        {...props}
      />
      {canShowDiffSidebar ? (
        <WorkspaceDiffSidebarHost
          controller={gitController}
          selectedRootName={props.selectedRootName}
          selectedRootPath={props.selectedRootPath}
          onClose={() => setDiffSidebarOpen(false)}
        />
      ) : null}
      {terminalOpen ? (
        <TerminalPanel
          hostBridge={props.hostBridge}
          open={terminalOpen}
          cwd={props.selectedRootPath}
          cwdLabel={props.selectedRootName}
          shell={props.embeddedTerminalShell}
          onClose={() => setTerminalOpen(false)}
        />
      ) : null}
      <SidebarCollapseButton
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
    </div>
  );
}

function HomeSidebarPanel(props: HomeViewProps & {
  readonly collapsed: boolean;
  readonly gitController: WorkspaceGitController;
  readonly terminalOpen: boolean;
  readonly diffOpen: boolean;
  readonly retryInfo: ReturnType<typeof extractConnectionRetryInfo>["retryInfo"];
  readonly filteredActivities: ReadonlyArray<TimelineEntry>;
  readonly onToggleDiff: () => void;
  readonly onToggleTerminal: () => void;
}): JSX.Element {
  const archiveThread = props.onArchiveThread ?? (async () => undefined);

  return (
    <>
      <HomeSidebar
        hostBridge={props.hostBridge}
        roots={props.roots}
        codexSessions={props.threads}
        codexSessionsLoading={props.busy && props.threads.length === 0}
        codexSessionsError={null}
        selectedRootId={props.selectedRootId}
        selectedThreadId={props.selectedThreadId}
        authStatus={props.authStatus}
        authMode={props.authMode}
        authBusy={props.authBusy}
        authLoginPending={props.authLoginPending}
        settingsMenuOpen={props.settingsMenuOpen}
        collapsed={props.collapsed}
        onToggleSettingsMenu={props.onToggleSettingsMenu}
        onDismissSettingsMenu={props.onDismissSettingsMenu}
        onOpenSettings={props.onOpenSettings}
        onLogin={props.onLogin}
        onLogout={props.onLogout}
        onSelectRoot={props.onSelectRoot}
        onSelectThread={props.onSelectThread}
        onCreateThread={props.onCreateThread}
        onArchiveThread={archiveThread}
        onAddRoot={props.onAddRoot}
        onRemoveRoot={props.onRemoveRoot}
      />
      <HomeViewMainContent
        busy={props.busy}
        hostBridge={props.hostBridge}
        gitController={props.gitController}
        inputText={props.inputText}
        activities={props.filteredActivities}
        banners={props.banners}
        account={props.account}
        rateLimitSummary={props.rateLimitSummary}
        queuedFollowUps={props.queuedFollowUps}
        models={props.models}
        defaultModel={props.defaultModel}
        defaultEffort={props.defaultEffort}
        defaultServiceTier={props.defaultServiceTier ?? null}
        workspaceOpener={props.workspaceOpener}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThread={props.selectedThread}
        activeTurnId={props.activeTurnId}
        threadDetailLevel={props.threadDetailLevel}
        isResponding={props.isResponding}
        interruptPending={props.interruptPending}
        draftActive={props.draftActive}
        selectedConversationLoading={props.selectedConversationLoading}
        terminalOpen={props.terminalOpen}
        diffOpen={props.diffOpen}
        followUpQueueMode={props.followUpQueueMode}
        composerEnterBehavior={props.composerEnterBehavior}
        composerPermissionLevel={props.composerPermissionLevel}
        connectionStatus={props.connectionStatus}
        connectionRetryInfo={props.retryInfo}
        fatalError={props.fatalError}
        retryScheduledAt={props.retryScheduledAt}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
        onPersistComposerSelection={props.onPersistComposerSelection}
        multiAgentAvailable={props.multiAgentAvailable ?? false}
        multiAgentEnabled={props.multiAgentEnabled ?? false}
        onSetMultiAgentEnabled={props.onSetMultiAgentEnabled}
        onSelectComposerPermissionLevel={props.onSelectComposerPermissionLevel}
        onUpdateThreadBranch={props.onUpdateThreadBranch}
        onInterruptTurn={props.onInterruptTurn}
        onResolveServerRequest={props.onResolveServerRequest}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
        onCreateThread={props.onCreateThread}
        onToggleDiff={props.onToggleDiff}
        onToggleTerminal={props.onToggleTerminal}
        onRetryConnection={props.onRetryConnection}
      />
    </>
  );
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
