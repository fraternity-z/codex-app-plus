import { lazy, Suspense, useCallback, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { HostBridge } from "../../../bridge/types";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import {
  createDefaultWorktreeProjectName,
  requestWorkspaceFolder,
  useWorkspaceWorktrees,
  WorktreeCreateDialog,
  type WorkspaceRootController,
} from "../../workspace";
import { useSettingsScreenState } from "../hooks/useSettingsScreenState";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import { SettingsLoadingFallback } from "../../shared";
import type { ResolvedTheme } from "../../../domain/theme";
import { useI18n } from "../../../i18n";
import { selectSteerFeatureState } from "../config/experimentalFeatures";
import type { SettingsSection, SettingsViewProps } from "./SettingsView";
import successSoundUrl from "../../../assets/success-notification.mp3";
import { deliverNotification, playNotificationSound } from "../../notifications";

const LazySettingsView = lazy(async () => {
  const module = await import("./SettingsView");
  return { default: module.SettingsView };
});

interface SettingsScreenProps {
  readonly controller: Pick<
    SettingsViewProps,
    | "applyAgentsConfig"
    | "batchWriteConfig"
    | "batchWriteConfigSnapshot"
    | "checkForAppUpdate"
    | "installAppUpdate"
    | "listArchivedThreads"
    | "refreshConfigSnapshot"
    | "refreshMcpData"
    | "resetMemories"
    | "setThreadMemoryMode"
    | "unarchiveThread"
    | "writeConfigValue"
  >;
  readonly hostBridge: HostBridge;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly section: SettingsSection;
  readonly sidebarCollapsed: boolean;
  readonly sidebarWidth?: number;
  readonly sidebarResizing?: boolean;
  readonly workspace: WorkspaceRootController;
  readonly petAwake: boolean;
  readonly onBackHome: () => void;
  readonly onSelectSection: (section: SettingsSection) => void;
  readonly onSidebarResizeStart?: (event: ReactMouseEvent) => void;
  readonly onTogglePetAwake: () => void;
}

export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  const state = useSettingsScreenState();
  const { t } = useI18n();
  const { reportError } = useUiBannerNotifications("settings-screen");
  const steerState = selectSteerFeatureState(state.experimentalFeatures, state.configSnapshot);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [notificationTestFeedback, setNotificationTestFeedback] = useState<{
    readonly tone: "success" | "error";
    readonly message: string;
  } | null>(null);
  const selectedRoot = props.workspace.selectedRoot;
  const selectedRootPath = props.workspace.selectedRoot?.path ?? null;
  const worktreeController = useWorkspaceWorktrees({
    hostBridge: props.hostBridge,
    workspace: props.workspace,
    selectedRootPath,
    enabled: props.section === "worktree",
    autoCleanupEnabled: props.preferences.gitAutoDeleteWorktrees,
    autoCleanupRetention: props.preferences.gitAutoDeleteRetention,
    reportError,
  });

  const addRoot = useCallback(async () => {
    try {
      const root = await requestWorkspaceFolder("选择工作区", "暂不支持一次选择多个工作区。");
      if (root !== null) {
        props.workspace.addRoot(root);
      }
    } catch (error) {
      reportError("选择工作区文件夹失败", error);
    }
  }, [props.workspace, reportError]);
  const openConfigToml = useCallback(async (filePath?: string | null) => {
    try {
      const writeTarget = readUserConfigWriteTarget(state.configSnapshot);
      await props.hostBridge.app.openCodexConfigToml({
        agentEnvironment: props.preferences.agentEnvironment,
        filePath: filePath === undefined ? writeTarget.filePath : filePath,
      });
    } catch (error) {
      reportError("打开 config.toml 失败", error);
    }
  }, [props.hostBridge.app, props.preferences.agentEnvironment, reportError, state.configSnapshot]);

  const openConfigDocs = useCallback(async () => {
    try {
      await props.hostBridge.app.openExternal(
        "https://developers.openai.com/codex/config-basic",
      );
    } catch (error) {
      reportError("打开 Codex 配置文档失败", error);
    }
  }, [props.hostBridge.app, reportError]);

  const openMcpDocs = useCallback(async () => {
    try {
      await props.hostBridge.app.openExternal(
        "https://developers.openai.com/codex/mcp",
      );
    } catch (error) {
      reportError("打开 MCP 文档失败", error);
    }
  }, [props.hostBridge.app, reportError]);

  const createWorktree = useCallback(async () => {
    if (selectedRoot === null) {
      return;
    }
    setCreateDialogOpen(true);
  }, [selectedRoot]);

  const confirmCreateWorktree = useCallback(async (projectName: string) => {
    if (selectedRoot === null) {
      return;
    }
    try {
      await worktreeController.createStableWorktree(selectedRoot, projectName);
      setCreateDialogOpen(false);
    } catch (error) {
      reportError("创建工作树失败", error);
      throw error;
    }
  }, [reportError, selectedRoot, worktreeController]);

  const deleteWorktree = useCallback(async (worktreePath: string) => {
    try {
      await worktreeController.deleteManagedWorktree(worktreePath);
    } catch (error) {
      reportError("删除工作树失败", error);
    }
  }, [reportError, worktreeController]);

  const testNotificationSound = useCallback(() => {
    setNotificationTestFeedback(null);
    playNotificationSound(successSoundUrl, "test");
  }, []);

  const testSystemNotification = useCallback(() => {
    void (async () => {
      const result = await deliverNotification(
        props.hostBridge.app,
        "Test Notification",
        "This is a test notification from Codex App Plus.",
      );

      if (result.status === "sent") {
        setNotificationTestFeedback({
          tone: "success",
          message:
            result.via === "system"
              ? t("settings.general.notifications.test.systemSent")
              : t("settings.general.notifications.test.fallbackUsed"),
        });
        return;
      }

      setNotificationTestFeedback({
        tone: "error",
        message: t("settings.general.notifications.test.failed"),
      });
      reportError("发送测试通知失败", result.error);
    })();
  }, [props.hostBridge.app, reportError, t]);

  const settingsProps: SettingsViewProps = {
    appUpdate: state.appUpdate,
    section: props.section,
    sidebarCollapsed: props.sidebarCollapsed,
    sidebarWidth: props.sidebarWidth,
    sidebarResizing: props.sidebarResizing,
    roots: props.workspace.roots,
    selectedRoot: props.workspace.selectedRoot,
    worktrees: worktreeController.worktrees,
    onCreateWorktree: createWorktree,
    onDeleteWorktree: deleteWorktree,
    preferences: props.preferences,
    resolvedTheme: props.resolvedTheme,
    configSnapshot: state.configSnapshot,
    selectedConversationId: state.selectedConversationId,
    experimentalFeatures: state.experimentalFeatures,
    steerAvailable: steerState.available,
    busy: state.bootstrapBusy,
    ready: state.initialized,
    onTestNotificationSound: testNotificationSound,
    onTestSystemNotification: testSystemNotification,
    notificationTestFeedback,
    petAwake: props.petAwake,
    onBackHome: props.onBackHome,
    onSelectSection: props.onSelectSection,
    onSidebarResizeStart: props.onSidebarResizeStart,
    onTogglePetAwake: props.onTogglePetAwake,
    onAddRoot: () => void addRoot(),
    onOpenConfigToml: openConfigToml,
    onOpenConfigDocs: openConfigDocs,
    onOpenMcpDocs: openMcpDocs,
    writeProjectPermissionConfig: (input) =>
      props.hostBridge.app.writeProjectPermissionConfig(input),
    refreshConfigSnapshot: props.controller.refreshConfigSnapshot,
    readGlobalAgentInstructions: () =>
      props.hostBridge.app.readGlobalAgentInstructions({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    listCustomPets: () =>
      props.hostBridge.app.listCustomPets({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    openCustomPetsFolder: (path) =>
      props.hostBridge.app.revealPathInFolder({ path }),
    listManagedPrompts: () =>
      props.hostBridge.app.listManagedPrompts({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    upsertManagedPrompt: (input) =>
      props.hostBridge.app.upsertManagedPrompt({
        ...input,
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    deleteManagedPrompt: (name) =>
      props.hostBridge.app.deleteManagedPrompt({
        agentEnvironment: props.preferences.agentEnvironment,
        name,
      }),
    setUserModelInstructionsFile: (path) =>
      props.hostBridge.app.setUserModelInstructionsFile({
        agentEnvironment: props.preferences.agentEnvironment,
        path,
      }),
    applyAgentsConfig: props.controller.applyAgentsConfig,
    writeGlobalAgentInstructions: (input) =>
      props.hostBridge.app.writeGlobalAgentInstructions({
        ...input,
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    readProxySettings: (input) =>
      props.hostBridge.app.readProxySettings(input),
    writeProxySettings: (input) =>
      props.hostBridge.app.writeProxySettings(input),
    readMcpSharedPoolSettings: (input) =>
      props.hostBridge.app.readMcpSharedPoolSettings(input),
    writeMcpSharedPoolSettings: (input) =>
      props.hostBridge.app.writeMcpSharedPoolSettings(input),
    readBrowserUseSettings: () =>
      props.hostBridge.app.readBrowserUseSettings(),
    writeBrowserUseApprovalMode: (input) =>
      props.hostBridge.app.writeBrowserUseApprovalMode(input),
    addBrowserUseOrigin: (input) =>
      props.hostBridge.app.addBrowserUseOrigin(input),
    removeBrowserUseOrigin: (input) =>
      props.hostBridge.app.removeBrowserUseOrigin(input),
    readComputerUseSettings: () =>
      props.hostBridge.app.readComputerUseSettings(),
    addComputerUseApp: (input) =>
      props.hostBridge.app.addComputerUseApp(input),
    removeComputerUseApp: (input) =>
      props.hostBridge.app.removeComputerUseApp(input),
    clearBrowserBrowsingData: () =>
      props.hostBridge.app.clearBrowserBrowsingData(),
    clearBrowserBrowsingDataByKind: (input) =>
      props.hostBridge.app.clearBrowserBrowsingDataByKind(input),
    refreshMcpData: props.controller.refreshMcpData,
    listArchivedThreads: props.controller.listArchivedThreads,
    unarchiveThread: props.controller.unarchiveThread,
    writeConfigValue: props.controller.writeConfigValue,
    batchWriteConfig: props.controller.batchWriteConfig,
    batchWriteConfigSnapshot: props.controller.batchWriteConfigSnapshot,
    setThreadMemoryMode: props.controller.setThreadMemoryMode,
    resetMemories: props.controller.resetMemories,
    checkForAppUpdate: props.controller.checkForAppUpdate,
    installAppUpdate: props.controller.installAppUpdate,
  };

  return (
    <>
      <Suspense fallback={<SettingsLoadingFallback />}>
        <LazySettingsView {...settingsProps} />
      </Suspense>
      <WorktreeCreateDialog
        open={createDialogOpen}
        initialName={createDefaultWorktreeProjectName(selectedRoot, props.workspace.roots)}
        onClose={() => setCreateDialogOpen(false)}
        onConfirm={confirmCreateWorktree}
      />
    </>
  );
}
