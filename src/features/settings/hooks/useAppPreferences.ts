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
  readonly embeddedTerminalUtf8: boolean;
  readonly uiLanguage: UiLanguage;
  readonly threadDetailLevel: ThreadDetailLevel;
  readonly followUpQueueMode: FollowUpMode;
  readonly composerEnterBehavior: ComposerEnterBehavior;
  readonly composerPermissionLevel: ComposerPermissionLevel;
  readonly gitBranchPrefix: string;
  readonly gitPushForceWithLease: boolean;
}

export interface AppPreferencesController extends AppPreferences {
  setAgentEnvironment: (agentEnvironment: AgentEnvironment) => void;
  setWorkspaceOpener: (workspaceOpener: WorkspaceOpener) => void;
  setEmbeddedTerminalShell: (shell: EmbeddedTerminalShell) => void;
  setEmbeddedTerminalUtf8: (enabled: boolean) => void;
  setUiLanguage: (language: UiLanguage) => void;
  setThreadDetailLevel: (detailLevel: ThreadDetailLevel) => void;
  setFollowUpQueueMode: (mode: FollowUpMode) => void;
  setComposerEnterBehavior: (behavior: ComposerEnterBehavior) => void;
  setComposerPermissionLevel: (level: ComposerPermissionLevel) => void;
  setGitBranchPrefix: (prefix: string) => void;
  setGitPushForceWithLease: (enabled: boolean) => void;
}

export const APP_PREFERENCES_STORAGE_KEY = "codex-app-plus.app-preferences";
export const DEFAULT_GIT_BRANCH_PREFIX = "codex/";

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
  embeddedTerminalUtf8: true,
  uiLanguage: "zh-CN",
  threadDetailLevel: "commands",
  followUpQueueMode: "queue",
  composerEnterBehavior: "enter",
  composerPermissionLevel: DEFAULT_COMPOSER_PERMISSION_LEVEL,
  gitBranchPrefix: DEFAULT_GIT_BRANCH_PREFIX,
  gitPushForceWithLease: false
};

function isPreferenceValue<T extends string>(allowedValues: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function sanitizeGitBranchPrefix(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_APP_PREFERENCES.gitBranchPrefix;
  }
  return value.trim();
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
    embeddedTerminalUtf8: typeof record.embeddedTerminalUtf8 === "boolean"
      ? record.embeddedTerminalUtf8
      : DEFAULT_APP_PREFERENCES.embeddedTerminalUtf8,
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
      : DEFAULT_APP_PREFERENCES.composerPermissionLevel,
    gitBranchPrefix: sanitizeGitBranchPrefix(record.gitBranchPrefix),
    gitPushForceWithLease: typeof record.gitPushForceWithLease === "boolean"
      ? record.gitPushForceWithLease
      : DEFAULT_APP_PREFERENCES.gitPushForceWithLease
  };
}

function parseStoredPreferences(rawValue: string | null): AppPreferences {
  if (rawValue === null) {
    return DEFAULT_APP_PREFERENCES;
  }
  try {
    return sanitizeStoredPreferences(JSON.parse(rawValue) as unknown);
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function readStoredAppPreferences(): AppPreferences {
  return parseStoredPreferences(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY));
}

function updatePreferences(
  current: AppPreferences,
  nextValue: Partial<AppPreferences>
): AppPreferences {
  return { ...current, ...nextValue };
}

export function useAppPreferences(): AppPreferencesController {
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    readStoredAppPreferences()
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

  const setEmbeddedTerminalUtf8 = useCallback((embeddedTerminalUtf8: boolean) => {
    setPreferences((current) => updatePreferences(current, { embeddedTerminalUtf8 }));
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

  const setGitBranchPrefix = useCallback((gitBranchPrefix: string) => {
    setPreferences((current) => updatePreferences(current, {
      gitBranchPrefix: sanitizeGitBranchPrefix(gitBranchPrefix)
    }));
  }, []);

  const setGitPushForceWithLease = useCallback((gitPushForceWithLease: boolean) => {
    setPreferences((current) => updatePreferences(current, { gitPushForceWithLease }));
  }, []);

  return useMemo(
    () => ({
      ...preferences,
      setAgentEnvironment,
      setWorkspaceOpener,
      setEmbeddedTerminalShell,
      setEmbeddedTerminalUtf8,
      setUiLanguage,
      setThreadDetailLevel,
      setFollowUpQueueMode,
      setComposerEnterBehavior,
      setComposerPermissionLevel,
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
      setGitBranchPrefix,
      setGitPushForceWithLease,
      setThreadDetailLevel,
      setUiLanguage,
      setWorkspaceOpener
    ]
  );
}
