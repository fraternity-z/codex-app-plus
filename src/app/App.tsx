import { useCallback, useState } from "react";
import type { HostBridge } from "../bridge/types";
import { useAppBootstrapState } from "./controller/appControllerState";
import { useAppController } from "./controller/useAppController";
import { AppScreenContent } from "./ui/AppScreenContent";
import { useDismissStartupScreen } from "./startupScreen";
import { useAppCodeStyleVariables } from "./useAppCodeStyleVariables";
import { useAppAppearanceVariables } from "./useAppAppearanceVariables";
import { useResolvedTheme } from "./useResolvedTheme";
import { useWindowTheme } from "./useWindowTheme";
import { useAppFontVariables } from "./useAppFontVariables";
import { I18nProvider } from "../i18n";
import { useAppPreferences } from "../features/settings/hooks/useAppPreferences";
import { useAppNotificationsController } from "../features/notifications/hooks/useAppNotificationsController";
import type { SettingsSection } from "../features/settings/ui/SettingsView";
import { useWorkspaceRoots } from "../features/workspace/hooks/useWorkspaceRoots";
import { useAutomations } from "../features/automation/hooks/useAutomations";
import { useAppStoreApi } from "../state/store";
import {
  canGoBackScreen,
  canGoForwardScreen,
  createScreenHistoryState,
  goBackScreen,
  goForwardScreen,
  pushScreenHistory,
} from "./model/screenHistory";

const SKILLS_LEARN_MORE_URL = "https://openai.com/index/introducing-the-codex-app/";
const AUTOMATION_LEARN_MORE_URL = "https://openai.com/index/introducing-the-codex-app/";

interface AppProps {
  readonly hostBridge: HostBridge;
}

export function App({ hostBridge }: AppProps): JSX.Element {
  const store = useAppStoreApi();
  const preferences = useAppPreferences();
  const resolvedTheme = useResolvedTheme(preferences.themeMode);
  const bootstrapState = useAppBootstrapState();
  const controller = useAppController(hostBridge, preferences.agentEnvironment);
  const workspace = useWorkspaceRoots(hostBridge.app);
  const automations = useAutomations();
  const [screenHistory, setScreenHistory] = useState(() => createScreenHistoryState("home"));
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const screen = screenHistory.current;
  const authBusy = bootstrapState.bootstrapBusy || bootstrapState.authLoginPending;
  const shouldShowAuthChoice = bootstrapState.authStatus === "needs_login" && screen === "home";

  useAppFontVariables(preferences);
  useAppAppearanceVariables(preferences, resolvedTheme);
  useAppCodeStyleVariables(preferences, resolvedTheme);
  useWindowTheme(hostBridge, resolvedTheme);
  useAppNotificationsController({ app: hostBridge.app, store, preferences });
  useDismissStartupScreen(
    bootstrapState.fatalError !== null || (bootstrapState.initialized && !bootstrapState.bootstrapBusy),
  );

  const backHome = useCallback(() => {
    setScreenHistory((current) => pushScreenHistory(current, "home"));
    setSettingsMenuOpen(false);
  }, []);
  const openSettingsSection = useCallback((section: SettingsSection) => {
    setScreenHistory((current) => pushScreenHistory(current, section));
    setSettingsMenuOpen(false);
  }, []);
  const openSettings = useCallback(() => {
    openSettingsSection("general");
  }, [openSettingsSection]);
  const openApiKeySettings = useCallback(() => {
    openSettingsSection("config");
  }, [openSettingsSection]);
  const openSkills = useCallback(() => {
    setScreenHistory((current) => pushScreenHistory(current, "skills"));
    setSettingsMenuOpen(false);
  }, []);
  const openAutomation = useCallback(() => {
    setScreenHistory((current) => pushScreenHistory(current, "automation"));
    setSettingsMenuOpen(false);
  }, []);
  const goBack = useCallback(() => {
    setScreenHistory((current) => goBackScreen(current));
    setSettingsMenuOpen(false);
  }, []);
  const goForward = useCallback(() => {
    setScreenHistory((current) => goForwardScreen(current));
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
        canGoBack={canGoBackScreen(screenHistory)}
        canGoForward={canGoForwardScreen(screenHistory)}
        settingsMenuOpen={settingsMenuOpen}
        shouldShowAuthChoice={shouldShowAuthChoice}
        workspace={workspace}
        automations={automations}
        authBusy={authBusy}
        authLoginPending={bootstrapState.authLoginPending}
        onGoBack={goBack}
        onGoForward={goForward}
        onBackHome={backHome}
        onDismissSettingsMenu={() => setSettingsMenuOpen(false)}
        onOpenApiKeySettings={openApiKeySettings}
        onOpenSettings={openSettings}
        onOpenSettingsSection={openSettingsSection}
        onOpenSkills={openSkills}
        onOpenSkillsLearnMore={() => hostBridge.app.openExternal(SKILLS_LEARN_MORE_URL)}
        onOpenAutomation={openAutomation}
        onOpenAutomationLearnMore={() => hostBridge.app.openExternal(AUTOMATION_LEARN_MORE_URL)}
        onToggleSettingsMenu={() => setSettingsMenuOpen((openValue) => !openValue)}
      />
    </I18nProvider>
  );
}
