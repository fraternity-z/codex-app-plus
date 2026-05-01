import { useCallback, useMemo, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import type { ResolvedTheme } from "../../domain/theme";
import type { AutomationsController } from "../../features/automation";
import { AppNotificationViewport } from "../../features/notifications";
import { type AppPreferencesController, type SettingsSection } from "../../features/settings";
import type { WorkspaceRootController } from "../../features/workspace";
import type { AppController } from "../controller/appControllerTypes";
import { WindowTitlebar } from "./WindowTitlebar";
import { renderScreen } from "./screenRenderer";

export type AppScreen = "home" | "skills" | "automation" | SettingsSection;

export interface AppScreenContentProps {
  readonly controller: AppController;
  readonly hostBridge: HostBridge;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly screen: AppScreen;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly settingsMenuOpen: boolean;
  readonly shouldShowAuthChoice: boolean;
  readonly workspace: WorkspaceRootController;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
  readonly automations: AutomationsController;
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
  readonly onBackHome: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenApiKeySettings: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSettingsSection: (section: SettingsSection) => void;
  readonly onOpenSkills: () => void;
  readonly onOpenSkillsLearnMore: () => Promise<void>;
  readonly onOpenAutomation: () => void;
  readonly onOpenAutomationLearnMore: () => Promise<void>;
  readonly onToggleSettingsMenu: () => void;
}

export function AppScreenContent(props: AppScreenContentProps): JSX.Element {
  const [homeSidebarCollapsed, setHomeSidebarCollapsed] = useState(false);
  const [settingsSidebarCollapsed, setSettingsSidebarCollapsed] = useState(false);
  const toggleHomeSidebarCollapsed = useCallback(() => {
    setHomeSidebarCollapsed((currentValue) => !currentValue);
  }, []);
  const toggleSettingsSidebarCollapsed = useCallback(() => {
    setSettingsSidebarCollapsed((currentValue) => !currentValue);
  }, []);
  const titlebarSidebarControl = useMemo(() => {
    if (props.shouldShowAuthChoice) {
      return null;
    }
    if (props.screen === "home" || props.screen === "skills" || props.screen === "automation") {
      return {
        collapsed: homeSidebarCollapsed,
        collapseLabel: "折叠工作区侧边栏",
        expandLabel: "展开工作区侧边栏",
        onToggle: toggleHomeSidebarCollapsed,
      };
    }
    return {
      collapsed: settingsSidebarCollapsed,
      collapseLabel: "折叠设置侧边栏",
      expandLabel: "展开设置侧边栏",
      onToggle: toggleSettingsSidebarCollapsed,
    };
  }, [
    homeSidebarCollapsed,
    props.screen,
    props.shouldShowAuthChoice,
    settingsSidebarCollapsed,
    toggleHomeSidebarCollapsed,
    toggleSettingsSidebarCollapsed,
  ]);

  return (
    <div className="app-shell">
      <WindowTitlebar
        hostBridge={props.hostBridge}
        navigationControl={{
          canGoBack: props.canGoBack,
          canGoForward: props.canGoForward,
          onGoBack: props.onGoBack,
          onGoForward: props.onGoForward,
        }}
        sidebarControl={titlebarSidebarControl}
      />
      <div className="app-shell-body">
        {renderScreen({
          ...props,
          homeSidebarCollapsed,
          settingsSidebarCollapsed,
        })}
      </div>
      <AppNotificationViewport hostBridge={props.hostBridge} />
    </div>
  );
}
