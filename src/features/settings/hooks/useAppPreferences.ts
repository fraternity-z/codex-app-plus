import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COMPOSER_PERMISSION_LEVEL,
  isComposerPermissionLevel,
  type ComposerPermissionLevel,
} from "../../composer/model/composerPermission";
import type { AgentEnvironment, EmbeddedTerminalShell, WorkspaceOpener } from "../../../bridge/types";
import type { ComposerEnterBehavior, FollowUpMode } from "../../../domain/timeline";

export type UiLanguage = "zh-CN" | "en-US";
export type ThreadDetailLevel = "compact" | "commands" | "full";

export interface AppPreferences {
  readonly agentEnvironment: AgentEnvironment;
  readonly workspaceOpener: WorkspaceOpener;
  readonly embeddedTerminalShell: EmbeddedTerminalShell;
  readonly uiLanguage: UiLanguage;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
}

export interface AppPreferencesController extends AppPreferences {
  setAgentEnvironment: (agentEnvironment: AgentEnvironment) => void;
  setWorkspaceOpener: (workspaceOpener: WorkspaceOpener) => void;
  setEmbeddedTerminalShell: (shell: EmbeddedTerminalShell) => void;
  setUiLanguage: (language: UiLanguage) => void;
  setThreadDetailLevel: (detailLevel: ThreadDetailLevel) => void;
  setFollowUpQueueMode: (mode: FollowUpMode) => void;
  setComposerEnterBehavior: (behavior: ComposerEnterBehavior) => void;
  setComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
}

export const APP_PREFERENCES_STORAGE_KEY = "codex-app-plus.app-preferences";

const AGENT_ENVIRONMENTS: ReadonlyArray<AgentEnvironment> = ["windowsNative", "wsl"];

const WORKSPACE_OPENERS: ReadonlyArray<WorkspaceOpener> = [
  "vscode",
  "visualStudio",
  "githubDesktop",
  "explorer",
  "terminal",
  "gitBash"
];

const EMBEDDED_TERMINAL_SHELLS: ReadonlyArray<EmbeddedTerminalShell> = [
  "powerShell",
  "commandPrompt",
  "gitBash"
];

const UI_LANGUAGES: ReadonlyArray<UiLanguage> = ["zh-CN", "en-US"];
const THREAD_DETAIL_LEVELS: ReadonlyArray<ThreadDetailLevel> = ["compact", "commands", "full"];
const FOLLOW_UP_QUEUE_MODES: ReadonlyArray<FollowUpMode> = ["queue", "steer", "interrupt"];
const COMPOSER_ENTER_BEHAVIORS: ReadonlyArray<ComposerEnterBehavior> = ["enter", "cmdIfMultiline"];

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  agentEnvironment: "windowsNative",
  workspaceOpener: "vscode",
  embeddedTerminalShell: "powerShell",
  uiLanguage: "zh-CN",
  threadDetailLevel: "commands",
  followUpQueueMode: "queue",
  composerEnterBehavior: "enter",
  composerPermissionLevel: DEFAULT_COMPOSER_PERMISSION_LEVEL
};

function isPreferenceValue<T extends string>(allowedValues: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function sanitizeStoredPreferences(value: unknown): AppPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_APP_PREFERENCES;
  }
  const record = value as Record<string, unknown>;
  return {
    agentEnvironment: isPreferenceValue(AGENT_ENVIRONMENTS, record.agentEnvironment)
      ? record.agentEnvironment
      : DEFAULT_APP_PREFERENCES.agentEnvironment,
    workspaceOpener: isPreferenceValue(WORKSPACE_OPENERS, record.workspaceOpener)
      ? record.workspaceOpener
      : DEFAULT_APP_PREFERENCES.workspaceOpener,
    embeddedTerminalShell: isPreferenceValue(EMBEDDED_TERMINAL_SHELLS, record.embeddedTerminalShell)
      ? record.embeddedTerminalShell
      : DEFAULT_APP_PREFERENCES.embeddedTerminalShell,
    uiLanguage: isPreferenceValue(UI_LANGUAGES, record.uiLanguage)
      ? record.uiLanguage
      : DEFAULT_APP_PREFERENCES.uiLanguage,
    threadDetailLevel: isPreferenceValue(THREAD_DETAIL_LEVELS, record.threadDetailLevel)
      ? record.threadDetailLevel
      : DEFAULT_APP_PREFERENCES.threadDetailLevel,
    followUpQueueMode: isPreferenceValue(FOLLOW_UP_QUEUE_MODES, record.followUpQueueMode)
      ? record.followUpQueueMode
      : DEFAULT_APP_PREFERENCES.followUpQueueMode,
    composerEnterBehavior: isPreferenceValue(COMPOSER_ENTER_BEHAVIORS, record.composerEnterBehavior)
      ? record.composerEnterBehavior
      : DEFAULT_APP_PREFERENCES.composerEnterBehavior,
    composerPermissionLevel: isComposerPermissionLevel(record.composerPermissionLevel)
      ? record.composerPermissionLevel
      : DEFAULT_APP_PREFERENCES.composerPermissionLevel
  };
}

function readStoredPreferences(rawValue: string | null): AppPreferences {
  if (rawValue === null) {
    return DEFAULT_APP_PREFERENCES;
  }
  try {
    return sanitizeStoredPreferences(JSON.parse(rawValue) as unknown);
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

function updatePreferences(
  current: AppPreferences,
  nextValue: Partial<AppPreferences>
): AppPreferences {
  return { ...current, ...nextValue };
}

export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    readStoredPreferences(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY))
  );

  useEffect(() => {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const setAgentEnvironment = useCallback((agentEnvironment: AgentEnvironment) => {
    setPreferences((current) => updatePreferences(current, { agentEnvironment }));
  }, []);

  const setWorkspaceOpener = useCallback((workspaceOpener: WorkspaceOpener) => {
    setPreferences((current) => updatePreferences(current, { workspaceOpener }));
  }, []);

  const setEmbeddedTerminalShell = useCallback((shell: EmbeddedTerminalShell) => {
    setPreferences((current) => updatePreferences(current, { embeddedTerminalShell: shell }));
  }, []);

  const setUiLanguage = useCallback((language: UiLanguage) => {
    setPreferences((current) => updatePreferences(current, { uiLanguage: language }));
  }, []);

  const setThreadDetailLevel = useCallback((detailLevel: ThreadDetailLevel) => {
    setPreferences((current) => updatePreferences(current, { threadDetailLevel: detailLevel }));
  }, []);

  const setFollowUpQueueMode = useCallback((followUpQueueMode: FollowUpMode) => {
    setPreferences((current) => updatePreferences(current, { followUpQueueMode }));
  }, []);

  const setComposerEnterBehavior = useCallback((composerEnterBehavior: ComposerEnterBehavior) => {
    setPreferences((current) => updatePreferences(current, { composerEnterBehavior }));
  }, []);

  const setComposerPermissionLevel = useCallback((composerPermissionLevel: ComposerPermissionLevel) => {
    setPreferences((current) => updatePreferences(current, { composerPermissionLevel }));
  }, []);

  return useMemo(
    () => ({
      ...preferences,
      setAgentEnvironment,
      setWorkspaceOpener,
      setEmbeddedTerminalShell,
      setUiLanguage,
      setThreadDetailLevel,
      setFollowUpQueueMode,
      setComposerEnterBehavior,
      setComposerPermissionLevel
    }),
    [
      preferences,
      setAgentEnvironment,
      setComposerEnterBehavior,
      setComposerPermissionLevel,
      setEmbeddedTerminalShell,
      setFollowUpQueueMode,
      setThreadDetailLevel,
      setUiLanguage,
      setWorkspaceOpener
    ]
  );
}
