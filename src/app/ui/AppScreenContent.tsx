import type { HostBridge } from "../../bridge/types";
import type { ResolvedTheme } from "../../domain/theme";
import { AuthChoiceView } from "../../features/auth/ui/AuthChoiceView";
import { HomeScreen } from "../../features/home/ui/HomeScreen";
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
  readonly settingsMenuOpen: boolean;
  readonly shouldShowAuthChoice: boolean;
  readonly workspace: WorkspaceRootController;
  readonly authBusy: boolean;
  readonly authLoginPending: boolean;
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
  return (
    <div className="app-shell">
      <WindowTitlebar hostBridge={props.hostBridge} />
      <div className="app-shell-body">{renderScreen(props)}</div>
    </div>
  );
}

function renderScreen(props: AppScreenContentProps): JSX.Element {
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

function renderOverlayScreen(props: AppScreenContentProps): JSX.Element | null {
  if (props.screen === "skills") {
    return (
      <SkillsScreen
        controller={props.controller}
        workspace={props.workspace}
        onBackHome={props.onBackHome}
        onOpenLearnMore={props.onOpenSkillsLearnMore}
      />
    );
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
      workspace={props.workspace}
      onBackHome={props.onBackHome}
      onSelectSection={props.onOpenSettingsSection}
    />
  );
}

function renderHomeScreen(props: AppScreenContentProps): JSX.Element {
  return (
    <HomeScreen
      controller={props.controller}
      hostBridge={props.hostBridge}
      preferences={props.preferences}
      resolvedTheme={props.resolvedTheme}
      settingsMenuOpen={props.settingsMenuOpen}
      workspace={props.workspace}
      onDismissSettingsMenu={props.onDismissSettingsMenu}
      onOpenSettings={props.onOpenSettings}
      onOpenSettingsSection={props.onOpenSettingsSection}
      onOpenSkills={props.onOpenSkills}
      onToggleSettingsMenu={props.onToggleSettingsMenu}
    />
  );
}
