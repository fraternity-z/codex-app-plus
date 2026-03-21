import { useCallback, useState } from "react";
import type { HostBridge } from "../bridge/types";
import { useAppBootstrapState } from "./controller/appControllerState";
import { useAppController } from "./controller/useAppController";
import { AppScreenContent, type AppScreen } from "./ui/AppScreenContent";
import { useDismissStartupScreen } from "./startupScreen";
import { useResolvedTheme } from "./useResolvedTheme";
import { useWindowTheme } from "./useWindowTheme";
import { useAppFontVariables } from "./useAppFontVariables";
import { I18nProvider } from "../i18n";
import { useAppPreferences } from "../features/settings/hooks/useAppPreferences";
import type { SettingsSection } from "../features/settings/ui/SettingsView";
import { useWorkspaceRoots } from "../features/workspace/hooks/useWorkspaceRoots";

const SKILLS_LEARN_MORE_URL = "https://openai.com/index/introducing-the-codex-app/";

interface AppProps {
  readonly hostBridge: HostBridge;
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const preferences = useAppPreferences();
  const resolvedTheme = useResolvedTheme(preferences.themeMode);
  const bootstrapState = useAppBootstrapState();
  const controller = useAppController(hostBridge, preferences.agentEnvironment);
  const workspace = useWorkspaceRoots();
  const [screen, setScreen] = useState<AppScreen>("home");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const authBusy = bootstrapState.bootstrapBusy || bootstrapState.authLoginPending;
  const shouldShowAuthChoice = bootstrapState.authStatus === "needs_login" && screen === "home";

  useAppFontVariables(preferences);
  useWindowTheme(hostBridge, resolvedTheme);
  useDismissStartupScreen(
    bootstrapState.fatalError !== null || (bootstrapState.initialized && !bootstrapState.bootstrapBusy),
  );

  const backHome = useCallback(() => {
    setScreen("home");
    setSettingsMenuOpen(false);
  }, []);
  const openSettingsSection = useCallback((section: SettingsSection) => {
    setScreen(section);
    setSettingsMenuOpen(false);
  }, []);
  const openSettings = useCallback(() => {
    openSettingsSection("general");
  }, [openSettingsSection]);
  const openApiKeySettings = useCallback(() => {
    openSettingsSection("config");
  }, [openSettingsSection]);
  const openSkills = useCallback(() => {
    setScreen("skills");
    setSettingsMenuOpen(false);
  }, []);

  return (
    <I18nProvider language={preferences.uiLanguage} setLanguage={preferences.setUiLanguage}>
      <AppScreenContent
        controller={controller}
        hostBridge={hostBridge}
        preferences={preferences}
        resolvedTheme={resolvedTheme}
        screen={screen}
        settingsMenuOpen={settingsMenuOpen}
        shouldShowAuthChoice={shouldShowAuthChoice}
        workspace={workspace}
        authBusy={authBusy}
        authLoginPending={bootstrapState.authLoginPending}
        onBackHome={backHome}
        onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
        onOpenApiKeySettings={openApiKeySettings}
        onOpenSettings={openSettings}
        onOpenSettingsSection={openSettingsSection}
        onOpenSkills={openSkills}
        onOpenSkillsLearnMore={() => hostBridge.app.openExternal(SKILLS_LEARN_MORE_URL)}
        onToggleSettingsMenu={() => setSettingsMenuOpen((openValue) => !openValue)}
      />
    </I18nProvider>
  );
}
