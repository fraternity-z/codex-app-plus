import { useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import type { HostBridge } from "../../../bridge/types";
import type { ResolvedTheme } from "../../../domain/theme";
import { useI18n, type MessageKey } from "../../../i18n";
import { useComposerPicker } from "../../composer/hooks/useComposerPicker";
import type { ComposerSelection } from "../../composer/model/composerPreferences";
import { useWorkspaceConversation } from "../../conversation/hooks/useWorkspaceConversation";
import type { SendTurnOptions } from "../../conversation/hooks/workspaceConversationTypes";
import { readUserConfigWriteTarget } from "../../settings/config/configWriteTarget";
import {
  selectMultiAgentFeatureState,
  selectSteerFeatureState,
} from "../../settings/config/experimentalFeatures";
import type { AppPreferencesController } from "../../settings/hooks/useAppPreferences";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import { requestWorkspaceFolder } from "../../../app/workspacePicker";
import { useHomeScreenState } from "../../../app/controller/appControllerState";
import type { AppController } from "../../../app/controller/appControllerTypes";
import { createHostBridgeAppServerClient } from "../../../protocol/appServerClient";
import { HomeView } from "./HomeView";

interface HomeScreenProps {
  readonly hostBridge: HostBridge;
  readonly controller: AppController;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly settingsMenuOpen: boolean;
  readonly workspace: WorkspaceRootController;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSkills: () => void;
  readonly onToggleSettingsMenu: () => void;
}

export function HomeScreen(props: HomeScreenProps): JSX.Element {
  const state = useHomeScreenState();
  const { t } = useI18n();
  const appServerReady = state.connectionStatus === "connected"
    && state.initialized
    && state.fatalError === null
    && !state.bootstrapBusy;
  const appServerClient = useMemo(
    () => createHostBridgeAppServerClient(props.hostBridge),
    [props.hostBridge],
  );
  const { selectedRootName, selectedRootPath } = useSelectedWorkspace(props.workspace, t("home.workspaceSelector.placeholder"));
  const permissionSettings = useMemo(() => ({
    defaultApprovalPolicy: props.preferences.composerDefaultApprovalPolicy,
    defaultSandboxMode: props.preferences.composerDefaultSandboxMode,
    fullApprovalPolicy: props.preferences.composerFullApprovalPolicy,
    fullSandboxMode: props.preferences.composerFullSandboxMode,
  }), [
    props.preferences.composerDefaultApprovalPolicy,
    props.preferences.composerDefaultSandboxMode,
    props.preferences.composerFullApprovalPolicy,
    props.preferences.composerFullSandboxMode,
  ]);
  const steerState = useMemo(
    () => selectSteerFeatureState(state.experimentalFeatures, state.configSnapshot),
    [state.configSnapshot, state.experimentalFeatures],
  );
  const conversation = useWorkspaceConversation({
    agentEnvironment: props.preferences.agentEnvironment,
    appServerClient,
    appServerReady,
    hostBridge: props.hostBridge,
    selectedRootPath,
    collaborationModes: state.collaborationModes,
    steerAvailable: steerState.available,
    followUpQueueMode: props.preferences.followUpQueueMode,
    permissionSettings,
  });
  const composerPicker = useComposerPicker(appServerClient, state.configSnapshot, state.initialized);
  const multiAgentState = useMemo(
    () => selectMultiAgentFeatureState(state.experimentalFeatures, state.configSnapshot),
    [state.configSnapshot, state.experimentalFeatures],
  );
  const actions = useHomeScreenActions({
    controller: props.controller,
    conversation,
    workspace: props.workspace,
    configSnapshot: state.configSnapshot,
  });

  return (
    <HomeView
      appServerReady={appServerReady}
      appServerClient={appServerClient}
      hostBridge={props.hostBridge}
      busy={state.bootstrapBusy}
      inputText={state.inputText}
      roots={props.workspace.roots}
      selectedRootId={props.workspace.selectedRootId}
      selectedRootName={selectedRootName}
      selectedRootPath={selectedRootPath}
      onUpdateWorkspaceLaunchScripts={props.workspace.updateWorkspaceLaunchScripts}
      threads={conversation.visibleThreads}
      selectedThread={conversation.selectedThread}
      selectedThreadId={conversation.selectedThreadId}
      activeTurnId={conversation.activeTurnId}
      turnStatuses={conversation.turnStatuses}
      isResponding={conversation.isResponding}
      interruptPending={conversation.interruptPending}
      activities={conversation.activities}
      banners={state.banners}
      account={state.account}
      rateLimitSummary={createRateLimitSummary(state.rateLimits)}
      queuedFollowUps={conversation.queuedFollowUps}
      draftActive={conversation.draftActive}
      selectedConversationLoading={conversation.selectedConversationLoading}
      collaborationPreset={conversation.collaborationPreset}
      models={composerPicker.models}
      defaultModel={composerPicker.defaultModel}
      defaultEffort={composerPicker.defaultEffort}
      defaultServiceTier={composerPicker.defaultServiceTier}
      workspaceOpener={props.preferences.workspaceOpener}
      embeddedTerminalShell={props.preferences.embeddedTerminalShell}
      embeddedTerminalUtf8={props.preferences.embeddedTerminalUtf8}
      gitBranchPrefix={props.preferences.gitBranchPrefix}
      gitPushForceWithLease={props.preferences.gitPushForceWithLease}
      threadDetailLevel={props.preferences.threadDetailLevel}
      followUpQueueMode={props.preferences.followUpQueueMode}
      resolvedTheme={props.resolvedTheme}
      composerEnterBehavior={props.preferences.composerEnterBehavior}
      composerPermissionLevel={props.preferences.composerPermissionLevel}
      connectionStatus={state.connectionStatus}
      fatalError={state.fatalError}
      authStatus={state.authStatus}
      authMode={state.authMode}
      authBusy={state.bootstrapBusy || state.authLoginPending}
      authLoginPending={state.authLoginPending}
      retryScheduledAt={state.retryScheduledAt}
      workspaceSwitch={state.workspaceSwitch}
      settingsMenuOpen={props.settingsMenuOpen}
      onToggleSettingsMenu={props.onToggleSettingsMenu}
      onDismissSettingsMenu={props.onDismissSettingsMenu}
      onOpenSettings={props.onOpenSettings}
      onOpenSkills={props.onOpenSkills}
      onSelectWorkspaceOpener={props.preferences.setWorkspaceOpener}
      onSelectComposerPermissionLevel={props.preferences.setComposerPermissionLevel}
      onSelectRoot={actions.selectRoot}
      onSelectThread={conversation.selectThread}
      onSelectWorkspaceThread={actions.selectWorkspaceThread}
      onSelectCollaborationPreset={conversation.selectCollaborationPreset}
      onInputChange={props.controller.setInput}
      onCreateThread={actions.createWorkspaceThread}
      onCreateThreadInRoot={actions.createWorkspaceThreadInRoot}
      onArchiveThread={props.controller.archiveThread}
      onSendTurn={actions.sendWorkspaceTurn}
      onPersistComposerSelection={actions.persistComposerSelection}
      multiAgentAvailable={multiAgentState.available}
      multiAgentEnabled={multiAgentState.enabled}
      onSetMultiAgentEnabled={actions.setMultiAgentEnabled}
      onUpdateThreadBranch={conversation.updateThreadBranch}
      onInterruptTurn={conversation.interruptActiveTurn}
      onAddRoot={actions.addRoot}
      onRemoveRoot={props.workspace.removeRoot}
      onRetryConnection={props.controller.retryConnection}
      onLogin={props.controller.login}
      onLogout={props.controller.logout}
      onResolveServerRequest={props.controller.resolveServerRequest}
      onPromoteQueuedFollowUp={conversation.promoteQueuedFollowUp}
      onRemoveQueuedFollowUp={conversation.removeQueuedFollowUp}
      onClearQueuedFollowUps={conversation.clearQueuedFollowUps}
      onDismissBanner={actions.dismissBanner}
    />
  );
}

function useSelectedWorkspace(
  workspace: WorkspaceRootController,
  fallbackName: string,
): { selectedRootName: string; selectedRootPath: string | null } {
  return useMemo(() => {
    const selectedRoot = workspace.roots.find((root) => root.id === workspace.selectedRootId) ?? null;
    return {
      selectedRootName: selectedRoot?.name ?? fallbackName,
      selectedRootPath: selectedRoot?.path ?? null,
    };
  }, [fallbackName, workspace.roots, workspace.selectedRootId]);
}

function useHomeScreenActions(args: {
  readonly configSnapshot: unknown;
  readonly controller: AppController;
  readonly conversation: Pick<
    ReturnType<typeof useWorkspaceConversation>,
    "createThread" | "sendTurn" | "selectThread"
  >;
  readonly workspace: WorkspaceRootController;
}) {
  const { t } = useI18n();
  const { dismissBanner, pushBanner } = useUiBannerNotifications("home-screen");
  const notifyAlertError = useCallback((key: MessageKey, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    pushBanner({
      level: "error",
      title: t(key, { error: detail }),
      detail: null,
    });
  }, [pushBanner, t]);

  const addRoot = useCallback(async () => {
    try {
      const root = await requestWorkspaceFolder(
        t("app.workspacePicker.title"),
        t("app.workspacePicker.singleOnlyError"),
      );
      if (root !== null) {
        args.workspace.addRoot(root);
      }
    } catch (error) {
      console.error("选择工作区文件夹失败", error);
      notifyAlertError("app.alerts.selectWorkspaceFailed", error);
    }
  }, [args.workspace, notifyAlertError, t]);

  const selectRoot = useCallback((rootId: string) => {
    args.workspace.selectRoot(rootId);
  }, [args.workspace]);

  const createWorkspaceThread = useCallback(async () => {
    try {
      await args.conversation.createThread();
    } catch (error) {
      console.error("创建工作区会话失败", error);
      notifyAlertError("app.alerts.createThreadFailed", error);
    }
  }, [args.conversation, notifyAlertError, t]);

  const createWorkspaceThreadInRoot = useCallback(async (rootId: string) => {
    const root = args.workspace.roots.find((item) => item.id === rootId);
    if (root === undefined) {
      throw new Error(`未找到工作区：${rootId}`);
    }
    try {
      flushSync(() => {
        args.workspace.selectRoot(rootId);
      });
      await args.conversation.createThread({ workspacePath: root.path });
    } catch (error) {
      console.error("创建工作区会话失败", error);
      notifyAlertError("app.alerts.createThreadFailed", error);
      throw error;
    }
  }, [args.conversation, args.workspace, notifyAlertError, t]);

  const selectWorkspaceThread = useCallback((rootId: string, threadId: string | null) => {
    flushSync(() => {
      args.workspace.selectRoot(rootId);
    });
    args.conversation.selectThread(threadId);
  }, [args.conversation, args.workspace]);

  const sendWorkspaceTurn = useCallback(async (sendOptions: SendTurnOptions) => {
    try {
      await args.conversation.sendTurn(sendOptions);
    } catch (error) {
      console.error("发送工作区消息失败", error);
      notifyAlertError("app.alerts.sendTurnFailed", error);
    }
  }, [args.conversation, notifyAlertError, t]);

  const persistComposerSelection = useCallback(async (selection: ComposerSelection) => {
    if (selection.model === null || selection.effort === null) {
      throw new Error(t("app.composer.invalidSelection"));
    }
    const writeTarget = readUserConfigWriteTarget(args.configSnapshot);
    await args.controller.batchWriteConfigSnapshot({
      edits: [
        { keyPath: "model", value: selection.model, mergeStrategy: "upsert" },
        { keyPath: "model_reasoning_effort", value: selection.effort, mergeStrategy: "upsert" },
        { keyPath: "service_tier", value: selection.serviceTier, mergeStrategy: "replace" },
      ],
      filePath: writeTarget.filePath,
      expectedVersion: writeTarget.expectedVersion,
    });
  }, [args.configSnapshot, args.controller, t]);

  const setMultiAgentEnabled = useCallback(async (enabled: boolean) => {
    try {
      await args.controller.setMultiAgentEnabled(enabled);
    } catch (error) {
      console.error("切换多代理失败", error);
      notifyAlertError("app.alerts.setMultiAgentFailed", error);
      throw error;
    }
  }, [args.controller, notifyAlertError, t]);

  return {
    addRoot,
    createWorkspaceThread,
    createWorkspaceThreadInRoot,
    dismissBanner,
    persistComposerSelection,
    selectRoot,
    selectWorkspaceThread,
    sendWorkspaceTurn,
    setMultiAgentEnabled,
  };
}

function createRateLimitSummary(rateLimits: ReturnType<typeof useHomeScreenState>["rateLimits"]): string | null {
  if (rateLimits === null) {
    return null;
  }
  return `Rate limit: ${rateLimits.limitName ?? rateLimits.limitId ?? "default"}`;
}
