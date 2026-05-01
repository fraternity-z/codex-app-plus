import { useCallback, useMemo, useState } from "react";
import type { HostBridge } from "../../bridge/types";
import type { AppUpdateState } from "../../domain/types";
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
  readonly appUpdate: AppUpdateState;
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
        aboutControl={
          props.shouldShowAuthChoice
            ? null
            : {
                appUpdate: props.appUpdate,
                onCheckForUpdate: props.controller.checkForAppUpdate,
                onInstallUpdate: props.controller.installAppUpdate,
              }
        }
      />
      <div className="app-shell-body">
        {renderScreen({
          ...props,
          homeSidebarCollapsed,
          settingsSidebarCollapsed,
        })}
      </div>
      <AppNotificationViewport hostBridge={props.hostBridge} />
      <AppUpdateReadyPrompt
        appUpdate={props.appUpdate}
        onInstallUpdate={props.controller.installAppUpdate}
      />
    </div>
  );
}

interface AppUpdateReadyPromptProps {
  readonly appUpdate: AppUpdateState;
  readonly onInstallUpdate: () => Promise<void>;
}

function AppUpdateReadyPrompt(props: AppUpdateReadyPromptProps): JSX.Element | null {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const nextVersion = props.appUpdate.nextVersion;
  const isVisible =
    props.appUpdate.status === "downloaded" &&
    nextVersion !== null &&
    dismissedVersion !== nextVersion;

  const dismiss = useCallback(() => {
    if (nextVersion !== null) {
      setDismissedVersion(nextVersion);
    }
  }, [nextVersion]);

  const installUpdate = useCallback(() => {
    void props.onInstallUpdate();
  }, [props.onInstallUpdate]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="app-update-ready-backdrop"
      role="presentation"
      onClick={dismiss}
    >
      <section
        className="app-update-ready-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-ready-title"
        aria-describedby="app-update-ready-description"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-update-ready-header">
          <div>
            <strong id="app-update-ready-title">发现新版本</strong>
            <p id="app-update-ready-description">
              新版本 {nextVersion} 已下载完成，可以立即升级安装。
            </p>
          </div>
          <button
            type="button"
            className="app-update-ready-close"
            aria-label="稍后提醒"
            onClick={dismiss}
          >
            ×
          </button>
        </header>
        {props.appUpdate.currentVersion !== null ? (
          <p className="app-update-ready-version">
            当前版本：{props.appUpdate.currentVersion}
          </p>
        ) : null}
        <div className="app-update-ready-actions">
          <button
            type="button"
            className="app-update-ready-secondary"
            onClick={dismiss}
          >
            稍后
          </button>
          <button
            type="button"
            className="app-update-ready-primary"
            onClick={installUpdate}
          >
            升级安装
          </button>
        </div>
      </section>
    </div>
  );
}
