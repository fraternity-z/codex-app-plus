import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComposerModelOption, ComposerSelection } from "../../app/composerPreferences";
import type { SendTurnOptions } from "../../app/useWorkspaceConversation";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import type { EmbeddedTerminalShell, HostBridge, WorkspaceOpener } from "../../bridge/types";
import type {
  AuthStatus,
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry
} from "../../domain/types";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../domain/timeline";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { HomeConversationCanvas } from "./HomeConversationCanvas";
import { HomeComposer } from "./HomeComposer";
import { HomeMainToolbar } from "./HomeMainToolbar";
import { HomeSidebar } from "./HomeSidebar";
import { WorkspaceDiffSidebar } from "./git/WorkspaceDiffSidebar";
import type { WorkspaceGitController } from "./git/types";
import { useWorkspaceGit } from "./git/useWorkspaceGit";
import { OfficialChevronRightIcon, OfficialSidebarToggleIcon } from "./officialIcons";

interface HomeViewProps {
  readonly hostBridge: HostBridge;
  readonly busy: boolean;
  readonly inputText: string;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly codexSessions: ReadonlyArray<ThreadSummary>;
  readonly codexSessionsLoading: boolean;
  readonly codexSessionsError: string | null;
  readonly selectedThreadId: string | null;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
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
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThread: ThreadSummary | null;
  readonly terminalOpen: boolean;
  readonly diffOpen: boolean;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
  readonly onToggleDiff: () => void;
  readonly onToggleTerminal: () => void;
}

function MainContent(props: MainContentProps): JSX.Element {
  const conversationActive = props.selectedThread !== null || props.activities.length > 0;

  return (
    <div className="replica-main">
      <HomeMainToolbar
        hostBridge={props.hostBridge}
        gitController={props.gitController}
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
        <HomeConversationCanvas activities={props.activities} selectedThread={props.selectedThread} onResolveServerRequest={props.onResolveServerRequest} />
      ) : (
        <EmptyCanvas selectedRootName={props.selectedRootName} selectedRootPath={props.selectedRootPath} />
      )}
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
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
      />
    </div>
  );
}

function EmptyCanvas(props: { readonly selectedRootName: string; readonly selectedRootPath: string | null }): JSX.Element {
  const selectorClassName = props.selectedRootPath === null ? "workspace-selector workspace-selector-placeholder" : "workspace-selector";
  const title = props.selectedRootPath === null ? "开始构建" : "当前工作区";

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="欢迎界面">
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
  const gitController = useWorkspaceGit({ hostBridge: props.hostBridge, selectedRootPath: props.selectedRootPath });
  const canShowDiffSidebar = diffSidebarOpen && props.selectedRootPath !== null;
  const selectedThread = useMemo(() => props.threads.find((thread) => thread.id === props.selectedThreadId) ?? null, [props.selectedThreadId, props.threads]);

  useEffect(() => {
    if (props.selectedRootPath === null) {
      setDiffSidebarOpen(false);
    }
  }, [props.selectedRootPath]);

  const toggleTerminal = useCallback(() => setTerminalOpen((value) => !value), []);
  const toggleDiffSidebar = useCallback(() => setDiffSidebarOpen((value) => !value), []);

  return (
    <div className={createReplicaAppClassName(canShowDiffSidebar)}>
      <HomeSidebar
        roots={props.roots}
        codexSessions={props.codexSessions}
        codexSessionsLoading={props.codexSessionsLoading}
        codexSessionsError={props.codexSessionsError}
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
        activities={props.activities}
        queuedFollowUps={props.queuedFollowUps}
        models={props.models}
        defaultModel={props.defaultModel}
        defaultEffort={props.defaultEffort}
        workspaceOpener={props.workspaceOpener}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThread={selectedThread}
        terminalOpen={terminalOpen}
        diffOpen={canShowDiffSidebar}
        followUpQueueMode={props.followUpQueueMode}
        composerEnterBehavior={props.composerEnterBehavior}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
        onResolveServerRequest={props.onResolveServerRequest}
        onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
        onClearQueuedFollowUps={props.onClearQueuedFollowUps}
        onToggleDiff={toggleDiffSidebar}
        onToggleTerminal={toggleTerminal}
      />
      <WorkspaceDiffSidebar
        open={canShowDiffSidebar}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        controller={gitController}
        onClose={() => setDiffSidebarOpen(false)}
      />
      <TerminalPanel hostBridge={props.hostBridge} open={terminalOpen} cwd={props.selectedRootPath} cwdLabel={props.selectedRootName} shell={props.embeddedTerminalShell} onClose={() => setTerminalOpen(false)} />
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
