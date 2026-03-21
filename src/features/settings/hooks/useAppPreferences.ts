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
import {
  clampCodeFontSize,
  clampTerminalFontSize,
  clampUiFontSize,
  normalizeCodeFontFamily,
  normalizeTerminalFontFamily,
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
export type ThreadDetailLevel = "compact" | "commands" | "full";

export interface AppPreferences {
  readonly agentEnvironment: AgentEnvironment;
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
  readonly embeddedTerminalUtf8: boolean;
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
  readonly terminalFontFamily: string;
  readonly terminalFontSize: number;
  readonly gitBranchPrefix: string;
  readonly gitPushForceWithLease: boolean;
}

export interface AppPreferencesController extends AppPreferences {
  setAgentEnvironment: (agentEnvironment: AgentEnvironment) => void;
  setWorkspaceOpener: (workspaceOpener: WorkspaceOpener) => void;
  setEmbeddedTerminalShell: (shell: EmbeddedTerminalShell) => void;
  setEmbeddedTerminalUtf8: (enabled: boolean) => void;
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
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalFontSize: (fontSize: number) => void;
  setGitBranchPrefix: (prefix: string) => void;
  setGitPushForceWithLease: (enabled: boolean) => void;
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
  normalize?: (value: AppPreferences[K]) => AppPreferences[K]
): (value: AppPreferences[K]) => void {
  return useCallback((value: AppPreferences[K]) => {
    const nextValue = normalize ? normalize(value) : value;
    setPreferences((current) => updatePreferences(current, { [key]: nextValue } as Pick<AppPreferences, K>));
  }, [key, normalize, setPreferences]);
}

export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    readStoredAppPreferences()
  );

  useEffect(() => {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(serializePreferences(preferences)));
  }, [preferences]);

  const setAgentEnvironment = usePreferenceSetter(setPreferences, "agentEnvironment");
  const setWorkspaceOpener = usePreferenceSetter(setPreferences, "workspaceOpener");
  const setEmbeddedTerminalShell = usePreferenceSetter(setPreferences, "embeddedTerminalShell");
  const setEmbeddedTerminalUtf8 = usePreferenceSetter(setPreferences, "embeddedTerminalUtf8");
  const setThemeMode = usePreferenceSetter(setPreferences, "themeMode");
  const setUiLanguage = usePreferenceSetter(setPreferences, "uiLanguage");
  const setThreadDetailLevel = usePreferenceSetter(setPreferences, "threadDetailLevel");
  const setFollowUpQueueMode = usePreferenceSetter(setPreferences, "followUpQueueMode");
  const setComposerEnterBehavior = usePreferenceSetter(setPreferences, "composerEnterBehavior");
  const setComposerPermissionLevel = usePreferenceSetter(setPreferences, "composerPermissionLevel");
  const setComposerDefaultApprovalPolicy = usePreferenceSetter(setPreferences, "composerDefaultApprovalPolicy");
  const setComposerDefaultSandboxMode = usePreferenceSetter(setPreferences, "composerDefaultSandboxMode");
  const setComposerFullApprovalPolicy = usePreferenceSetter(setPreferences, "composerFullApprovalPolicy");
  const setComposerFullSandboxMode = usePreferenceSetter(setPreferences, "composerFullSandboxMode");
  const setUiFontFamily = usePreferenceSetter(setPreferences, "uiFontFamily", normalizeUiFontFamily);
  const setUiFontSize = usePreferenceSetter(setPreferences, "uiFontSize", clampUiFontSize);
  const setCodeFontFamily = usePreferenceSetter(setPreferences, "codeFontFamily", normalizeCodeFontFamily);
  const setCodeFontSize = usePreferenceSetter(setPreferences, "codeFontSize", clampCodeFontSize);
  const setTerminalFontFamily = usePreferenceSetter(
    setPreferences,
    "terminalFontFamily",
    normalizeTerminalFontFamily,
  );
  const setTerminalFontSize = usePreferenceSetter(
    setPreferences,
    "terminalFontSize",
    clampTerminalFontSize,
  );
  const setGitBranchPrefix = usePreferenceSetter(
    setPreferences,
    "gitBranchPrefix",
    normalizeGitBranchPrefix,
  );
  const setGitPushForceWithLease = usePreferenceSetter(setPreferences, "gitPushForceWithLease");

  return useMemo(
    () => ({
      ...preferences,
      setAgentEnvironment,
      setWorkspaceOpener,
      setEmbeddedTerminalShell,
      setEmbeddedTerminalUtf8,
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
      setTerminalFontFamily,
      setTerminalFontSize,
      setGitBranchPrefix,
      setGitPushForceWithLease
    }),
    [
      preferences,
      setAgentEnvironment,
      setComposerEnterBehavior,
      setComposerPermissionLevel,
      setEmbeddedTerminalShell,
      setEmbeddedTerminalUtf8,
      setFollowUpQueueMode,
      setComposerDefaultApprovalPolicy,
      setComposerDefaultSandboxMode,
      setComposerFullApprovalPolicy,
      setComposerFullSandboxMode,
      setUiFontFamily,
      setUiFontSize,
      setCodeFontFamily,
      setCodeFontSize,
      setTerminalFontFamily,
      setTerminalFontSize,
      setGitBranchPrefix,
      setGitPushForceWithLease,
      setThemeMode,
      setThreadDetailLevel,
      setUiLanguage,
      setWorkspaceOpener
    ]
  );
}

export {
  APP_PREFERENCES_STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_GIT_BRANCH_PREFIX,
  readStoredAppPreferences,
};
