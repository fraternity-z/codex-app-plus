import { useCallback, useState } from "react";
import { useAppController } from "./app/useAppController";
import { useWorkspaceRoots } from "./app/useWorkspaceRoots";
import type { HostBridge } from "./bridge/types";
import { HomeView } from "./components/replica/HomeView";
import { SettingsView, type SettingsSection } from "./components/replica/SettingsView";
import { open } from "@tauri-apps/plugin-dialog";

interface AppProps {
  readonly hostBridge: HostBridge;
}

function inferNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

async function requestWorkspaceFolder(): Promise<{ readonly name: string; readonly path: string } | null> {
  const selection = await open({
    title: "选择项目文件夹",
    directory: true,
    multiple: false
  });
  if (selection === null) {
    return null;
  }
  if (Array.isArray(selection)) {
    throw new Error("选择项目文件夹不支持多选");
  }
  const path = selection.trim();
  if (path.length === 0) {
    return null;
  }
  return { name: inferNameFromPath(path), path };
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const controller = useAppController(hostBridge);
  const workspace = useWorkspaceRoots(controller.state.threads, controller.loadThreads);
  const [screen, setScreen] = useState<"home" | SettingsSection>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const openConfigToml = useCallback(async () => {
    try {
      await hostBridge.app.openCodexConfigToml();
    } catch (error) {
      console.error("打开 config.toml 失败", error);
      window.alert(`打开 config.toml 失败：${String(error)}`);
    }
  }, [hostBridge.app]);

  const openSettings = useCallback(() => {
    setScreen("general");
    setSettingsMenuOpen(false);
  }, []);

  const addRoot = useCallback(async () => {
    const root = await requestWorkspaceFolder();
    if (root !== null) {
      workspace.addRoot(root);
    }
  }, [workspace]);

  if (screen !== "home") {
    return (
      <SettingsView
        section={screen}
        roots={workspace.roots}
        onBackHome={() => setScreen("home")}
        onSelectSection={setScreen}
        onAddRoot={addRoot}
        onOpenConfigToml={openConfigToml}
      />
    );
  }

  const selectedRootName =
    workspace.roots.find((root) => root.id === workspace.selectedRootId)?.name ?? "选择项目";

  return (
    <HomeView
      roots={workspace.roots}
      selectedRootId={workspace.selectedRootId}
      selectedRootName={selectedRootName}
      settingsMenuOpen={settingsMenuOpen}
      onToggleSettingsMenu={() => setSettingsMenuOpen((open) => !open)}
      onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
      onOpenSettings={openSettings}
      onSelectRoot={workspace.selectRoot}
      onAddRoot={addRoot}
    />
  );
}
