import {
  DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
  DEFAULT_COMPOSER_FULL_SANDBOX_MODE,
  DEFAULT_COMPOSER_PERMISSION_LEVEL,
  isComposerApprovalPolicy,
  isComposerPermissionLevel,
  type ComposerApprovalPolicy,
} from "../../composer/model/composerPermission";
import type {
  AgentEnvironment,
  EmbeddedTerminalShell,
  WorkspaceOpener,
} from "../../../bridge/types";
import type { FollowUpMode, ComposerEnterBehavior } from "../../../domain/timeline";
import { DEFAULT_THEME_MODE, isThemeMode } from "../../../domain/theme";
import type { UiLanguage } from "../../../i18n";
import type { SandboxMode } from "../../../protocol/generated/v2/SandboxMode";
import {
  clampCodeFontSize,
  clampUiFontSize,
  CODE_FONT_SIZE_DEFAULT,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  normalizeCodeFontFamily,
  normalizeUiFontFamily,
  UI_FONT_SIZE_DEFAULT,
} from "../model/fontPreferences";
import type { AppPreferences, ThreadDetailLevel } from "./useAppPreferences";

export const APP_PREFERENCES_STORAGE_KEY = "codex-app-plus.app-preferences";
export const DEFAULT_GIT_BRANCH_PREFIX = "codex/";

const AGENT_ENVIRONMENTS: ReadonlyArray<AgentEnvironment> = [
  "windowsNative",
  "wsl",
];
const WORKSPACE_OPENERS: ReadonlyArray<WorkspaceOpener> = [
  "vscode",
  "visualStudio",
  "githubDesktop",
  "explorer",
  "terminal",
  "gitBash",
];
const EMBEDDED_TERMINAL_SHELLS: ReadonlyArray<EmbeddedTerminalShell> = [
  "powerShell",
  "commandPrompt",
  "gitBash",
];
const UI_LANGUAGES: ReadonlyArray<UiLanguage> = ["auto", "zh-CN", "en-US"];
const THREAD_DETAIL_LEVELS: ReadonlyArray<ThreadDetailLevel> = [
  "compact",
  "commands",
  "full",
];
const FOLLOW_UP_QUEUE_MODES: ReadonlyArray<FollowUpMode> = [
  "queue",
  "steer",
  "interrupt",
];
const COMPOSER_ENTER_BEHAVIORS: ReadonlyArray<ComposerEnterBehavior> = [
  "enter",
  "cmdIfMultiline",
];
const SANDBOX_MODES: ReadonlyArray<SandboxMode> = [
  "read-only",
  "workspace-write",
  "danger-full-access",
];

type LegacyComposerAccessMode = "read-only" | "current" | "full-access";

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  agentEnvironment: "windowsNative",
  workspaceOpener: "vscode",
  embeddedTerminalShell: "powerShell",
  embeddedTerminalUtf8: true,
  themeMode: DEFAULT_THEME_MODE,
  uiLanguage: "auto",
  threadDetailLevel: "commands",
  followUpQueueMode: "queue",
  composerEnterBehavior: "enter",
  composerPermissionLevel: DEFAULT_COMPOSER_PERMISSION_LEVEL,
  composerDefaultApprovalPolicy: DEFAULT_COMPOSER_DEFAULT_APPROVAL_POLICY,
  composerDefaultSandboxMode: DEFAULT_COMPOSER_DEFAULT_SANDBOX_MODE,
  composerFullApprovalPolicy: DEFAULT_COMPOSER_FULL_APPROVAL_POLICY,
  composerFullSandboxMode: DEFAULT_COMPOSER_FULL_SANDBOX_MODE,
  uiFontFamily: DEFAULT_UI_FONT_FAMILY,
  uiFontSize: UI_FONT_SIZE_DEFAULT,
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: CODE_FONT_SIZE_DEFAULT,
  gitBranchPrefix: DEFAULT_GIT_BRANCH_PREFIX,
  gitPushForceWithLease: false,
};

function isPreferenceValue<T extends string>(
  allowedValues: ReadonlyArray<T>,
  value: unknown,
): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}

function sanitizeGitBranchPrefix(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_APP_PREFERENCES.gitBranchPrefix;
  }
  return value.trim();
}

function readStoredUiLanguage(record: Record<string, unknown>): UiLanguage {
  if (record.uiLanguage === "auto") {
    return "auto";
  }
  if (
    record.uiLanguageExplicit === true &&
    isPreferenceValue(UI_LANGUAGES, record.uiLanguage)
  ) {
    return record.uiLanguage;
  }
  if (record.uiLanguage === "en-US") {
    return "en-US";
  }
  return DEFAULT_APP_PREFERENCES.uiLanguage;
}

function isLegacyComposerAccessMode(
  value: unknown,
): value is LegacyComposerAccessMode {
  return (
    value === "read-only" || value === "current" || value === "full-access"
  );
}

function migrateLegacyComposerAccessMode(
  mode: LegacyComposerAccessMode | null,
  fallbackPolicy: ComposerApprovalPolicy,
  fallbackSandboxMode: SandboxMode,
): { readonly approvalPolicy: ComposerApprovalPolicy; readonly sandboxMode: SandboxMode } {
  if (mode === "read-only") {
    return { approvalPolicy: "on-request", sandboxMode: "read-only" };
  }
  if (mode === "current") {
    return { approvalPolicy: "on-request", sandboxMode: "workspace-write" };
  }
  if (mode === "full-access") {
    return { approvalPolicy: "never", sandboxMode: "danger-full-access" };
  }
  return { approvalPolicy: fallbackPolicy, sandboxMode: fallbackSandboxMode };
}

function readStoredComposerPermissionSettings(
  record: Record<string, unknown>,
): Pick<
  AppPreferences,
  | "composerDefaultApprovalPolicy"
  | "composerDefaultSandboxMode"
  | "composerFullApprovalPolicy"
  | "composerFullSandboxMode"
> {
  const defaultFallback = migrateLegacyComposerAccessMode(
    isLegacyComposerAccessMode(record.composerDefaultAccessMode)
      ? record.composerDefaultAccessMode
      : null,
    DEFAULT_APP_PREFERENCES.composerDefaultApprovalPolicy,
    DEFAULT_APP_PREFERENCES.composerDefaultSandboxMode,
  );
  const fullFallback = migrateLegacyComposerAccessMode(
    isLegacyComposerAccessMode(record.composerFullAccessMode)
      ? record.composerFullAccessMode
      : null,
    DEFAULT_APP_PREFERENCES.composerFullApprovalPolicy,
    DEFAULT_APP_PREFERENCES.composerFullSandboxMode,
  );
  return {
    composerDefaultApprovalPolicy: isComposerApprovalPolicy(
      record.composerDefaultApprovalPolicy,
    )
      ? record.composerDefaultApprovalPolicy
      : defaultFallback.approvalPolicy,
    composerDefaultSandboxMode: isPreferenceValue(
      SANDBOX_MODES,
      record.composerDefaultSandboxMode,
    )
      ? record.composerDefaultSandboxMode
      : defaultFallback.sandboxMode,
    composerFullApprovalPolicy: isComposerApprovalPolicy(
      record.composerFullApprovalPolicy,
    )
      ? record.composerFullApprovalPolicy
      : fullFallback.approvalPolicy,
    composerFullSandboxMode: isPreferenceValue(
      SANDBOX_MODES,
      record.composerFullSandboxMode,
    )
      ? record.composerFullSandboxMode
      : fullFallback.sandboxMode,
  };
}

function sanitizeStoredPreferences(value: unknown): AppPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_APP_PREFERENCES;
  }
  const record = value as Record<string, unknown>;
  return {
    agentEnvironment: isPreferenceValue(
      AGENT_ENVIRONMENTS,
      record.agentEnvironment,
    )
      ? record.agentEnvironment
      : DEFAULT_APP_PREFERENCES.agentEnvironment,
    workspaceOpener: isPreferenceValue(WORKSPACE_OPENERS, record.workspaceOpener)
      ? record.workspaceOpener
      : DEFAULT_APP_PREFERENCES.workspaceOpener,
    embeddedTerminalShell: isPreferenceValue(
      EMBEDDED_TERMINAL_SHELLS,
      record.embeddedTerminalShell,
    )
      ? record.embeddedTerminalShell
      : DEFAULT_APP_PREFERENCES.embeddedTerminalShell,
    embeddedTerminalUtf8:
      typeof record.embeddedTerminalUtf8 === "boolean"
        ? record.embeddedTerminalUtf8
        : DEFAULT_APP_PREFERENCES.embeddedTerminalUtf8,
    themeMode: isThemeMode(record.themeMode)
      ? record.themeMode
      : DEFAULT_APP_PREFERENCES.themeMode,
    uiLanguage: readStoredUiLanguage(record),
    threadDetailLevel: isPreferenceValue(
      THREAD_DETAIL_LEVELS,
      record.threadDetailLevel,
    )
      ? record.threadDetailLevel
      : DEFAULT_APP_PREFERENCES.threadDetailLevel,
    followUpQueueMode: isPreferenceValue(
      FOLLOW_UP_QUEUE_MODES,
      record.followUpQueueMode,
    )
      ? record.followUpQueueMode
      : DEFAULT_APP_PREFERENCES.followUpQueueMode,
    composerEnterBehavior: isPreferenceValue(
      COMPOSER_ENTER_BEHAVIORS,
      record.composerEnterBehavior,
    )
      ? record.composerEnterBehavior
      : DEFAULT_APP_PREFERENCES.composerEnterBehavior,
    composerPermissionLevel: isComposerPermissionLevel(
      record.composerPermissionLevel,
    )
      ? record.composerPermissionLevel
      : DEFAULT_APP_PREFERENCES.composerPermissionLevel,
    ...readStoredComposerPermissionSettings(record),
    uiFontFamily: normalizeUiFontFamily(record.uiFontFamily),
    uiFontSize:
      typeof record.uiFontSize === "number"
        ? clampUiFontSize(record.uiFontSize)
        : DEFAULT_APP_PREFERENCES.uiFontSize,
    codeFontFamily: normalizeCodeFontFamily(record.codeFontFamily),
    codeFontSize:
      typeof record.codeFontSize === "number"
        ? clampCodeFontSize(record.codeFontSize)
        : DEFAULT_APP_PREFERENCES.codeFontSize,
    gitBranchPrefix: sanitizeGitBranchPrefix(record.gitBranchPrefix),
    gitPushForceWithLease:
      typeof record.gitPushForceWithLease === "boolean"
        ? record.gitPushForceWithLease
        : DEFAULT_APP_PREFERENCES.gitPushForceWithLease,
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
  return parseStoredPreferences(
    window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY),
  );
}

export function serializePreferences(
  preferences: AppPreferences,
): Record<string, unknown> {
  return {
    ...preferences,
    uiLanguageExplicit: preferences.uiLanguage !== "auto",
  };
}

export function normalizeGitBranchPrefix(value: unknown): string {
  return sanitizeGitBranchPrefix(value);
}
