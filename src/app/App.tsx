import { useCallback, useMemo, useState } from "react";
import type { ComposerSelection } from "../features/composer/model/composerPreferences";
import { readUserConfigWriteTarget } from "../features/settings/config/configWriteTarget";
import { selectMultiAgentFeatureState } from "../features/settings/config/experimentalFeatures";
import { useAppShellState } from "./controller/appControllerState";
import { useAppController } from "./controller/useAppController";
import { useAppPreferences } from "../features/settings/hooks/useAppPreferences";
import { useComposerPicker } from "../features/composer/hooks/useComposerPicker";
import { useWorkspaceConversation } from "../features/conversation/hooks/useWorkspaceConversation";
import { useUiBannerNotifications } from "../features/shared/hooks/useUiBannerNotifications";
import { useWorkspaceRoots } from "../features/workspace/hooks/useWorkspaceRoots";
import type { HostBridge } from "../bridge/types";
import type { SettingsSection } from "../features/settings/ui/SettingsView";
import { I18nProvider, resolveLocale, type MessageKey, type TranslationParams, translate } from "../i18n";
import { AppScreenContent, type AppScreen } from "./ui/AppScreenContent";
import { requestWorkspaceFolder } from "./workspacePicker";
import { useDismissStartupScreen } from "./startupScreen";

const SKILLS_LEARN_MORE_URL = "https://openai.com/index/introducing-the-codex-app/";
interface AppProps {
  readonly hostBridge: HostBridge;
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const preferences = useAppPreferences();
  const appState = useAppShellState();
  const controller = useAppController(hostBridge, preferences.agentEnvironment);
  const composerPicker = useComposerPicker(hostBridge, appState.configSnapshot, appState.initialized);
  const workspace = useWorkspaceRoots();
  const [screen, setScreen] = useState<AppScreen>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const locale = resolveLocale(preferences.uiLanguage);
  const t = useCallback(
    (key: MessageKey, params?: TranslationParams) => translate(locale, key, params),
    [locale]
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
    collaborationModes: appState.collaborationModes,
    followUpQueueMode: preferences.followUpQueueMode,
  });
  const multiAgentState = useMemo(
    () => selectMultiAgentFeatureState(appState.experimentalFeatures, appState.configSnapshot),
    [appState.configSnapshot, appState.experimentalFeatures]
  );
  const openConfigToml = useCallback(async () => {
    try {
      const writeTarget = readUserConfigWriteTarget(appState.configSnapshot);
      await hostBridge.app.openCodexConfigToml({
        agentEnvironment: preferences.agentEnvironment,
        filePath: writeTarget.filePath
      });
    } catch (error) {
      console.error("打开 config.toml 失败", error);
      reportAppError("app.alerts.openConfigFailed", error);
    }
  }, [appState.configSnapshot, hostBridge.app, preferences.agentEnvironment, reportAppError]);
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
  const backHome = useCallback(() => {
    setScreen("home");
    setSettingsMenuOpen(false);
  }, []);
  const openSettingsSection = useCallback((section: SettingsSection) => {
    setScreen(section);
    setSettingsMenuOpen(false);
  }, []);
  const openSettings = useCallback(() => {
    openSettingsSection("general");
  }, [openSettingsSection]);
  const openSkills = useCallback(() => {
    setScreen("skills");
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
      const writeTarget = readUserConfigWriteTarget(appState.configSnapshot);
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
    [appState.configSnapshot, controller.batchWriteConfigSnapshot, t]
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

  const authBusy = appState.bootstrapBusy || appState.authLoginPending;
  const shouldShowAuthChoice = appState.authStatus === "needs_login" && screen === "home";
  useDismissStartupScreen(appState.fatalError !== null || (appState.initialized && !appState.bootstrapBusy));

  return (
    <I18nProvider language={preferences.uiLanguage} setLanguage={preferences.setUiLanguage}>
      <AppScreenContent
        screen={screen}
        hostBridge={hostBridge}
        appState={appState}
        preferences={preferences}
        workspace={workspace}
        conversation={conversation}
        composerPicker={composerPicker}
        controller={controller}
        multiAgentState={multiAgentState}
        selectedRootName={selectedRootName}
        selectedRootPath={selectedRootPath}
        settingsMenuOpen={settingsMenuOpen}
        authBusy={authBusy}
        shouldShowAuthChoice={shouldShowAuthChoice}
        onBackHome={backHome}
        onOpenSettings={openSettings}
        onOpenSettingsSection={openSettingsSection}
        onOpenSkills={openSkills}
        onToggleSettingsMenu={() => setSettingsMenuOpen((openValue) => !openValue)}
        onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
        onAddRoot={addRoot}
        onCreateWorkspaceThread={createWorkspaceThread}
        onSendWorkspaceTurn={sendWorkspaceTurn}
        onPersistComposerSelection={persistComposerSelection}
        onSetMultiAgentEnabled={setMultiAgentEnabled}
        onDismissBanner={dismissBanner}
        onOpenConfigToml={openConfigToml}
        readGlobalAgentInstructions={readGlobalAgentInstructions}
        writeGlobalAgentInstructions={writeGlobalAgentInstructions}
        listCodexProviders={listCodexProviders}
        upsertCodexProvider={upsertCodexProvider}
        deleteCodexProvider={deleteCodexProvider}
        applyCodexProvider={applyCodexProvider}
        onOpenSkillsLearnMore={() => hostBridge.app.openExternal(SKILLS_LEARN_MORE_URL)}
      />
    </I18nProvider>
  );
}
