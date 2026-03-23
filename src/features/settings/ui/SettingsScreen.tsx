import { lazy, Suspense, useCallback } from "react";
import type { HostBridge } from "../../../bridge/types";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { requestWorkspaceFolder } from "../../../app/workspacePicker";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../../../app/controller/appControllerTypes";
import { useSettingsScreenState } from "../../../app/controller/appControllerState";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import { SettingsLoadingFallback } from "../../../app/ui/SettingsLoadingFallback";
import type { ResolvedTheme } from "../../../domain/theme";
import { selectSteerFeatureState } from "../config/experimentalFeatures";
import type { SettingsSection, SettingsViewProps } from "./SettingsView";

const LazySettingsView = lazy(async () => {
  const module = await import("./SettingsView");
  return { default: module.SettingsView };
});

interface SettingsScreenProps {
  readonly controller: AppController;
  readonly hostBridge: HostBridge;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly section: SettingsSection;
  readonly workspace: WorkspaceRootController;
  readonly onBackHome: () => void;
  readonly onSelectSection: (section: SettingsSection) => void;
}

export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  const state = useSettingsScreenState();
  const { notifyError } = useUiBannerNotifications("settings-screen");
  const steerState = selectSteerFeatureState(state.experimentalFeatures, state.configSnapshot);
  const addRoot = useCallback(async () => {
    try {
      const root = await requestWorkspaceFolder("选择工作区", "暂不支持一次选择多个工作区。");
      if (root !== null) {
        props.workspace.addRoot(root);
      }
    } catch (error) {
      console.error("选择工作区文件夹失败", error);
      notifyError("选择工作区文件夹失败", error);
    }
  }, [notifyError, props.workspace]);
  const openConfigToml = useCallback(async () => {
    try {
      const writeTarget = readUserConfigWriteTarget(state.configSnapshot);
      await props.hostBridge.app.openCodexConfigToml({
        agentEnvironment: props.preferences.agentEnvironment,
        filePath: writeTarget.filePath,
      });
    } catch (error) {
      console.error("打开 config.toml 失败", error);
      notifyError("打开 config.toml 失败", error);
    }
  }, [notifyError, props.hostBridge.app, props.preferences.agentEnvironment, state.configSnapshot]);

  const settingsProps: SettingsViewProps = {
    appUpdate: state.appUpdate,
    section: props.section,
    roots: props.workspace.roots,
    preferences: props.preferences,
    resolvedTheme: props.resolvedTheme,
    configSnapshot: state.configSnapshot,
    steerAvailable: steerState.available,
    busy: state.bootstrapBusy,
    ready: state.initialized,
    windowsSandboxSetup: state.windowsSandboxSetup,
    onBackHome: props.onBackHome,
    onSelectSection: props.onSelectSection,
    onAddRoot: () => void addRoot(),
    onOpenConfigToml: openConfigToml,
    refreshConfigSnapshot: props.controller.refreshConfigSnapshot,
    refreshAuthState: props.controller.refreshAuthState,
    login: props.controller.login,
    readGlobalAgentInstructions: () =>
      props.hostBridge.app.readGlobalAgentInstructions({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    writeGlobalAgentInstructions: (input) =>
      props.hostBridge.app.writeGlobalAgentInstructions({
        ...input,
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    listCodexProviders: () => props.hostBridge.app.listCodexProviders(),
    upsertCodexProvider: (input) => props.hostBridge.app.upsertCodexProvider(input),
    deleteCodexProvider: (input) => props.hostBridge.app.deleteCodexProvider(input),
    applyCodexProvider: (input) =>
      props.hostBridge.app.applyCodexProvider({
        ...input,
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    getCodexAuthModeState: () =>
      props.hostBridge.app.getCodexAuthModeState({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    activateCodexChatgpt: () =>
      props.hostBridge.app.activateCodexChatgpt({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    refreshMcpData: props.controller.refreshMcpData,
    listArchivedThreads: props.controller.listArchivedThreads,
    unarchiveThread: props.controller.unarchiveThread,
    writeConfigValue: props.controller.writeConfigValue,
    batchWriteConfig: props.controller.batchWriteConfig,
    checkForAppUpdate: props.controller.checkForAppUpdate,
    installAppUpdate: props.controller.installAppUpdate,
  };

  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <LazySettingsView {...settingsProps} />
    </Suspense>
  );
}
