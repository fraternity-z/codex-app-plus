import { Suspense, lazy } from "react";
import type { ComposerSelection } from "../../features/composer/model/composerPreferences";
import { useComposerPicker } from "../../features/composer/hooks/useComposerPicker";
import { useWorkspaceConversation } from "../../features/conversation/hooks/useWorkspaceConversation";
import { HomeView, type HomeViewProps } from "../../features/home/ui/HomeView";
import { useAppPreferences } from "../../features/settings/hooks/useAppPreferences";
import { useWorkspaceRoots } from "../../features/workspace/hooks/useWorkspaceRoots";
import type { HostBridge } from "../../bridge/types";
import { AuthChoiceView } from "../../features/auth/ui/AuthChoiceView";
import type { ResolvedTheme } from "../../domain/theme";
import { selectMultiAgentFeatureState } from "../../features/settings/config/experimentalFeatures";
import { useAppShellState } from "../controller/appControllerState";
import { useAppController } from "../controller/useAppController";
import type { SettingsSection, SettingsViewProps } from "../../features/settings/ui/SettingsView";
import { SettingsLoadingFallback } from "./SettingsLoadingFallback";
import type { SkillsViewProps } from "../../features/skills/ui/SkillsView";
import { WindowTitlebar } from "./WindowTitlebar";

const LazySettingsView = lazy(async () => {
  const module = await import("../../features/settings/ui/SettingsView");
  return { default: module.SettingsView };
});

const LazySkillsView = lazy(async () => {
  const module = await import("../../features/skills/ui/SkillsView");
  return { default: module.SkillsView };
});

export type AppScreen = "home" | "skills" | SettingsSection;

type AppStateView = ReturnType<typeof useAppShellState>;
type PreferencesView = ReturnType<typeof useAppPreferences>;
type WorkspaceView = ReturnType<typeof useWorkspaceRoots>;
type ConversationView = ReturnType<typeof useWorkspaceConversation>;
type ComposerPickerView = ReturnType<typeof useComposerPicker>;
type ControllerView = ReturnType<typeof useAppController>;
type MultiAgentStateView = ReturnType<typeof selectMultiAgentFeatureState>;

interface AppScreenContentProps {
  readonly screen: AppScreen;
  readonly hostBridge: HostBridge;
  readonly appState: AppStateView;
  readonly preferences: PreferencesView;
  readonly workspace: WorkspaceView;
  readonly conversation: ConversationView;
  readonly composerPicker: ComposerPickerView;
  readonly controller: ControllerView;
  readonly multiAgentState: MultiAgentStateView;
  readonly resolvedTheme: ResolvedTheme;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly settingsMenuOpen: boolean;
  readonly authBusy: boolean;
  readonly shouldShowAuthChoice: boolean;
  readonly onBackHome: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSettingsSection: (section: SettingsSection) => void;
  readonly onOpenSkills: () => void;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onAddRoot: () => void;
  readonly onCreateWorkspaceThread: () => Promise<void>;
  readonly onSendWorkspaceTurn: (selection: Parameters<ConversationView["sendTurn"]>[0]) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onSetMultiAgentEnabled: (enabled: boolean) => Promise<void>;
  readonly onDismissBanner: (bannerId: string) => void;
  readonly onOpenConfigToml: () => Promise<void>;
  readonly readGlobalAgentInstructions: SettingsViewProps["readGlobalAgentInstructions"];
  readonly writeGlobalAgentInstructions: SettingsViewProps["writeGlobalAgentInstructions"];
  readonly listCodexProviders: SettingsViewProps["listCodexProviders"];
  readonly upsertCodexProvider: SettingsViewProps["upsertCodexProvider"];
  readonly deleteCodexProvider: SettingsViewProps["deleteCodexProvider"];
  readonly applyCodexProvider: SettingsViewProps["applyCodexProvider"];
  readonly onOpenSkillsLearnMore: () => Promise<void>;
}

export function AppScreenContent(props: AppScreenContentProps): JSX.Element {
  const content = renderAppScreenContent(props);

  return (
    <div className="app-shell">
      <WindowTitlebar hostBridge={props.hostBridge} />
      <div className="app-shell-body">{content}</div>
    </div>
  );
}

function renderAppScreenContent(props: AppScreenContentProps): JSX.Element {
  if (props.screen === "skills") {
    return <SuspendedSkillsView {...createSkillsProps(props)} />;
  }
  if (props.screen !== "home") {
    return <SuspendedSettingsView {...createSettingsProps(props)} section={props.screen} />;
  }
  if (props.shouldShowAuthChoice) {
    return (
      <AuthChoiceView
        busy={props.authBusy}
        loginPending={props.appState.authLoginPending}
        onLogin={props.controller.login}
        onUseApiKey={props.onOpenSettings}
      />
    );
  }
  return <HomeView {...createHomeProps(props)} />;
}

function SuspendedSettingsView(props: SettingsViewProps): JSX.Element {
  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <LazySettingsView {...props} />
    </Suspense>
  );
}

function SuspendedSkillsView(props: SkillsViewProps): JSX.Element {
  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <LazySkillsView {...props} />
    </Suspense>
  );
}

function createSettingsProps(props: AppScreenContentProps): SettingsViewProps {
  return {
    section: "general",
    roots: props.workspace.roots,
    preferences: props.preferences,
    configSnapshot: props.appState.configSnapshot,
    busy: props.appState.bootstrapBusy,
    windowsSandboxSetup: props.appState.windowsSandboxSetup,
    onBackHome: props.onBackHome,
    onSelectSection: props.onOpenSettingsSection,
    onAddRoot: props.onAddRoot,
    onOpenConfigToml: props.onOpenConfigToml,
    refreshConfigSnapshot: props.controller.refreshConfigSnapshot,
    refreshAuthState: props.controller.refreshAuthState,
    readGlobalAgentInstructions: props.readGlobalAgentInstructions,
    writeGlobalAgentInstructions: props.writeGlobalAgentInstructions,
    listCodexProviders: props.listCodexProviders,
    upsertCodexProvider: props.upsertCodexProvider,
    deleteCodexProvider: props.deleteCodexProvider,
    applyCodexProvider: props.applyCodexProvider,
    refreshMcpData: props.controller.refreshMcpData,
    listArchivedThreads: props.controller.listArchivedThreads,
    unarchiveThread: props.controller.unarchiveThread,
    writeConfigValue: props.controller.writeConfigValue,
    batchWriteConfig: props.controller.batchWriteConfig,
    startWindowsSandboxSetup: props.controller.startWindowsSandboxSetup,
  };
}

function createHomeProps(props: AppScreenContentProps): HomeViewProps {
  return {
    hostBridge: props.hostBridge,
    busy: props.appState.bootstrapBusy,
    inputText: props.appState.inputText,
    roots: props.workspace.roots,
    selectedRootId: props.workspace.selectedRootId,
    selectedRootName: props.selectedRootName,
    selectedRootPath: props.selectedRootPath,
    threads: props.conversation.workspaceThreads,
    selectedThread: props.conversation.selectedThread,
    selectedThreadId: props.conversation.selectedThreadId,
    activeTurnId: props.conversation.activeTurnId,
    turnStatuses: props.conversation.turnStatuses,
    isResponding: props.conversation.isResponding,
    interruptPending: props.conversation.interruptPending,
    activities: props.conversation.activities,
    banners: props.appState.banners,
    account: props.appState.account,
    rateLimitSummary: createRateLimitSummary(props.appState),
    queuedFollowUps: props.conversation.queuedFollowUps,
    draftActive: props.conversation.draftActive,
    selectedConversationLoading: props.conversation.selectedConversationLoading,
    collaborationPreset: props.conversation.collaborationPreset,
    models: props.composerPicker.models,
    defaultModel: props.composerPicker.defaultModel,
    defaultEffort: props.composerPicker.defaultEffort,
    defaultServiceTier: props.composerPicker.defaultServiceTier,
    workspaceOpener: props.preferences.workspaceOpener,
    embeddedTerminalShell: props.preferences.embeddedTerminalShell,
    embeddedTerminalUtf8: props.preferences.embeddedTerminalUtf8,
    threadDetailLevel: props.preferences.threadDetailLevel,
    followUpQueueMode: props.preferences.followUpQueueMode,
    resolvedTheme: props.resolvedTheme,
    composerEnterBehavior: props.preferences.composerEnterBehavior,
    composerPermissionLevel: props.preferences.composerPermissionLevel,
    connectionStatus: props.appState.connectionStatus,
    fatalError: props.appState.fatalError,
    authStatus: props.appState.authStatus,
    authMode: props.appState.authMode,
    authBusy: props.authBusy,
    authLoginPending: props.appState.authLoginPending,
    retryScheduledAt: props.appState.retryScheduledAt,
    settingsMenuOpen: props.settingsMenuOpen,
    onToggleSettingsMenu: props.onToggleSettingsMenu,
    onDismissSettingsMenu: props.onDismissSettingsMenu,
    onOpenSettings: props.onOpenSettings,
    onOpenSkills: props.onOpenSkills,
    onSelectWorkspaceOpener: props.preferences.setWorkspaceOpener,
    onSelectComposerPermissionLevel: props.preferences.setComposerPermissionLevel,
    onSelectRoot: props.workspace.selectRoot,
    onSelectThread: props.conversation.selectThread,
    onSelectCollaborationPreset: props.conversation.selectCollaborationPreset,
    onInputChange: props.controller.setInput,
    onCreateThread: props.onCreateWorkspaceThread,
    onArchiveThread: props.controller.archiveThread,
    onSendTurn: props.onSendWorkspaceTurn,
    onPersistComposerSelection: props.onPersistComposerSelection,
    multiAgentAvailable: props.multiAgentState.available,
    multiAgentEnabled: props.multiAgentState.enabled,
    onSetMultiAgentEnabled: props.onSetMultiAgentEnabled,
    onUpdateThreadBranch: props.conversation.updateThreadBranch,
    onInterruptTurn: props.conversation.interruptActiveTurn,
    onAddRoot: props.onAddRoot,
    onRemoveRoot: props.workspace.removeRoot,
    onRetryConnection: props.controller.retryConnection,
    onLogin: props.controller.login,
    onLogout: props.controller.logout,
    onResolveServerRequest: props.controller.resolveServerRequest,
    onRemoveQueuedFollowUp: props.conversation.removeQueuedFollowUp,
    onClearQueuedFollowUps: props.conversation.clearQueuedFollowUps,
    onDismissBanner: props.onDismissBanner,
  };
}

function createSkillsProps(props: AppScreenContentProps): SkillsViewProps {
  return {
    selectedRootPath: props.selectedRootPath,
    notifications: props.appState.notifications,
    onBackHome: props.onBackHome,
    onOpenLearnMore: props.onOpenSkillsLearnMore,
    listSkills: props.controller.listSkills,
    listRemoteSkills: props.controller.listRemoteSkills,
    writeSkillConfig: props.controller.writeSkillConfig,
    exportRemoteSkill: props.controller.exportRemoteSkill,
  };
}

function createRateLimitSummary(appState: AppStateView): string | null {
  if (appState.rateLimits === null) {
    return null;
  }
  return `Rate limit: ${appState.rateLimits.limitName ?? appState.rateLimits.limitId ?? "default"}`;
}
