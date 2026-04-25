import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  type ComposerApprovalPolicy,
  type ComposerPermissionLevel,
} from "../../composer/model/composerPermission";
import type {
  AgentEnvironment,
  EmbeddedTerminalShell,
  WorkspaceOpener,
} from "../../../bridge/types";
import type { ComposerEnterBehavior, FollowUpMode } from "../../../domain/timeline";
import type { ThemeMode } from "../../../domain/theme";
import type { UiLanguage } from "../../../i18n";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import type { CodeStyleId } from "../model/codeStyleCatalog";
import {
  type AppearanceColorScheme,
  type AppearanceTheme,
  type AppearanceThemeColors,
  updateAppearanceColorScheme,
} from "../model/appearanceColorScheme";
import {
  clampContrast,
} from "../model/appearancePreferences";
import {
  clampCodeFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeUiFontFamily,
} from "../model/fontPreferences";
import {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_GIT_BRANCH_PREFIX,
  normalizeGitBranchPrefix,
  readStoredAppPreferences,
  serializePreferences,
} from "./appPreferenceStorage";
import { writeStoredJson } from "../../shared/utils/storageJson";
export type ThreadDetailLevel = "compact" | "commands" | "full";
export type NotificationDeliveryMode = "system+sound" | "system" | "sound";
export type NotificationTriggerMode = "never" | "unfocused" | "always";

export interface AppPreferences {
  readonly agentEnvironment: AgentEnvironment;
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
  readonly embeddedTerminalUtf8: boolean;
  readonly notificationDeliveryMode: NotificationDeliveryMode;
  readonly notificationTriggerMode: NotificationTriggerMode;
  readonly subagentNotificationsEnabled: boolean;
  readonly themeMode: ThemeMode;
  readonly uiLanguage: UiLanguage;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
  readonly composerDefaultApprovalPolicy: ComposerApprovalPolicy;
  readonly composerDefaultSandboxMode: SandboxMode;
  readonly composerFullApprovalPolicy: ComposerApprovalPolicy;
  readonly composerFullSandboxMode: SandboxMode;
  readonly uiFontFamily: string;
  readonly uiFontSize: number;
  readonly codeFontFamily: string;
  readonly codeFontSize: number;
  readonly gitBranchPrefix: string;
  readonly gitPushForceWithLease: boolean;
  readonly gitCommitInstructions: string;
  readonly contrast: number;
  readonly appearanceColors: AppearanceColorScheme;
  readonly codeStyle: CodeStyleId;
}

export interface AppPreferencesController extends AppPreferences {
  setAgentEnvironment: (agentEnvironment: AgentEnvironment) => void;
  setWorkspaceOpener: (workspaceOpener: WorkspaceOpener) => void;
  setEmbeddedTerminalShell: (shell: EmbeddedTerminalShell) => void;
  setEmbeddedTerminalUtf8: (enabled: boolean) => void;
  setNotificationDeliveryMode: (mode: NotificationDeliveryMode) => void;
  setNotificationTriggerMode: (mode: NotificationTriggerMode) => void;
  setSubagentNotificationsEnabled: (enabled: boolean) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setUiLanguage: (language: UiLanguage) => void;
  setThreadDetailLevel: (detailLevel: ThreadDetailLevel) => void;
  setFollowUpQueueMode: (mode: FollowUpMode) => void;
  setComposerEnterBehavior: (behavior: ComposerEnterBehavior) => void;
  setComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  setComposerDefaultApprovalPolicy: (policy: ComposerApprovalPolicy) => void;
  setComposerDefaultSandboxMode: (mode: SandboxMode) => void;
  setComposerFullApprovalPolicy: (policy: ComposerApprovalPolicy) => void;
  setComposerFullSandboxMode: (mode: SandboxMode) => void;
  setUiFontFamily: (fontFamily: string) => void;
  setUiFontSize: (fontSize: number) => void;
  setCodeFontFamily: (fontFamily: string) => void;
  setCodeFontSize: (fontSize: number) => void;
  setGitBranchPrefix: (prefix: string) => void;
  setGitPushForceWithLease: (enabled: boolean) => void;
  setGitCommitInstructions: (instructions: string) => void;
  setContrast: (contrast: number) => void;
  setAppearanceThemeColors: (
    theme: AppearanceTheme,
    colors: Partial<AppearanceThemeColors>,
  ) => void;
  setCodeStyle: (style: CodeStyleId) => void;
}
type PreferencesStateSetter = Dispatch<SetStateAction<AppPreferences>>;

function updatePreferences(
  current: AppPreferences,
  nextValue: Partial<AppPreferences>
): AppPreferences {
  return { ...current, ...nextValue };
}

function usePreferenceSetter<K extends keyof AppPreferences>(
  setPreferences: PreferencesStateSetter,
  key: K,
  normalize?: (
    value: AppPreferences[K],
    current: AppPreferences[K],
  ) => AppPreferences[K],
): (value: AppPreferences[K]) => void {
  return useCallback((value: AppPreferences[K]) => {
    setPreferences((current) => {
      const nextValue = normalize ? normalize(value, current[key]) : value;
      return updatePreferences(
        current,
        { [key]: nextValue } as Pick<AppPreferences, K>,
      );
    });
  }, [key, normalize, setPreferences]);
}

export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    readStoredAppPreferences()
  );

  useEffect(() => {
    writeStoredJson(APP_PREFERENCES_STORAGE_KEY, preferences, serializePreferences);
  }, [preferences]);

  const setAgentEnvironment = usePreferenceSetter(setPreferences, "agentEnvironment");
  const setWorkspaceOpener = usePreferenceSetter(setPreferences, "workspaceOpener");
  const setEmbeddedTerminalShell = usePreferenceSetter(setPreferences, "embeddedTerminalShell");
  const setEmbeddedTerminalUtf8 = usePreferenceSetter(setPreferences, "embeddedTerminalUtf8");
  const setNotificationDeliveryMode = usePreferenceSetter(setPreferences, "notificationDeliveryMode");
  const setNotificationTriggerMode = usePreferenceSetter(setPreferences, "notificationTriggerMode");
  const setSubagentNotificationsEnabled = usePreferenceSetter(setPreferences, "subagentNotificationsEnabled");
  const setThemeMode = usePreferenceSetter(setPreferences, "themeMode");
  const setUiLanguage = usePreferenceSetter(setPreferences, "uiLanguage");
  const setThreadDetailLevel = usePreferenceSetter(setPreferences, "threadDetailLevel");
  const setFollowUpQueueMode = usePreferenceSetter(setPreferences, "followUpQueueMode");
  const setComposerEnterBehavior = usePreferenceSetter(setPreferences, "composerEnterBehavior");
  const setComposerPermissionLevel = usePreferenceSetter(setPreferences, "composerPermissionLevel");
  const setComposerDefaultApprovalPolicy = usePreferenceSetter(setPreferences, "composerDefaultApprovalPolicy");
  const setComposerDefaultSandboxMode = usePreferenceSetter(setPreferences, "composerDefaultSandboxMode");
  const setComposerFullApprovalPolicy = usePreferenceSetter(
    setPreferences,
    "composerFullApprovalPolicy",
    () => DEFAULT_APP_PREFERENCES.composerFullApprovalPolicy,
  );
  const setComposerFullSandboxMode = usePreferenceSetter(
    setPreferences,
    "composerFullSandboxMode",
    () => DEFAULT_APP_PREFERENCES.composerFullSandboxMode,
  );
  const setUiFontFamily = usePreferenceSetter(setPreferences, "uiFontFamily", normalizeUiFontFamily);
  const setUiFontSize = usePreferenceSetter(setPreferences, "uiFontSize", clampUiFontSize);
  const setCodeFontFamily = usePreferenceSetter(setPreferences, "codeFontFamily", normalizeCodeFontFamily);
  const setCodeFontSize = usePreferenceSetter(setPreferences, "codeFontSize", clampCodeFontSize);
  const setGitBranchPrefix = usePreferenceSetter(
    setPreferences,
    "gitBranchPrefix",
    (value) => normalizeGitBranchPrefix(value),
  );
  const setGitPushForceWithLease = usePreferenceSetter(setPreferences, "gitPushForceWithLease");
  const setGitCommitInstructions = usePreferenceSetter(setPreferences, "gitCommitInstructions");
  const setContrast = usePreferenceSetter(
    setPreferences,
    "contrast",
    (value) => clampContrast(value),
  );
  const setAppearanceThemeColors = useCallback(
    (theme: AppearanceTheme, colors: Partial<AppearanceThemeColors>) => {
      setPreferences((current) =>
        updatePreferences(current, {
          appearanceColors: updateAppearanceColorScheme(
            current.appearanceColors,
            theme,
            colors,
          ),
        }),
      );
    },
    [setPreferences],
  );
  const setCodeStyle = usePreferenceSetter(setPreferences, "codeStyle");

  return useMemo(
    () => ({
      ...preferences,
      setAgentEnvironment,
      setWorkspaceOpener,
      setEmbeddedTerminalShell,
      setEmbeddedTerminalUtf8,
      setNotificationDeliveryMode,
      setNotificationTriggerMode,
      setSubagentNotificationsEnabled,
      setThemeMode,
      setUiLanguage,
      setThreadDetailLevel,
      setFollowUpQueueMode,
      setComposerEnterBehavior,
      setComposerPermissionLevel,
      setComposerDefaultApprovalPolicy,
      setComposerDefaultSandboxMode,
      setComposerFullApprovalPolicy,
      setComposerFullSandboxMode,
      setUiFontFamily,
      setUiFontSize,
      setCodeFontFamily,
      setCodeFontSize,
      setGitBranchPrefix,
      setGitPushForceWithLease,
      setGitCommitInstructions,
      setContrast,
      setAppearanceThemeColors,
      setCodeStyle,
    }),
    [
      preferences,
      setAgentEnvironment,
      setComposerEnterBehavior,
      setComposerPermissionLevel,
      setEmbeddedTerminalShell,
      setEmbeddedTerminalUtf8,
      setNotificationDeliveryMode,
      setNotificationTriggerMode,
      setSubagentNotificationsEnabled,
      setFollowUpQueueMode,
      setComposerDefaultApprovalPolicy,
      setComposerDefaultSandboxMode,
      setComposerFullApprovalPolicy,
      setComposerFullSandboxMode,
      setUiFontFamily,
      setUiFontSize,
      setCodeFontFamily,
      setCodeFontSize,
      setGitBranchPrefix,
      setGitPushForceWithLease,
      setGitCommitInstructions,
      setThemeMode,
      setThreadDetailLevel,
      setUiLanguage,
      setWorkspaceOpener,
      setContrast,
      setAppearanceThemeColors,
      setCodeStyle,
    ]
  );
}

export {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_GIT_BRANCH_PREFIX,
  readStoredAppPreferences,
};
