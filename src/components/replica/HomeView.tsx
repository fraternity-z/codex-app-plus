import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerPermissionLevel } from "../../app/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../../app/composerPreferences";
import type { ThreadDetailLevel } from "../../app/useAppPreferences";
import type { SendTurnOptions } from "../../app/useWorkspaceConversation";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import type { EmbeddedTerminalShell, HostBridge, WorkspaceOpener } from "../../bridge/types";
import type {
  AccountSummary,
  AuthStatus,
  ConnectionStatus,
  UiBanner,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry
} from "../../domain/types";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../domain/timeline";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { HomeConversationCanvas } from "./HomeConversationCanvas";
import { HomeComposer } from "./HomeComposer";
import { HomeTurnPlanDrawer } from "./HomeTurnPlanDrawer";
import type { TurnPlanModel } from "./homeTurnPlanModel";
import { HomeMainToolbar } from "./HomeMainToolbar";
import { HomeSidebar } from "./HomeSidebar";
import { removeTurnPlanEntries, selectLatestTurnPlan } from "./homeTurnPlanModel";
import { createComposerCommandBridge } from "./composerCommandBridge";
import type { WorkspaceGitController } from "./git/types";
import { useWorkspaceGit } from "./git/useWorkspaceGit";
import { OfficialChevronRightIcon, OfficialSidebarToggleIcon } from "./officialIcons";
import { extractConnectionRetryInfo } from "./homeConnectionRetry";
import { WorkspaceDiffSidebarHost } from "./WorkspaceDiffSidebarHost";

interface HomeViewProps {
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
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
}

interface MainContentProps {
  readonly busy: boolean;
  readonly hostBridge: HostBridge;
  readonly gitController: WorkspaceGitController;
  readonly inputText: string;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly banners: ReadonlyArray<UiBanner>;
  readonly account: AccountSummary | null;
  readonly rateLimitSummary: string | null;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly draftActive: boolean;
  readonly selectedConversationLoading: boolean;
  readonly terminalOpen: boolean;
  readonly diffOpen: boolean;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
  readonly connectionStatus: ConnectionStatus;
  readonly connectionRetryInfo: ReturnType<typeof extractConnectionRetryInfo>["retryInfo"];
  readonly fatalError: string | null;
  readonly retryScheduledAt: number | null;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleDiff: () => void;
  readonly onToggleTerminal: () => void;
  readonly onRetryConnection: () => Promise<void>;
}

function MainContent(props: MainContentProps): JSX.Element {
  const composerCommandBridge = useMemo(() => createComposerCommandBridge(props.hostBridge), [props.hostBridge]);
  const renderableActivities = useMemo(() => removeTurnPlanEntries(props.activities), [props.activities]);
  const currentTurnPlan = useMemo(() => selectLatestTurnPlan(props.activities), [props.activities]);
  const [planDrawerCollapsed, setPlanDrawerCollapsed] = useState(true);
  const planSnapshotKeyRef = useRef<string | null>(null);
  const conversationActive = props.draftActive || props.selectedConversationLoading || props.selectedThread !== null || props.activities.length > 0;
  const placeholder = props.draftActive
    ? { title: "Ready to start a new thread", body: "Send the first message to switch into the full official timeline." }
    : props.selectedConversationLoading
      ? { title: "Loading thread", body: "Historical turns and items are being restored." }
      : props.selectedThread !== null
        ? { title: "Thread opened", body: "New plans, tools, approvals, realtime updates, and file changes appear here." }
        : null;

  useEffect(() => {
    if (currentTurnPlan === null) {
      setPlanDrawerCollapsed(true);
      planSnapshotKeyRef.current = null;
      return;
    }
    const nextKey = createTurnPlanChangeKey(currentTurnPlan);
    if (nextKey !== planSnapshotKeyRef.current) {
      setPlanDrawerCollapsed(true);
      planSnapshotKeyRef.current = nextKey;
    }
  }, [currentTurnPlan]);


  return (
    <div className="replica-main">
      <HomeMainToolbar
        hostBridge={props.hostBridge}
        conversationActive={conversationActive}
        workspaceOpener={props.workspaceOpener}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThreadTitle={props.selectedThread?.title ?? null}
        terminalOpen={props.terminalOpen}
        diffOpen={props.diffOpen}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onToggleDiff={props.onToggleDiff}
        onToggleTerminal={props.onToggleTerminal}
      />
      {conversationActive ? (
        <HomeConversationCanvas
          activities={renderableActivities}
          selectedThread={props.selectedThread}
          activeTurnId={props.activeTurnId}
          threadDetailLevel={props.threadDetailLevel}
          placeholder={placeholder}
          onResolveServerRequest={props.onResolveServerRequest}
          connectionStatus={props.connectionStatus}
          connectionRetryInfo={props.connectionRetryInfo}
          fatalError={props.fatalError}
          retryScheduledAt={props.retryScheduledAt}
          busy={props.busy}
          onRetryConnection={props.onRetryConnection}
        />
      ) : (
        <EmptyCanvas selectedRootName={props.selectedRootName} selectedRootPath={props.selectedRootPath} />
      )}
      <HomeTurnPlanDrawer
        plan={currentTurnPlan}
        collapsed={planDrawerCollapsed}
        onToggle={() => setPlanDrawerCollapsed((value) => !value)}
      />
      <HomeComposer
        busy={props.busy}
        inputText={props.inputText}
        models={props.models}
        defaultModel={props.defaultModel}
        defaultEffort={props.defaultEffort}
        selectedRootPath={props.selectedRootPath}
        queuedFollowUps={props.queuedFollowUps}
        followUpQueueMode={props.followUpQueueMode}
        composerEnterBehavior={props.composerEnterBehavior}
        permissionLevel={props.composerPermissionLevel}
        gitController={props.gitController}
        selectedThreadId={props.selectedThread?.id ?? null}
        selectedThreadBranch={props.selectedThread?.branch ?? null}
        isResponding={props.isResponding}
        interruptPending={props.interruptPending}
        composerCommandBridge={composerCommandBridge}
        onInputChange={props.onInputChange}
        onCreateThread={props.onCreateThread}
        onSendTurn={props.onSendTurn}
        onPersistComposerSelection={props.onPersistComposerSelection}
        onSelectPermissionLevel={props.onSelectComposerPermissionLevel}
        onToggleDiff={props.onToggleDiff}
        onUpdateThreadBranch={props.onUpdateThreadBranch}
        onInterruptTurn={props.onInterruptTurn}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
      />
    </div>
  );
}

function createTurnPlanChangeKey(plan: TurnPlanModel): string {
  return `${plan.entry.id}:${plan.totalSteps}:${plan.completedSteps}`;
}

function EmptyCanvas(props: { readonly selectedRootName: string; readonly selectedRootPath: string | null }): JSX.Element {
  const selectorClassName = props.selectedRootPath === null ? "workspace-selector workspace-selector-placeholder" : "workspace-selector";
  const title = props.selectedRootPath === null ? "Get started" : "Current workspace";

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="娆㈣繋鐣岄潰">
        
        <h2 className="empty-title">{title}</h2>
        <button type="button" className={selectorClassName}>
          <span className="workspace-selector-label">{props.selectedRootName}</span>
          <OfficialChevronRightIcon className="workspace-selector-caret" />
        </button>
      </div>
    </main>
  );
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
    diffStateEnabled: false,
    hostBridge: props.hostBridge,
    selectedRootPath: props.selectedRootPath,
    autoRefreshEnabled: false,
  });
  const { activities: filteredActivities, retryInfo } = useMemo(
    () => extractConnectionRetryInfo(props.activities),
    [props.activities]
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
      <HomeSidebar hostBridge={props.hostBridge}
        roots={props.roots}
        codexSessions={props.threads}
        codexSessionsLoading={props.busy && props.threads.length === 0}
        codexSessionsError={null}
        selectedRootId={props.selectedRootId}
        selectedThreadId={props.selectedThreadId}
        settingsMenuOpen={props.settingsMenuOpen}
        collapsed={sidebarCollapsed}
        onToggleSettingsMenu={props.onToggleSettingsMenu}
        onDismissSettingsMenu={props.onDismissSettingsMenu}
        onOpenSettings={props.onOpenSettings}
        onSelectRoot={props.onSelectRoot}
        onSelectThread={props.onSelectThread}
        onCreateThread={props.onCreateThread}
        onAddRoot={props.onAddRoot}
        onRemoveRoot={props.onRemoveRoot}
      />
      <MainContent
        busy={props.busy}
        hostBridge={props.hostBridge}
        gitController={gitController}
        inputText={props.inputText}
        activities={filteredActivities}
        banners={props.banners}
        account={props.account}
        rateLimitSummary={props.rateLimitSummary}
        queuedFollowUps={props.queuedFollowUps}
        models={props.models}
        defaultModel={props.defaultModel}
        defaultEffort={props.defaultEffort}
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
        terminalOpen={terminalOpen}
        diffOpen={canShowDiffSidebar}
        followUpQueueMode={props.followUpQueueMode}
        composerEnterBehavior={props.composerEnterBehavior}
        composerPermissionLevel={props.composerPermissionLevel}
        connectionStatus={props.connectionStatus}
        connectionRetryInfo={retryInfo}
        fatalError={props.fatalError}
        retryScheduledAt={props.retryScheduledAt}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
        onPersistComposerSelection={props.onPersistComposerSelection}
        onSelectComposerPermissionLevel={props.onSelectComposerPermissionLevel}
        onUpdateThreadBranch={props.onUpdateThreadBranch}
        onInterruptTurn={props.onInterruptTurn}
        onResolveServerRequest={props.onResolveServerRequest}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
        onCreateThread={props.onCreateThread}
        onToggleDiff={toggleDiffSidebar}
        onToggleTerminal={toggleTerminal}
        onRetryConnection={props.onRetryConnection}
      />
      {canShowDiffSidebar ? (
        <WorkspaceDiffSidebarHost
          hostBridge={props.hostBridge}
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
      <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
    </div>
  );
}

function SidebarCollapseButton(props: { readonly collapsed: boolean; readonly onToggle: () => void }): JSX.Element {
  return (
    <button type="button" className="sidebar-collapse-toggle" onClick={props.onToggle} aria-label={props.collapsed ? "展开侧边栏" : "折叠侧边栏"}>
      <OfficialSidebarToggleIcon className="sidebar-collapse-icon" />
    </button>
  );
}
