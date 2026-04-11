import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerPermissionLevel } from "../../composer/model/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../../composer/model/composerPreferences";
import type { ThreadDetailLevel } from "../../settings/hooks/useAppPreferences";
import type { RegenerateEditedUserMessageOptions, SendTurnOptions } from "../../conversation/hooks/useWorkspaceConversation";
import { FileLinkProvider, type FileLinkActions } from "../../conversation/hooks/fileLinkContext";
import { useFileLinkOpener } from "../../conversation/hooks/useFileLinkOpener";
import type { AgentEnvironment, HostBridge, WorkspaceOpener } from "../../../bridge/types";
import type {
  AccountSummary,
  AppState,
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
  ConversationMessage,
  FollowUpMode,
  QueuedFollowUp,
} from "../../../domain/timeline";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { useAppSelector } from "../../../state/store";
import { HomeConversationCanvas } from "../../conversation/ui/HomeConversationCanvas";
import { HomeTurnPlanDrawer } from "../../conversation/ui/HomeTurnPlanDrawer";
import { HomeUserInputPrompt } from "../../conversation/ui/HomeUserInputPrompt";
import { HomeComposer } from "../../composer/ui/HomeComposer";
import { HomePlanRequestComposer } from "../../composer/ui/HomePlanRequestComposer";
import { createComposerCommandBridge } from "../../composer/service/composerCommandBridge";
import { GitCommitDialog } from "../../git/ui/GitCommitDialog";
import type { WorkspaceGitController } from "../../git/model/types";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type { WorkspaceLaunchScriptsState } from "../hooks/useWorkspaceLaunchScripts";
import { extractConnectionRetryInfo } from "../model/homeConnectionRetry";
import {
  createTurnPlanChangeKey,
  deriveHomeViewMainContentState,
} from "../model/homeViewMainContentModel";
import { HomeBannerStack, selectVisibleHomeBanners } from "./HomeBannerStack";
import { HomeMainToolbar } from "./HomeMainToolbar";
import { HomeWorkspaceEmptyState } from "./HomeWorkspaceEmptyState";

const EMPTY_BANNERS: ReadonlyArray<UiBanner> = [];

interface PlanPromptTurnOptions {
  readonly text: string;
  readonly collaborationPreset: "default" | "plan";
  readonly collaborationModeOverridePreset?: "default" | "plan" | null;
}

export interface HomeViewMainContentProps {
  readonly appServerReady?: boolean;
  readonly busy: boolean;
  readonly appServerClient: AppServerClient;
  readonly agentEnvironment?: AgentEnvironment;
  readonly hostBridge: HostBridge;
  readonly gitController: WorkspaceGitController;
  readonly inputText?: string;
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly banners?: ReadonlyArray<UiBanner>;
  readonly account: AccountSummary | null;
  readonly rateLimitSummary: string | null;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly collaborationPreset: CollaborationPreset;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly defaultModel: string | null;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly workspaceOpener: WorkspaceOpener;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThread: ThreadSummary | null;
  readonly activeTurnId: string | null;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly isResponding: boolean;
  readonly interruptPending: boolean;
  readonly selectedConversationLoading: boolean;
  readonly workspaceSwitch: WorkspaceSwitchState;
  readonly launchState: WorkspaceLaunchScriptsState | null;
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
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onRegenerateFromEditedUserMessage: (options: RegenerateEditedUserMessageOptions) => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onClearQueuedFollowUps: () => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onToggleDiff: () => void;
  readonly onToggleTerminal: () => void;
  readonly onRetryConnection: () => Promise<void>;
  readonly onDismissBanner: (bannerId: string) => void;
}

function alwaysEqual<T>(_left: T, _right: T): boolean {
  return true;
}

function createVisibleBannerSelector() {
  let previousBanners: ReadonlyArray<UiBanner> | null = null;
  let previousVisibleBanners = EMPTY_BANNERS;
  return (state: AppState): ReadonlyArray<UiBanner> => {
    if (state.banners === previousBanners) {
      return previousVisibleBanners;
    }
    previousBanners = state.banners;
    previousVisibleBanners = selectVisibleHomeBanners(state.banners);
    return previousVisibleBanners;
  };
}

function useHomeComposerInputText(inputText?: string): string {
  const selectedInputText = useAppSelector(
    (state) => state.inputText,
    inputText === undefined ? Object.is : alwaysEqual,
  );
  return inputText ?? selectedInputText;
}

function useHomeVisibleBanners(
  banners?: ReadonlyArray<UiBanner>,
): ReadonlyArray<UiBanner> {
  const selector = useMemo(createVisibleBannerSelector, []);
  const selectedBanners = useAppSelector(
    selector,
    banners === undefined ? Object.is : alwaysEqual,
  );
  return banners === undefined ? selectedBanners : selectVisibleHomeBanners(banners);
}

interface HomeToolbarSectionProps {
  readonly conversationActive: boolean;
  readonly diffOpen: boolean;
  readonly gitController: WorkspaceGitController;
  readonly hostBridge: HostBridge;
  readonly launchState: WorkspaceLaunchScriptsState | null;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onToggleDiff: () => void;
  readonly onToggleTerminal: () => void;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThreadTitle: string | null;
  readonly terminalOpen: boolean;
  readonly workspaceOpener: WorkspaceOpener;
  readonly workspaceSwitch: WorkspaceSwitchState;
}

const HomeToolbarSection = memo(function HomeToolbarSection(
  props: HomeToolbarSectionProps,
): JSX.Element {
  return (
    <>
      <HomeMainToolbar
        hostBridge={props.hostBridge}
        conversationActive={props.conversationActive}
        gitController={props.gitController}
        launchState={props.launchState}
        workspaceOpener={props.workspaceOpener}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThreadTitle={props.selectedThreadTitle}
        terminalOpen={props.terminalOpen}
        diffOpen={props.diffOpen}
        workspaceSwitching={props.workspaceSwitch.phase === "switching"}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onToggleDiff={props.onToggleDiff}
        onToggleTerminal={props.onToggleTerminal}
      />
      <GitCommitDialog controller={props.gitController} />
    </>
  );
});

interface HomeBannerSectionProps {
  readonly banners?: ReadonlyArray<UiBanner>;
  readonly onDismissBanner: (bannerId: string) => void;
}

const HomeBannerSection = memo(function HomeBannerSection(
  props: HomeBannerSectionProps,
): JSX.Element | null {
  const banners = useHomeVisibleBanners(props.banners);
  return (
    <HomeBannerStack
      banners={banners}
      onDismissBanner={props.onDismissBanner}
    />
  );
});

interface HomeConversationSectionProps {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly activeTurnId: string | null;
  readonly busy: boolean;
  readonly connectionRetryInfo: ReturnType<typeof extractConnectionRetryInfo>["retryInfo"];
  readonly connectionStatus: ConnectionStatus;
  readonly conversationActive: boolean;
  readonly fatalError: string | null;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly onEditUserMessage: (message: ConversationMessage, text: string) => Promise<void>;
  readonly onRetryConnection: () => Promise<void>;
  readonly onSelectRoot: (rootId: string) => void;
  readonly placeholder: { readonly title: string; readonly body: string } | null;
  readonly retryScheduledAt: number | null;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThread: ThreadSummary | null;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly turnStatuses?: Readonly<Record<string, TurnStatus>>;
  readonly workspaceSwitch: WorkspaceSwitchState;
  readonly canEditMessages: boolean;
}

const HomeConversationSection = memo(function HomeConversationSection(
  props: HomeConversationSectionProps,
): JSX.Element {
  if (!props.conversationActive) {
    return (
      <HomeWorkspaceEmptyState
        roots={props.roots}
        selectedRootId={props.selectedRootId}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        switchState={props.workspaceSwitch}
        onSelectRoot={props.onSelectRoot}
      />
    );
  }

  return (
    <HomeConversationCanvas
      activities={props.activities}
      selectedThread={props.selectedThread}
      activeTurnId={props.activeTurnId}
      turnStatuses={props.turnStatuses}
      threadDetailLevel={props.threadDetailLevel}
      placeholder={props.placeholder}
      onResolveServerRequest={props.onResolveServerRequest}
      canEditMessages={props.canEditMessages}
      onEditUserMessage={props.onEditUserMessage}
      connectionStatus={props.connectionStatus}
      connectionRetryInfo={props.connectionRetryInfo}
      fatalError={props.fatalError}
      retryScheduledAt={props.retryScheduledAt}
      busy={props.busy}
      onRetryConnection={props.onRetryConnection}
    />
  );
});

interface HomeComposerSectionProps {
  readonly appServerClient: AppServerClient;
  readonly appServerReady?: boolean;
  readonly busy: boolean;
  readonly collaborationPreset: CollaborationPreset;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
  readonly defaultEffort: ComposerSelection["effort"];
  readonly defaultModel: string | null;
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
  readonly followUpQueueMode: FollowUpMode;
  readonly gitController: WorkspaceGitController;
  readonly inputText?: string;
  readonly interruptPending: boolean;
  readonly isResponding: boolean;
  readonly models: ReadonlyArray<ComposerModelOption>;
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onClearQueuedFollowUps: () => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onInputChange: (text: string) => void;
  readonly onInterruptTurn: () => Promise<void>;
  readonly onLogout: () => Promise<void>;
  readonly onPersistComposerSelection: (selection: ComposerSelection) => Promise<void>;
  readonly onPromoteQueuedFollowUp: (followUpId: string) => Promise<void>;
  readonly onRemoveQueuedFollowUp: (followUpId: string) => void;
  readonly onSelectCollaborationPreset: (preset: CollaborationPreset) => void;
  readonly onSelectComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  readonly onSendTurn: (options: SendTurnOptions) => Promise<void>;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
  readonly onToggleDiff: () => void;
  readonly onUpdateThreadBranch: (branch: string) => Promise<void>;
  readonly queuedFollowUps: ReadonlyArray<QueuedFollowUp>;
  readonly selectedRootPath: string | null;
  readonly selectedThread: ThreadSummary | null;
}

const HomeComposerSection = memo(function HomeComposerSection(
  props: HomeComposerSectionProps,
): JSX.Element {
  const composerCommandBridge = useMemo(
    () => createComposerCommandBridge(props.appServerClient),
    [props.appServerClient],
  );
  const inputText = useHomeComposerInputText(props.inputText);

  return (
    <HomeComposer
      appServerReady={props.appServerReady}
      busy={props.busy}
      inputText={inputText}
      collaborationPreset={props.collaborationPreset}
      models={props.models}
      defaultModel={props.defaultModel}
      defaultEffort={props.defaultEffort}
      defaultServiceTier={props.defaultServiceTier ?? null}
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
      onSelectCollaborationPreset={props.onSelectCollaborationPreset}
      onInputChange={props.onInputChange}
      onCreateThread={props.onCreateThread}
      onSendTurn={props.onSendTurn}
      onPersistComposerSelection={props.onPersistComposerSelection}
      multiAgentAvailable={props.multiAgentAvailable ?? false}
      multiAgentEnabled={props.multiAgentEnabled ?? false}
      onSetMultiAgentEnabled={props.onSetMultiAgentEnabled}
      onSelectPermissionLevel={props.onSelectComposerPermissionLevel}
      onToggleDiff={props.onToggleDiff}
      onUpdateThreadBranch={props.onUpdateThreadBranch}
      onInterruptTurn={props.onInterruptTurn}
      onLogout={props.onLogout}
      onPromoteQueuedFollowUp={props.onPromoteQueuedFollowUp}
      onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
      onClearQueuedFollowUps={props.onClearQueuedFollowUps}
    />
  );
});

export function HomeViewMainContent(props: HomeViewMainContentProps): JSX.Element {
  const derivedState = useMemo(
    () => deriveHomeViewMainContentState({
      activities: props.activities,
      selectedConversationLoading: props.selectedConversationLoading,
      selectedThread: props.selectedThread,
    }),
    [props.activities, props.selectedConversationLoading, props.selectedThread],
  );
  const [planDrawerCollapsed, setPlanDrawerCollapsed] = useState(true);
  const [dismissedPlanPromptId, setDismissedPlanPromptId] = useState<string | null>(null);
  const planSnapshotKeyRef = useRef<string | null>(null);
  const { openFileLink } = useFileLinkOpener(
    props.hostBridge,
    props.selectedRootPath,
    props.agentEnvironment ?? "windowsNative",
  );

  const openExternalLink = useCallback(
    (url: string) => void props.hostBridge.app.openExternal(url),
    [props.hostBridge],
  );

  const fileLinkActions = useMemo<FileLinkActions>(
    () => ({
      openFileLink,
      openExternalLink,
      workspacePath: props.selectedRootPath,
    }),
    [openFileLink, openExternalLink, props.selectedRootPath],
  );

  useEffect(() => {
    if (derivedState.currentTurnPlan === null) {
      setPlanDrawerCollapsed(true);
      planSnapshotKeyRef.current = null;
      return;
    }

    const nextKey = createTurnPlanChangeKey(derivedState.currentTurnPlan);
    if (nextKey !== planSnapshotKeyRef.current) {
      setPlanDrawerCollapsed(true);
      planSnapshotKeyRef.current = nextKey;
    }
  }, [derivedState.currentTurnPlan]);

  const showPlanPrompt = derivedState.latestPlanPrompt !== null
    && !props.isResponding
    && dismissedPlanPromptId !== derivedState.latestPlanPrompt.entryId;

  const sendPlanPromptTurn = useCallback(async (options: PlanPromptTurnOptions) => {
    setDismissedPlanPromptId(derivedState.latestPlanPrompt?.entryId ?? null);
    await props.onSendTurn({
      text: options.text,
      attachments: [],
      selection: {
        model: props.defaultModel,
        effort: props.defaultEffort,
        serviceTier: props.defaultServiceTier ?? null,
      },
      permissionLevel: props.composerPermissionLevel,
      collaborationPreset: options.collaborationPreset,
      collaborationModeOverridePreset: options.collaborationModeOverridePreset,
    });
  }, [
    derivedState.latestPlanPrompt,
    props.composerPermissionLevel,
    props.defaultEffort,
    props.defaultModel,
    props.defaultServiceTier,
    props.onSendTurn,
  ]);

  const dismissPlanPrompt = useCallback(() => {
    setDismissedPlanPromptId(derivedState.latestPlanPrompt?.entryId ?? null);
  }, [derivedState.latestPlanPrompt]);

  const editUserMessage = useCallback((message: ConversationMessage, text: string) => {
    if (message.turnId === null) {
      return Promise.resolve();
    }
    return props.onRegenerateFromEditedUserMessage({
      threadId: message.threadId,
      turnId: message.turnId,
      text,
      attachments: message.attachments ?? [],
      selection: {
        model: props.defaultModel,
        effort: props.defaultEffort,
        serviceTier: props.defaultServiceTier ?? null,
      },
      permissionLevel: props.composerPermissionLevel,
      collaborationPreset: props.collaborationPreset,
    });
  }, [
    props.collaborationPreset,
    props.composerPermissionLevel,
    props.defaultEffort,
    props.defaultModel,
    props.defaultServiceTier,
    props.onRegenerateFromEditedUserMessage,
  ]);

  return (
    <FileLinkProvider value={fileLinkActions}>
    <div className="replica-main">
      <HomeToolbarSection
        hostBridge={props.hostBridge}
        conversationActive={derivedState.conversationActive}
        gitController={props.gitController}
        launchState={props.launchState}
        workspaceOpener={props.workspaceOpener}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThreadTitle={props.selectedThread?.title ?? null}
        terminalOpen={props.terminalOpen}
        diffOpen={props.diffOpen}
        workspaceSwitch={props.workspaceSwitch}
        onSelectWorkspaceOpener={props.onSelectWorkspaceOpener}
        onToggleDiff={props.onToggleDiff}
        onToggleTerminal={props.onToggleTerminal}
      />
      <HomeBannerSection
        banners={props.banners}
        onDismissBanner={props.onDismissBanner}
      />
      <HomeConversationSection
        activities={derivedState.renderableActivities}
        activeTurnId={props.activeTurnId}
        busy={props.busy}
        connectionRetryInfo={props.connectionRetryInfo}
        connectionStatus={props.connectionStatus}
        conversationActive={derivedState.conversationActive}
        fatalError={props.fatalError}
        onResolveServerRequest={props.onResolveServerRequest}
        onEditUserMessage={editUserMessage}
        onRetryConnection={props.onRetryConnection}
        onSelectRoot={props.onSelectRoot}
        placeholder={derivedState.placeholder}
        retryScheduledAt={props.retryScheduledAt}
        roots={props.roots}
        selectedRootId={props.selectedRootId}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        selectedThread={props.selectedThread}
        threadDetailLevel={props.threadDetailLevel}
        turnStatuses={props.turnStatuses}
        workspaceSwitch={props.workspaceSwitch}
        canEditMessages={!props.isResponding}
      />
      <HomeTurnPlanDrawer
        plan={derivedState.currentTurnPlan}
        collapsed={planDrawerCollapsed}
        onToggle={() => setPlanDrawerCollapsed((value) => !value)}
      />
      {derivedState.pendingUserInput !== null ? (
        <HomeUserInputPrompt
          busy={props.busy}
          entry={derivedState.pendingUserInput}
          onResolveServerRequest={props.onResolveServerRequest}
        />
      ) : null}
      {showPlanPrompt && derivedState.pendingUserInput === null ? (
        <HomePlanRequestComposer
          busy={props.busy || props.appServerReady === false}
          onDismiss={dismissPlanPrompt}
          onImplement={() => sendPlanPromptTurn({
            text: "Implement the plan.",
            collaborationPreset: "default",
            collaborationModeOverridePreset: "default",
          })}
          onRefine={(notes) => sendPlanPromptTurn({
            text: notes,
            collaborationPreset: "plan",
          })}
        />
      ) : (
        <HomeComposerSection
          appServerClient={props.appServerClient}
          appServerReady={props.appServerReady}
          busy={props.busy}
          collaborationPreset={props.collaborationPreset}
          composerEnterBehavior={props.composerEnterBehavior}
          composerPermissionLevel={props.composerPermissionLevel}
          defaultEffort={props.defaultEffort}
          defaultModel={props.defaultModel}
          defaultServiceTier={props.defaultServiceTier ?? null}
          followUpQueueMode={props.followUpQueueMode}
          gitController={props.gitController}
          inputText={props.inputText}
          interruptPending={props.interruptPending}
          isResponding={props.isResponding}
          models={props.models}
          multiAgentAvailable={props.multiAgentAvailable ?? false}
          multiAgentEnabled={props.multiAgentEnabled ?? false}
          onClearQueuedFollowUps={props.onClearQueuedFollowUps}
          onCreateThread={props.onCreateThread}
          onInputChange={props.onInputChange}
          onInterruptTurn={props.onInterruptTurn}
          onLogout={props.onLogout}
          onPersistComposerSelection={props.onPersistComposerSelection}
          onPromoteQueuedFollowUp={props.onPromoteQueuedFollowUp}
          onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
          onSelectCollaborationPreset={props.onSelectCollaborationPreset}
          onSelectComposerPermissionLevel={props.onSelectComposerPermissionLevel}
          onSendTurn={props.onSendTurn}
          onSetMultiAgentEnabled={props.onSetMultiAgentEnabled}
          onToggleDiff={props.onToggleDiff}
          onUpdateThreadBranch={props.onUpdateThreadBranch}
          queuedFollowUps={props.queuedFollowUps}
          selectedRootPath={props.selectedRootPath}
          selectedThread={props.selectedThread}
        />
      )}
    </div>
    </FileLinkProvider>
  );
}
