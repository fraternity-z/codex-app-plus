import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { HostBridge, GitWorktreeEntry } from "../../../bridge/types";
import { readUserConfigWriteTarget } from "../config/configWriteTarget";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { requestWorkspaceFolder } from "../../../app/workspacePicker";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../../../app/controller/appControllerTypes";
import { useSettingsScreenState } from "../../../app/controller/appControllerState";
import { useUiBannerNotifications } from "../../shared/hooks/useUiBannerNotifications";
import { SettingsLoadingFallback } from "../../../app/ui/SettingsLoadingFallback";
import type { ResolvedTheme } from "../../../domain/theme";
import { useI18n } from "../../../i18n";
import { selectSteerFeatureState } from "../config/experimentalFeatures";
import type { SettingsSection, SettingsViewProps } from "./SettingsView";
import successSoundUrl from "../../../assets/success-notification.mp3";
import { playNotificationSound } from "../../notifications/model/notificationSounds";
import { deliverNotification } from "../../notifications/model/systemNotifications";

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
  readonly sidebarCollapsed: boolean;
  readonly workspace: WorkspaceRootController;
  readonly onBackHome: () => void;
  readonly onSelectSection: (section: SettingsSection) => void;
}

export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  const state = useSettingsScreenState();
  const { t } = useI18n();
  const { reportError } = useUiBannerNotifications("settings-screen");
  const steerState = selectSteerFeatureState(state.experimentalFeatures, state.configSnapshot);
  const [worktrees, setWorktrees] = useState<ReadonlyArray<GitWorktreeEntry>>([]);
  const [notificationTestFeedback, setNotificationTestFeedback] = useState<{
    readonly tone: "success" | "error";
    readonly message: string;
  } | null>(null);
  const selectedRootPath = props.workspace.selectedRoot?.path ?? null;
  const managedWorktreeSet = useMemo(
    () => new Set(props.workspace.managedWorktrees.map((item) => item.path.replace(/\\/g, "/").toLowerCase())),
    [props.workspace.managedWorktrees],
  );
  const managedWorktreeMap = useMemo(
    () => new Map(props.workspace.managedWorktrees.map((item) => [item.path.replace(/\\/g, "/").toLowerCase(), item])),
    [props.workspace.managedWorktrees],
  );

  useEffect(() => {
    let cancelled = false;
    if (props.section !== "worktree" || selectedRootPath === null) {
      setWorktrees([]);
      return;
    }
    void props.hostBridge.git.getWorktrees({ repoPath: selectedRootPath }).then((entries) => {
      if (!cancelled) {
        setWorktrees(entries.filter((entry) => managedWorktreeSet.has(entry.path.replace(/\\/g, "/").toLowerCase())));
      }
    }).catch((error) => {
      if (!cancelled) {
        setWorktrees([]);
      }
      reportError("读取工作树失败", error);
    });
    return () => {
      cancelled = true;
    };
  }, [props.hostBridge.git, props.section, reportError, selectedRootPath, managedWorktreeSet]);

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
  const openConfigToml = useCallback(async () => {
    try {
      const writeTarget = readUserConfigWriteTarget(state.configSnapshot);
      await props.hostBridge.app.openCodexConfigToml({
        agentEnvironment: props.preferences.agentEnvironment,
        filePath: writeTarget.filePath,
      });
    } catch (error) {
      reportError("打开 config.toml 失败", error);
    }
  }, [props.hostBridge.app, props.preferences.agentEnvironment, reportError, state.configSnapshot]);

  const createWorktree = useCallback(async () => {
    if (selectedRootPath === null) {
      return;
    }
    const branchName = window.prompt("请输入新的 worktree 分支名");
    if (branchName === null || branchName.trim().length === 0) {
      return;
    }
    try {
      const created = await props.hostBridge.git.addWorktree({
        repoPath: selectedRootPath,
        branchName: branchName.trim(),
      });
      props.workspace.addRoot({ name: created.branch ?? created.path, path: created.path });
      props.workspace.addManagedWorktree({ path: created.path, repoPath: selectedRootPath, branch: created.branch });
      const entries = await props.hostBridge.git.getWorktrees({ repoPath: selectedRootPath });
      setWorktrees(entries.filter((entry) => {
        const normalizedPath = entry.path.replace(/\\/g, "/").toLowerCase();
        return normalizedPath === created.path.replace(/\\/g, "/").toLowerCase() || managedWorktreeSet.has(normalizedPath);
      }));
    } catch (error) {
      reportError("创建工作树失败", error);
    }
  }, [props.hostBridge.git, props.workspace, reportError, selectedRootPath, managedWorktreeSet]);

  const deleteWorktree = useCallback(async (worktreePath: string) => {
    if (selectedRootPath === null) {
      return;
    }
    try {
      const record = managedWorktreeMap.get(worktreePath.replace(/\\/g, "/").toLowerCase());
      await props.hostBridge.git.removeWorktree({
        repoPath: record?.repoPath ?? selectedRootPath,
        worktreePath,
      });
      const matchedRoot = props.workspace.roots.find((root) => root.path === worktreePath);
      if (matchedRoot) {
        props.workspace.removeRoot(matchedRoot.id);
      }
      props.workspace.removeManagedWorktree(worktreePath);
      const remaining = await props.hostBridge.git.getWorktrees({ repoPath: record?.repoPath ?? selectedRootPath });
      setWorktrees(remaining.filter((entry) => managedWorktreeSet.has(entry.path.replace(/\\/g, "/").toLowerCase()) && entry.path !== worktreePath));
    } catch (error) {
      reportError("删除工作树失败", error);
    }
  }, [props.hostBridge.git, props.workspace, reportError, selectedRootPath, managedWorktreeMap, managedWorktreeSet]);

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
    roots: props.workspace.roots,
    worktrees,
    onCreateWorktree: createWorktree,
    onDeleteWorktree: deleteWorktree,
    preferences: props.preferences,
    resolvedTheme: props.resolvedTheme,
    configSnapshot: state.configSnapshot,
    experimentalFeatures: state.experimentalFeatures,
    steerAvailable: steerState.available,
    busy: state.bootstrapBusy,
    ready: state.initialized,
    onTestNotificationSound: testNotificationSound,
    onTestSystemNotification: testSystemNotification,
    notificationTestFeedback,
    onBackHome: props.onBackHome,
    onSelectSection: props.onSelectSection,
    onAddRoot: () => void addRoot(),
    onOpenConfigToml: openConfigToml,
    refreshConfigSnapshot: props.controller.refreshConfigSnapshot,
    readGlobalAgentInstructions: () =>
      props.hostBridge.app.readGlobalAgentInstructions({
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    getAgentsSettings: () => props.controller.getAgentsSettings(),
    createAgent: (input) => props.controller.createAgent(input),
    updateAgent: (input) => props.controller.updateAgent(input),
    deleteAgent: (input) => props.controller.deleteAgent(input),
    readAgentConfig: (name) => props.controller.readAgentConfig(name),
    writeAgentConfig: (name, content) => props.controller.writeAgentConfig(name, content),
    writeGlobalAgentInstructions: (input) =>
      props.hostBridge.app.writeGlobalAgentInstructions({
        ...input,
        agentEnvironment: props.preferences.agentEnvironment,
      }),
    readProxySettings: (input) =>
      props.hostBridge.app.readProxySettings(input),
    writeProxySettings: (input) =>
      props.hostBridge.app.writeProxySettings(input),
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
