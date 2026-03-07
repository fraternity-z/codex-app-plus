import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { useAppController } from "./app/useAppController";
import { useAppPreferences } from "./app/useAppPreferences";
import { useComposerPicker } from "./app/useComposerPicker";
import { useWorkspaceConversation } from "./app/useWorkspaceConversation";
import { useWorkspaceRoots } from "./app/useWorkspaceRoots";
import { inferWorkspaceNameFromPath } from "./app/workspacePath";
import type { HostBridge } from "./bridge/types";
import { HomeView } from "./components/replica/HomeView";
import { SettingsView, type SettingsSection } from "./components/replica/SettingsView";

interface AppProps {
  readonly hostBridge: HostBridge;
}

async function requestWorkspaceFolder(): Promise<{ readonly name: string; readonly path: string } | null> {
  const selection = await open({ title: "选择工作区文件夹", directory: true, multiple: false });
  if (selection === null) {
    return null;
  }
  if (Array.isArray(selection)) {
    throw new Error("当前只支持选择一个工作区文件夹。");
  }
  const path = selection.trim();
  return path.length === 0 ? null : { name: inferWorkspaceNameFromPath(path), path };
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const controller = useAppController(hostBridge);
  const preferences = useAppPreferences();
  const composerPicker = useComposerPicker(hostBridge, controller.state.configSnapshot, controller.state.initialized);
  const workspace = useWorkspaceRoots();
  const [screen, setScreen] = useState<"home" | SettingsSection>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const selectedRoot = workspace.roots.find((root) => root.id === workspace.selectedRootId) ?? null;
  const selectedRootName = selectedRoot?.name ?? "选择工作区";
  const selectedRootPath = selectedRoot?.path ?? null;

  const conversation = useWorkspaceConversation({
    hostBridge,
    selectedRootPath,
    collaborationModes: controller.state.collaborationModes,
    followUpQueueMode: preferences.followUpQueueMode,
  });

  const openConfigToml = useCallback(async () => {
    try {
      await hostBridge.app.openCodexConfigToml();
    } catch (error) {
      console.error("打开 config.toml 失败", error);
      window.alert(`打开 config.toml 失败: ${String(error)}`);
    }
  }, [hostBridge.app]);

  const readGlobalAgentInstructions = useCallback(
    () => hostBridge.app.readGlobalAgentInstructions(),
    [hostBridge.app]
  );

  const writeGlobalAgentInstructions = useCallback(
    (input: Parameters<typeof hostBridge.app.writeGlobalAgentInstructions>[0]) =>
      hostBridge.app.writeGlobalAgentInstructions(input),
    [hostBridge.app]
  );

  const openSettings = useCallback(() => {
    setScreen("general");
    setSettingsMenuOpen(false);
  }, []);

  const addRoot = useCallback(async () => {
    try {
      const root = await requestWorkspaceFolder();
      if (root !== null) {
        workspace.addRoot(root);
      }
    } catch (error) {
      console.error("选择工作区文件夹失败", error);
      window.alert(`选择工作区文件夹失败: ${String(error)}`);
    }
  }, [workspace]);

  const createWorkspaceThread = useCallback(async () => {
    try {
      await conversation.createThread();
    } catch (error) {
      console.error("创建工作区会话失败", error);
      window.alert(`创建工作区会话失败: ${String(error)}`);
    }
  }, [conversation]);

  const sendWorkspaceTurn = useCallback(
    async (sendOptions: Parameters<typeof conversation.sendTurn>[0]) => {
      try {
        await conversation.sendTurn(sendOptions);
      } catch (error) {
        console.error("发送工作区消息失败", error);
        window.alert(`发送工作区消息失败: ${String(error)}`);
      }
    },
    [conversation]
  );

  const rateLimitSummary = controller.state.rateLimits === null
    ? null
    : `Rate limit: ${controller.state.rateLimits.limitName ?? controller.state.rateLimits.limitId ?? "default"}`;

  if (screen !== "home") {
    return (
      <SettingsView
        section={screen}
        roots={workspace.roots}
        preferences={preferences}
        configSnapshot={controller.state.configSnapshot}
        busy={controller.state.bootstrapBusy}
        onBackHome={() => setScreen("home")}
        onSelectSection={setScreen}
        onAddRoot={addRoot}
        onOpenConfigToml={openConfigToml}
        readGlobalAgentInstructions={readGlobalAgentInstructions}
        writeGlobalAgentInstructions={writeGlobalAgentInstructions}
        refreshMcpData={controller.refreshMcpData}
        writeConfigValue={controller.writeConfigValue}
        batchWriteConfig={controller.batchWriteConfig}
      />
    );
  }

  return (
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
      activities={conversation.activities}
      mcpShortcuts={controller.state.mcpShortcuts}
      banners={controller.state.banners}
      account={controller.state.account}
      rateLimitSummary={rateLimitSummary}
      queuedFollowUps={conversation.queuedFollowUps}
      draftActive={conversation.draftActive}
      selectedConversationLoading={conversation.selectedConversationLoading}
      models={composerPicker.models}
      defaultModel={composerPicker.defaultModel}
      defaultEffort={composerPicker.defaultEffort}
      workspaceOpener={preferences.workspaceOpener}
      embeddedTerminalShell={preferences.embeddedTerminalShell}
      followUpQueueMode={preferences.followUpQueueMode}
      composerEnterBehavior={preferences.composerEnterBehavior}
      connectionStatus={controller.state.connectionStatus}
      fatalError={controller.state.fatalError}
      authStatus={controller.state.authStatus}
      authMode={controller.state.authMode}
      retryScheduledAt={controller.state.retryScheduledAt}
      settingsMenuOpen={settingsMenuOpen}
      onToggleSettingsMenu={() => setSettingsMenuOpen((openValue) => !openValue)}
      onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
      onOpenSettings={openSettings}
      onSelectWorkspaceOpener={preferences.setWorkspaceOpener}
      onSelectRoot={workspace.selectRoot}
      onSelectThread={conversation.selectThread}
      onInputChange={controller.setInput}
      onCreateThread={createWorkspaceThread}
      onSendTurn={sendWorkspaceTurn}
      onAddRoot={addRoot}
      onRemoveRoot={workspace.removeRoot}
      onRetryConnection={controller.retryConnection}
      onLogin={controller.login}
      onResolveServerRequest={controller.resolveServerRequest}
      onRemoveQueuedFollowUp={conversation.removeQueuedFollowUp}
      onClearQueuedFollowUps={conversation.clearQueuedFollowUps}
    />
  );
}
