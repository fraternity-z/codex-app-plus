import { useCallback, useState } from "react";
import { useAppController } from "./app/useAppController";
import { useWorkspaceRoots } from "./app/useWorkspaceRoots";
import type { HostBridge } from "./bridge/types";
import { HomeView } from "./components/replica/HomeView";
import { SettingsView, type SettingsSection } from "./components/replica/SettingsView";

interface AppProps {
  readonly hostBridge: HostBridge;
}

interface WorkspacePromptResult {
  readonly name: string;
  readonly path: string;
}

function inferNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

function requestWorkspaceFolder(): WorkspacePromptResult | null {
  const input = window.prompt("输入项目文件夹路径（或项目名称）", "");
  if (input === null) {
    return null;
  }
  const path = input.trim();
  if (path.length === 0) {
    return null;
  }
  return {
    name: inferNameFromPath(path),
    path
  };
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const controller = useAppController(hostBridge);
  const workspace = useWorkspaceRoots(controller.state.threads, controller.loadThreads);
  const [screen, setScreen] = useState<"home" | SettingsSection>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const openSettings = useCallback(() => {
    setScreen("general");
    setSettingsMenuOpen(false);
  }, []);

  const addRoot = useCallback(() => {
    const root = requestWorkspaceFolder();
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
