import { useCallback, useMemo, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import type { ResolvedTheme } from "../../domain/theme";
import { AuthChoiceView } from "../../features/auth/ui/AuthChoiceView";
import { HomeScreen } from "../../features/home/ui/HomeScreen";
import { AppNotificationViewport } from "../../features/notifications/ui/AppNotificationViewport";
import { type AppPreferencesController } from "../../features/settings/hooks/useAppPreferences";
import { SettingsScreen } from "../../features/settings/ui/SettingsScreen";
import type { SettingsSection } from "../../features/settings/ui/SettingsView";
import { SkillsScreen } from "../../features/skills/ui/SkillsScreen";
import type { WorkspaceRootController } from "../../features/workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../controller/appControllerTypes";
import { WindowTitlebar } from "./WindowTitlebar";

export type AppScreen = "home" | "skills" | SettingsSection;

interface AppScreenContentProps {
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
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
  readonly onBackHome: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenApiKeySettings: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenSettingsSection: (section: SettingsSection) => void;
  readonly onOpenSkills: () => void;
  readonly onOpenSkillsLearnMore: () => Promise<void>;
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
    if (props.screen === "home" || props.screen === "skills") {
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

function renderScreen(props: AppScreenContentProps & {
  readonly homeSidebarCollapsed: boolean;
  readonly settingsSidebarCollapsed: boolean;
}): JSX.Element {
  if (props.shouldShowAuthChoice) {
    return (
      <AuthChoiceView
        busy={props.authBusy}
        loginPending={props.authLoginPending}
        onLogin={props.controller.login}
        onUseApiKey={props.onOpenApiKeySettings}
      />
    );
  }
  const overlayScreen = renderOverlayScreen(props);
  return (
    <>
      <div style={{ display: overlayScreen === null ? "contents" : "none" }}>
        {renderHomeScreen(props)}
      </div>
      {overlayScreen}
    </>
  );
}

function renderOverlayScreen(props: AppScreenContentProps & {
  readonly homeSidebarCollapsed: boolean;
  readonly settingsSidebarCollapsed: boolean;
}): JSX.Element | null {
  if (props.screen === "skills") {
    return null;
  }
  if (props.screen === "home") {
    return null;
  }
  return (
    <SettingsScreen
      controller={props.controller}
      hostBridge={props.hostBridge}
      preferences={props.preferences}
      resolvedTheme={props.resolvedTheme}
      section={props.screen}
      sidebarCollapsed={props.settingsSidebarCollapsed}
      workspace={props.workspace}
      onBackHome={props.onBackHome}
      onSelectSection={props.onOpenSettingsSection}
    />
  );
}

function renderHomeScreen(props: AppScreenContentProps & {
  readonly homeSidebarCollapsed: boolean;
  readonly settingsSidebarCollapsed: boolean;
}): JSX.Element {
  return (
    <HomeScreen
      controller={props.controller}
      hostBridge={props.hostBridge}
      preferences={props.preferences}
      resolvedTheme={props.resolvedTheme}
      settingsMenuOpen={props.settingsMenuOpen}
      sidebarCollapsed={props.homeSidebarCollapsed}
      workspace={props.workspace}
      onDismissSettingsMenu={props.onDismissSettingsMenu}
      onOpenSettings={props.onOpenSettings}
      onOpenSettingsSection={props.onOpenSettingsSection}
      onOpenSkills={props.onOpenSkills}
      onToggleSettingsMenu={props.onToggleSettingsMenu}
      mainContentOverride={props.screen === "skills" ? (
        <SkillsScreen
          controller={props.controller}
          workspace={props.workspace}
          onBackHome={props.onBackHome}
          onOpenLearnMore={props.onOpenSkillsLearnMore}
          onOpenMcpSettings={() => props.onOpenSettingsSection("mcp")}
        />
      ) : null}
    />
  );
}
