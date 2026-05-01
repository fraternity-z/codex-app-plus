import type { AppScreenContentProps } from "./AppScreenContent";
import {
  AuthChoiceView,
} from "../../features/auth";
import { HomeScreen } from "../../features/home";
import { SettingsScreen, type SettingsSection } from "../../features/settings";
import { SkillsScreen } from "../../features/skills";

export type AppScreenRenderProps = AppScreenContentProps & {
  readonly homeSidebarCollapsed: boolean;
  readonly settingsSidebarCollapsed: boolean;
};

export function renderScreen(props: AppScreenRenderProps): JSX.Element {
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

function renderOverlayScreen(props: AppScreenRenderProps): JSX.Element | null {
  if (props.screen === "skills") {
    return null;
  }
  if (props.screen === "automation") {
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

function renderHomeScreen(props: AppScreenRenderProps): JSX.Element {
  return (
    <HomeScreen
      controller={props.controller}
      hostBridge={props.hostBridge}
      preferences={props.preferences}
      resolvedTheme={props.resolvedTheme}
      settingsMenuOpen={props.settingsMenuOpen}
      activeNavItem={props.screen === "skills" || props.screen === "automation" ? props.screen : null}
      sidebarCollapsed={props.homeSidebarCollapsed}
      workspace={props.workspace}
      automations={props.automations}
      onDismissSettingsMenu={props.onDismissSettingsMenu}
      onOpenSettings={props.onOpenSettings}
      onOpenSettingsSection={props.onOpenSettingsSection}
      onOpenSkills={props.onOpenSkills}
      onOpenAutomation={props.onOpenAutomation}
      onOpenAutomationLearnMore={props.onOpenAutomationLearnMore}
      onToggleSettingsMenu={props.onToggleSettingsMenu}
      mainContentOverride={renderMainContentOverride(props)}
    />
  );
}

function renderMainContentOverride(props: AppScreenRenderProps): JSX.Element | null {
  if (props.screen === "skills") {
    return (
      <SkillsScreen
        controller={props.controller}
        workspace={props.workspace}
        onBackHome={props.onBackHome}
        onOpenLearnMore={props.onOpenSkillsLearnMore}
        onOpenMcpSettings={() => props.onOpenSettingsSection("mcp")}
      />
    );
  }

  return null;
}

export type { SettingsSection };
