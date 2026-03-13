import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import type { ComposerSelection } from "../features/composer/model/composerPreferences";
import { readUserConfigWriteTarget } from "../features/settings/config/configWriteTarget";
import { selectMultiAgentFeatureState } from "../features/settings/config/experimentalFeatures";
import { useAppController } from "./controller/useAppController";
import { useAppPreferences } from "../features/settings/hooks/useAppPreferences";
import { useComposerPicker } from "../features/composer/hooks/useComposerPicker";
import { useWorkspaceConversation } from "../features/conversation/hooks/useWorkspaceConversation";
import { useUiBannerNotifications } from "../features/shared/hooks/useUiBannerNotifications";
import { useWorkspaceRoots } from "../features/workspace/hooks/useWorkspaceRoots";
import type { HostBridge } from "../bridge/types";
import { AuthChoiceView } from "../features/auth/ui/AuthChoiceView";
import { HomeView } from "../features/home/ui/HomeView";
import type { SettingsSection } from "../features/settings/ui/SettingsView";
import { I18nProvider, type MessageKey, type TranslationParams, translate } from "../i18n";
import { requestWorkspaceFolder } from "./workspacePicker";
import { SettingsLoadingFallback } from "./ui/SettingsLoadingFallback";
const LazySettingsView = lazy(async () => {
  const module = await import("../features/settings/ui/SettingsView");
  return { default: module.SettingsView };
});
interface AppProps {
  readonly hostBridge: HostBridge;
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const preferences = useAppPreferences();
  const controller = useAppController(hostBridge, preferences.agentEnvironment);
  const composerPicker = useComposerPicker(hostBridge, controller.state.configSnapshot, controller.state.initialized);
  const workspace = useWorkspaceRoots();
  const [screen, setScreen] = useState<"home" | SettingsSection>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const t = useCallback(
    (key: MessageKey, params?: TranslationParams) => translate(preferences.uiLanguage, key, params),
    [preferences.uiLanguage]
  );
  const { dismissBanner, pushBanner } = useUiBannerNotifications("app");
  const reportAppError = useCallback(
    (key: MessageKey, error: unknown) => {
      pushBanner({ level: "error", title: t(key, { error: String(error) }) });
    },
    [pushBanner, t]
  );

  const selectedRoot = workspace.roots.find((root) => root.id === workspace.selectedRootId) ?? null;
  const selectedRootName = selectedRoot?.name ?? t("home.workspaceSelector.placeholder");
  const selectedRootPath = selectedRoot?.path ?? null;
  const conversation = useWorkspaceConversation({
    agentEnvironment: preferences.agentEnvironment,
    hostBridge,
    selectedRootPath,
    collaborationModes: controller.state.collaborationModes,
    followUpQueueMode: preferences.followUpQueueMode,
  });
  const multiAgentState = useMemo(
    () => selectMultiAgentFeatureState(controller.state.experimentalFeatures, controller.state.configSnapshot),
    [controller.state.configSnapshot, controller.state.experimentalFeatures]
  );
  const openConfigToml = useCallback(async () => {
    try {
      const writeTarget = readUserConfigWriteTarget(controller.state.configSnapshot);
      await hostBridge.app.openCodexConfigToml({
        agentEnvironment: preferences.agentEnvironment,
        filePath: writeTarget.filePath
      });
    } catch (error) {
      console.error("打开 config.toml 失败", error);
      reportAppError("app.alerts.openConfigFailed", error);
    }
  }, [controller.state.configSnapshot, hostBridge.app, preferences.agentEnvironment, reportAppError]);
  const readGlobalAgentInstructions = useCallback(
    () => hostBridge.app.readGlobalAgentInstructions({ agentEnvironment: preferences.agentEnvironment }),
    [hostBridge.app, preferences.agentEnvironment]
  );
  const listCodexProviders = useCallback(
    () => hostBridge.app.listCodexProviders(),
    [hostBridge.app]
  );
  const upsertCodexProvider = useCallback(
    (input: Parameters<typeof hostBridge.app.upsertCodexProvider>[0]) =>
      hostBridge.app.upsertCodexProvider(input),
    [hostBridge.app]
  );
  const deleteCodexProvider = useCallback(
    (input: Parameters<typeof hostBridge.app.deleteCodexProvider>[0]) =>
      hostBridge.app.deleteCodexProvider(input),
    [hostBridge.app]
  );
  const applyCodexProvider = useCallback(
    (input: Parameters<typeof hostBridge.app.applyCodexProvider>[0]) =>
      hostBridge.app.applyCodexProvider({
        ...input,
        agentEnvironment: preferences.agentEnvironment
      }),
    [hostBridge.app, preferences.agentEnvironment]
  );
  const writeGlobalAgentInstructions = useCallback(
    (input: Parameters<typeof hostBridge.app.writeGlobalAgentInstructions>[0]) =>
      hostBridge.app.writeGlobalAgentInstructions({
        ...input,
        agentEnvironment: preferences.agentEnvironment
      }),
    [hostBridge.app, preferences.agentEnvironment]
  );
  const openSettings = useCallback(() => {
    setScreen("general");
    setSettingsMenuOpen(false);
  }, []);
  const addRoot = useCallback(async () => {
    try {
      const root = await requestWorkspaceFolder(
        t("app.workspacePicker.title"),
        t("app.workspacePicker.singleOnlyError")
      );
      if (root !== null) {
        workspace.addRoot(root);
      }
    } catch (error) {
      console.error("选择工作区文件夹失败", error);
      reportAppError("app.alerts.selectWorkspaceFailed", error);
    }
  }, [reportAppError, t, workspace]);
  const createWorkspaceThread = useCallback(async () => {
    try {
      await conversation.createThread();
    } catch (error) {
      console.error("创建工作区会话失败", error);
      reportAppError("app.alerts.createThreadFailed", error);
    }
  }, [conversation.createThread, reportAppError]);
  const sendWorkspaceTurn = useCallback(
    async (sendOptions: Parameters<typeof conversation.sendTurn>[0]) => {
      try {
        await conversation.sendTurn(sendOptions);
      } catch (error) {
        console.error("发送工作区消息失败", error);
        reportAppError("app.alerts.sendTurnFailed", error);
      }
    },
    [conversation.sendTurn, reportAppError]
  );

  const persistComposerSelection = useCallback(
    async (selection: ComposerSelection) => {
      if (selection.model === null || selection.effort === null) {
        throw new Error(t("app.composer.invalidSelection"));
      }
      const writeTarget = readUserConfigWriteTarget(controller.state.configSnapshot);
      await controller.batchWriteConfigSnapshot({
        edits: [
          { keyPath: "model", value: selection.model, mergeStrategy: "upsert" },
          { keyPath: "model_reasoning_effort", value: selection.effort, mergeStrategy: "upsert" },
          { keyPath: "service_tier", value: selection.serviceTier, mergeStrategy: "replace" }
        ],
        filePath: writeTarget.filePath,
        expectedVersion: writeTarget.expectedVersion
      });
    },
    [controller.batchWriteConfigSnapshot, controller.state.configSnapshot, t]
  );
  const setMultiAgentEnabled = useCallback(async (enabled: boolean) => {
    try {
      await controller.setMultiAgentEnabled(enabled);
    } catch (error) {
      console.error("切换多代理失败", error);
      reportAppError("app.alerts.setMultiAgentFailed", error);
      throw error;
    }
  }, [controller, reportAppError]);

  const rateLimitSummary = controller.state.rateLimits === null
    ? null
    : `Rate limit: ${controller.state.rateLimits.limitName ?? controller.state.rateLimits.limitId ?? "default"}`;
  const authBusy = controller.state.bootstrapBusy || controller.state.authLogin.pending;
  const shouldShowAuthChoice = controller.state.authStatus === "needs_login" && screen === "home";
  const content = screen !== "home"
    ? (
      <Suspense fallback={<SettingsLoadingFallback />}>
        <LazySettingsView
          section={screen}
          roots={workspace.roots}
          preferences={preferences}
          configSnapshot={controller.state.configSnapshot}
          busy={controller.state.bootstrapBusy}
          windowsSandboxSetup={controller.state.windowsSandboxSetup}
          onBackHome={() => setScreen("home")}
          onSelectSection={setScreen}
          onAddRoot={addRoot}
          onOpenConfigToml={openConfigToml}
          refreshConfigSnapshot={controller.refreshConfigSnapshot}
          refreshAuthState={controller.refreshAuthState}
          readGlobalAgentInstructions={readGlobalAgentInstructions}
          writeGlobalAgentInstructions={writeGlobalAgentInstructions}
          listCodexProviders={listCodexProviders}
          upsertCodexProvider={upsertCodexProvider}
          deleteCodexProvider={deleteCodexProvider}
          applyCodexProvider={applyCodexProvider}
          refreshMcpData={controller.refreshMcpData}
          listArchivedThreads={controller.listArchivedThreads}
          unarchiveThread={controller.unarchiveThread}
          writeConfigValue={controller.writeConfigValue}
          batchWriteConfig={controller.batchWriteConfig}
          startWindowsSandboxSetup={controller.startWindowsSandboxSetup}
        />
      </Suspense>
    )
    : shouldShowAuthChoice
      ? (
        <AuthChoiceView
          busy={authBusy}
          loginPending={controller.state.authLogin.pending}
          onLogin={controller.login}
          onUseApiKey={() => setScreen("config")}
        />
      )
      : (
        <HomeView
          hostBridge={hostBridge}
          busy={controller.state.bootstrapBusy}
          inputText={controller.state.inputText}
          roots={workspace.roots}
          selectedRootId={workspace.selectedRootId}
          selectedRootName={selectedRootName}
          selectedRootPath={selectedRootPath}
          threads={conversation.workspaceThreads}
          selectedThread={conversation.selectedThread}
          selectedThreadId={conversation.selectedThreadId}
          activeTurnId={conversation.activeTurnId}
          turnStatuses={conversation.turnStatuses}
          isResponding={conversation.isResponding}
          interruptPending={conversation.interruptPending}
          activities={conversation.activities}
          banners={controller.state.banners}
          account={controller.state.account}
          rateLimitSummary={rateLimitSummary}
          queuedFollowUps={conversation.queuedFollowUps}
          draftActive={conversation.draftActive}
          selectedConversationLoading={conversation.selectedConversationLoading}
          collaborationPreset={conversation.collaborationPreset}
          models={composerPicker.models}
          defaultModel={composerPicker.defaultModel}
          defaultEffort={composerPicker.defaultEffort}
          defaultServiceTier={composerPicker.defaultServiceTier}
          workspaceOpener={preferences.workspaceOpener}
          embeddedTerminalShell={preferences.embeddedTerminalShell}
          embeddedTerminalUtf8={preferences.embeddedTerminalUtf8}
          threadDetailLevel={preferences.threadDetailLevel}
          followUpQueueMode={preferences.followUpQueueMode}
          composerEnterBehavior={preferences.composerEnterBehavior}
          composerPermissionLevel={preferences.composerPermissionLevel}
          connectionStatus={controller.state.connectionStatus}
          fatalError={controller.state.fatalError}
          authStatus={controller.state.authStatus}
          authMode={controller.state.authMode}
          authBusy={authBusy}
          authLoginPending={controller.state.authLogin.pending}
          retryScheduledAt={controller.state.retryScheduledAt}
          settingsMenuOpen={settingsMenuOpen}
          onToggleSettingsMenu={() => setSettingsMenuOpen((openValue) => !openValue)}
          onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
          onOpenSettings={openSettings}
          onSelectWorkspaceOpener={preferences.setWorkspaceOpener}
          onSelectComposerPermissionLevel={preferences.setComposerPermissionLevel}
          onSelectRoot={workspace.selectRoot}
          onSelectThread={conversation.selectThread}
          onSelectCollaborationPreset={conversation.selectCollaborationPreset}
          onInputChange={controller.setInput}
          onCreateThread={createWorkspaceThread}
          onArchiveThread={controller.archiveThread}
          onSendTurn={sendWorkspaceTurn}
          onPersistComposerSelection={persistComposerSelection}
          multiAgentAvailable={multiAgentState.available}
          multiAgentEnabled={multiAgentState.enabled}
          onSetMultiAgentEnabled={setMultiAgentEnabled}
          onUpdateThreadBranch={conversation.updateThreadBranch}
          onInterruptTurn={conversation.interruptActiveTurn}
          onAddRoot={addRoot}
          onRemoveRoot={workspace.removeRoot}
          onRetryConnection={controller.retryConnection}
          onLogin={controller.login}
          onLogout={controller.logout}
          onResolveServerRequest={controller.resolveServerRequest}
          onRemoveQueuedFollowUp={conversation.removeQueuedFollowUp}
          onClearQueuedFollowUps={conversation.clearQueuedFollowUps}
          onDismissBanner={dismissBanner}
        />
      );

  return (
    <I18nProvider locale={preferences.uiLanguage} setLocale={preferences.setUiLanguage}>
      {content}
    </I18nProvider>
  );
}
