import { useCallback, useEffect, useMemo } from "react";
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
import { useAppDispatch } from "../../../state/store";
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
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { notifyError } = useUiBannerNotifications("custom-prompts");
  const appServerReady = state.connectionStatus === "connected"
    && state.initialized
    && state.fatalError === null
    && !state.bootstrapBusy;
  const appServerClient = useMemo(
    () => createHostBridgeAppServerClient(props.hostBridge),
    [props.hostBridge],
  );
  useEffect(() => {
    let cancelled = false;
    void props.hostBridge.app.listCustomPrompts({
      agentEnvironment: props.preferences.agentEnvironment,
    }).then((prompts) => {
      if (!cancelled) {
        dispatch({ type: "customPrompts/loaded", prompts });
      }
    }).catch((error) => {
      if (cancelled) {
        return;
      }
      console.error("读取自定义 prompts 失败", error);
      notifyError("读取自定义 prompts 失败", error);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, notifyError, props.hostBridge, props.preferences.agentEnvironment]);
  const selectedRootName = props.workspace.selectedRoot?.name ?? t("home.workspaceSelector.placeholder");
  const selectedRootPath = props.workspace.selectedRoot?.path ?? null;
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
      onReorderRoots={props.workspace.reorderRoots}
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
  const { dismissBanner, reportError } = useUiBannerNotifications("home-screen");
  const notifyAlertError = useCallback((key: MessageKey, error: unknown, options?: { readonly logMessage?: string; readonly rethrow?: boolean }) => {
    const detail = error instanceof Error ? error.message : String(error);
    reportError(t(key, { error: detail }), error, {
      detail: null,
      logMessage: options?.logMessage,
      rethrow: options?.rethrow,
    });
  }, [reportError, t]);

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
      notifyAlertError("app.alerts.selectWorkspaceFailed", error, { logMessage: "选择工作区文件夹失败" });
    }
  }, [args.workspace, notifyAlertError, t]);

  const selectRoot = useCallback((rootId: string) => {
    args.workspace.selectRoot(rootId);
  }, [args.workspace]);

  const createWorkspaceThread = useCallback(async () => {
    try {
      await args.conversation.createThread();
    } catch (error) {
      notifyAlertError("app.alerts.createThreadFailed", error, { logMessage: "创建工作区会话失败" });
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
      notifyAlertError("app.alerts.createThreadFailed", error, {
        logMessage: "创建工作区会话失败",
        rethrow: true,
      });
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
      notifyAlertError("app.alerts.sendTurnFailed", error, { logMessage: "发送工作区消息失败" });
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
      notifyAlertError("app.alerts.setMultiAgentFailed", error, {
        logMessage: "切换多代理失败",
        rethrow: true,
      });
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
