import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerPermissionLevel } from "../../app/conversation/composerPermission";
import type { ComposerModelOption, ComposerSelection } from "../../app/conversation/composerPreferences";
import type { ThreadDetailLevel } from "../../app/preferences/useAppPreferences";
import type { SendTurnOptions } from "../../app/conversation/useWorkspaceConversation";
import type { HostBridge, WorkspaceOpener } from "../../bridge/types";
import type {
  AccountSummary,
  ConnectionStatus,
  ServerRequestResolution,
  ThreadSummary,
  TimelineEntry,
  UiBanner,
} from "../../domain/types";
import type { ComposerEnterBehavior, FollowUpMode, QueuedFollowUp } from "../../domain/timeline";
import { HomeConversationCanvas } from "./HomeConversationCanvas";
import { HomeComposer } from "./HomeComposer";
import { HomeMainToolbar } from "./HomeMainToolbar";
import { HomePlanRequestComposer } from "./HomePlanRequestComposer";
import { HomeTurnPlanDrawer } from "./HomeTurnPlanDrawer";
import { HomeUserInputPrompt } from "./HomeUserInputPrompt";
import { createComposerCommandBridge } from "./composerCommandBridge";
import type { WorkspaceGitController } from "./git/types";
import { extractConnectionRetryInfo } from "./homeConnectionRetry";
import { removeTurnPlanEntries, selectLatestTurnPlan } from "./homeTurnPlanModel";
import { selectLatestPendingUserInput } from "./homeUserInputPromptModel";
import { OfficialChevronRightIcon } from "./officialIcons";
import { selectLatestPlanModePrompt } from "./planModePrompt";

interface PlanPromptTurnOptions {
  readonly text: string;
  readonly collaborationPreset: "default" | "plan";
  readonly collaborationModeOverridePreset?: "default" | "plan" | null;
}

export interface HomeViewMainContentProps {
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
  readonly defaultServiceTier?: ComposerSelection["serviceTier"];
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
  readonly multiAgentAvailable?: boolean;
  readonly multiAgentEnabled?: boolean;
  readonly onSetMultiAgentEnabled?: (enabled: boolean) => Promise<void>;
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

export function HomeViewMainContent(props: HomeViewMainContentProps): JSX.Element {
  const composerCommandBridge = useMemo(
    () => createComposerCommandBridge(props.hostBridge),
    [props.hostBridge],
  );
  const renderableActivities = useMemo(
    () => removeTurnPlanEntries(props.activities),
    [props.activities],
  );
  const currentTurnPlan = useMemo(
    () => selectLatestTurnPlan(props.activities),
    [props.activities],
  );
  const latestPlanPrompt = useMemo(
    () => selectLatestPlanModePrompt(props.activities),
    [props.activities],
  );
  const pendingUserInput = useMemo(
    () => selectLatestPendingUserInput(props.activities),
    [props.activities],
  );
  const [planDrawerCollapsed, setPlanDrawerCollapsed] = useState(true);
  const [dismissedPlanPromptId, setDismissedPlanPromptId] = useState<string | null>(null);
  const planSnapshotKeyRef = useRef<string | null>(null);

  const conversationActive = props.draftActive
    || props.selectedConversationLoading
    || props.selectedThread !== null
    || props.activities.length > 0;
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

  const showPlanPrompt = latestPlanPrompt !== null
    && !props.isResponding
    && dismissedPlanPromptId !== latestPlanPrompt.entryId;

  const sendPlanPromptTurn = useCallback(async (options: PlanPromptTurnOptions) => {
    setDismissedPlanPromptId(latestPlanPrompt?.entryId ?? null);
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
    latestPlanPrompt,
    props.composerPermissionLevel,
    props.defaultEffort,
    props.defaultModel,
    props.defaultServiceTier,
    props.onSendTurn,
  ]);

  const dismissPlanPrompt = useCallback(() => {
    setDismissedPlanPromptId(latestPlanPrompt?.entryId ?? null);
  }, [latestPlanPrompt]);

  return (
    <div className="replica-main">
      <HomeMainToolbar
        hostBridge={props.hostBridge}
        conversationActive={conversationActive}
        gitController={props.gitController}
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
        <EmptyCanvas
          selectedRootName={props.selectedRootName}
          selectedRootPath={props.selectedRootPath}
        />
      )}
      <HomeTurnPlanDrawer
        plan={currentTurnPlan}
        collapsed={planDrawerCollapsed}
        onToggle={() => setPlanDrawerCollapsed((value) => !value)}
      />
      {pendingUserInput !== null ? (
        <HomeUserInputPrompt
          busy={props.busy}
          entry={pendingUserInput}
          onResolveServerRequest={props.onResolveServerRequest}
        />
      ) : null}
      {showPlanPrompt && pendingUserInput === null ? (
        <HomePlanRequestComposer
          busy={props.busy}
          onDismiss={dismissPlanPrompt}
          onImplement={() => sendPlanPromptTurn({
            text: "Implement the plan.",
            collaborationPreset: "default",
            collaborationModeOverridePreset: "default",
          })}
          onRefine={(notes) => sendPlanPromptTurn({ text: notes, collaborationPreset: "plan" })}
        />
      ) : (
        <HomeComposer
          busy={props.busy}
          inputText={props.inputText}
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
          onRemoveQueuedFollowUp={props.onRemoveQueuedFollowUp}
          onClearQueuedFollowUps={props.onClearQueuedFollowUps}
        />
      )}
    </div>
  );
}

function createTurnPlanChangeKey(plan: { readonly entry: { readonly id: string }; readonly totalSteps: number; readonly completedSteps: number }): string {
  return `${plan.entry.id}:${plan.totalSteps}:${plan.completedSteps}`;
}

function EmptyCanvas(props: {
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
}): JSX.Element {
  const selectorClassName = props.selectedRootPath === null
    ? "workspace-selector workspace-selector-placeholder"
    : "workspace-selector";
  const title = props.selectedRootPath === null ? "Get started" : "Current workspace";

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="工作区空状态">
        <h2 className="empty-title">{title}</h2>
        <button type="button" className={selectorClassName}>
          <span className="workspace-selector-label">{props.selectedRootName}</span>
          <OfficialChevronRightIcon className="workspace-selector-caret" />
        </button>
      </div>
    </main>
  );
}
