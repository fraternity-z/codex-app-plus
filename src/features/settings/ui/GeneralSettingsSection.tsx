import type {
  AppPreferencesController,
  NotificationDeliveryMode,
  NotificationTriggerMode,
  ThreadDetailLevel,
} from "../hooks/useAppPreferences";
import type { AgentEnvironment, EmbeddedTerminalShell, WorkspaceOpener } from "../../../bridge/types";
import type { ComposerEnterBehavior, FollowUpMode } from "../../../domain/timeline";
import { createLanguageOptions, useI18n, type MessageKey } from "../../../i18n";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";
import { SettingsToggleButtonGroup } from "./SettingsToggleButtonGroup";

type Translator = (key: MessageKey) => string;

function createAgentEnvironmentOptions(t: Translator): ReadonlyArray<SettingsSelectOption<AgentEnvironment>> {
  return [
    { value: "windowsNative", label: t("settings.general.agentEnvironment.options.windowsNative") },
    { value: "wsl", label: t("settings.general.agentEnvironment.options.wsl") }
  ];
}

function createWorkspaceOpenerOptions(t: Translator): ReadonlyArray<SettingsSelectOption<WorkspaceOpener>> {
  return [
    { value: "vscode", label: t("settings.general.workspaceOpener.options.vscode") },
    { value: "visualStudio", label: t("settings.general.workspaceOpener.options.visualStudio") },
    { value: "githubDesktop", label: t("settings.general.workspaceOpener.options.githubDesktop") },
    { value: "explorer", label: t("settings.general.workspaceOpener.options.explorer") },
    { value: "terminal", label: t("settings.general.workspaceOpener.options.terminal") },
    { value: "gitBash", label: t("settings.general.workspaceOpener.options.gitBash") }
  ];
}

function createTerminalShellOptions(t: Translator): ReadonlyArray<SettingsSelectOption<EmbeddedTerminalShell>> {
  return [
    { value: "powerShell", label: t("settings.general.embeddedTerminalShell.options.powerShell") },
    { value: "commandPrompt", label: t("settings.general.embeddedTerminalShell.options.commandPrompt") },
    { value: "gitBash", label: t("settings.general.embeddedTerminalShell.options.gitBash") }
  ];
}

function createThreadDetailOptions(t: Translator): ReadonlyArray<SettingsSelectOption<ThreadDetailLevel>> {
  return [
    { value: "compact", label: t("settings.general.threadDetailLevel.options.compact") },
    { value: "commands", label: t("settings.general.threadDetailLevel.options.commands") },
    { value: "full", label: t("settings.general.threadDetailLevel.options.full") }
  ];
}

function createFollowUpModeOptions(
  t: Translator,
  steerAvailable: boolean,
): ReadonlyArray<SettingsSelectOption<FollowUpMode>> {
  return [
    { value: "queue", label: t("settings.general.followUpQueueMode.options.queue") },
    {
      value: "steer",
      label: t("settings.general.followUpQueueMode.options.steer"),
      disabled: !steerAvailable,
    },
  ];
}

function createComposerEnterOptions(t: Translator): ReadonlyArray<SettingsSelectOption<ComposerEnterBehavior>> {
  return [
    { value: "enter", label: t("settings.general.composerEnterBehavior.options.enter") },
    { value: "cmdIfMultiline", label: t("settings.general.composerEnterBehavior.options.cmdIfMultiline") }
  ];
}

function createNotificationDeliveryOptions(
  t: Translator,
): ReadonlyArray<{
  readonly value: NotificationDeliveryMode;
  readonly label: string;
}> {
  return [
    {
      value: "system+sound",
      label: t("settings.general.notifications.deliveryMode.options.systemAndSound"),
    },
    {
      value: "system",
      label: t("settings.general.notifications.deliveryMode.options.systemOnly"),
    },
    {
      value: "sound",
      label: t("settings.general.notifications.deliveryMode.options.soundOnly"),
    },
  ];
}

function createNotificationTriggerOptions(
  t: Translator,
): ReadonlyArray<{
  readonly value: NotificationTriggerMode;
  readonly label: string;
}> {
  return [
    {
      value: "never",
      label: t("settings.general.notifications.triggerMode.options.never"),
    },
    {
      value: "unfocused",
      label: t("settings.general.notifications.triggerMode.options.unfocused"),
    },
    {
      value: "always",
      label: t("settings.general.notifications.triggerMode.options.always"),
    },
  ];
}

interface GeneralSettingsSectionProps {
  readonly preferences: AppPreferencesController;
  readonly steerAvailable: boolean;
  readonly onTestNotificationSound?: () => void;
  readonly onTestSystemNotification?: () => void;
  readonly notificationTestFeedback?: {
    readonly tone: "success" | "error";
    readonly message: string;
  } | null;
}

function ToggleSwitch(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={props.onToggle}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

export function GeneralSettingsSection(props: GeneralSettingsSectionProps): JSX.Element {
  const { preferences } = props;
  const { t } = useI18n();
  const agentEnvironmentOptions = createAgentEnvironmentOptions(t);
  const workspaceOpenerOptions = createWorkspaceOpenerOptions(t);
  const terminalShellOptions = createTerminalShellOptions(t);
  const languageOptions = createLanguageOptions(t);
  const threadDetailOptions = createThreadDetailOptions(t);
  const followUpModeOptions = createFollowUpModeOptions(t, props.steerAvailable);
  const composerEnterOptions = createComposerEnterOptions(t);
  const notificationDeliveryOptions = createNotificationDeliveryOptions(t);
  const notificationTriggerOptions = createNotificationTriggerOptions(t);

  return (
    <section className="settings-page-section">
      <h2 className="settings-section-title">{t("settings.general.title")}</h2>
      <section className="settings-card">
        <SettingsSelectRow
          label={t("settings.general.agentEnvironment.label")}
          description={t("settings.general.agentEnvironment.description")}
          value={preferences.agentEnvironment}
          options={agentEnvironmentOptions}
          onChange={preferences.setAgentEnvironment}
        />
        <SettingsSelectRow
          label={t("settings.general.workspaceOpener.label")}
          description={t("settings.general.workspaceOpener.description")}
          value={preferences.workspaceOpener}
          options={workspaceOpenerOptions}
          onChange={preferences.setWorkspaceOpener}
        />
        <SettingsSelectRow
          label={t("settings.general.embeddedTerminalShell.label")}
          description={t("settings.general.embeddedTerminalShell.description")}
          value={preferences.embeddedTerminalShell}
          options={terminalShellOptions}
          onChange={preferences.setEmbeddedTerminalShell}
        />
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("settings.general.embeddedTerminalUtf8.label")}</strong>
            <p>{t("settings.general.embeddedTerminalUtf8.description")}</p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={preferences.embeddedTerminalUtf8}
              label={t("settings.general.embeddedTerminalUtf8.label")}
              onToggle={() => preferences.setEmbeddedTerminalUtf8(!preferences.embeddedTerminalUtf8)}
            />
          </div>
        </div>
        <SettingsSelectRow
          label={t("settings.general.language.label")}
          description={t("settings.general.language.description")}
          value={preferences.uiLanguage}
          options={languageOptions}
          onChange={preferences.setUiLanguage}
        />
        <SettingsSelectRow
          label={t("settings.general.threadDetailLevel.label")}
          description={t("settings.general.threadDetailLevel.description")}
          value={preferences.threadDetailLevel}
          options={threadDetailOptions}
          onChange={preferences.setThreadDetailLevel}
        />
        <SettingsToggleButtonGroup
          label={t("settings.general.followUpQueueMode.label")}
          description={t("settings.general.followUpQueueMode.description")}
          value={preferences.followUpQueueMode}
          options={followUpModeOptions}
          onChange={preferences.setFollowUpQueueMode}
        />
        <SettingsSelectRow
          label={t("settings.general.composerEnterBehavior.label")}
          description={t("settings.general.composerEnterBehavior.description")}
          value={preferences.composerEnterBehavior}
          options={composerEnterOptions}
          onChange={preferences.setComposerEnterBehavior}
        />
        <SettingsToggleButtonGroup
          label={t("settings.general.notifications.deliveryMode.label")}
          description={t("settings.general.notifications.deliveryMode.description")}
          value={preferences.notificationDeliveryMode}
          options={notificationDeliveryOptions}
          onChange={preferences.setNotificationDeliveryMode}
        />
        <SettingsToggleButtonGroup
          label={t("settings.general.notifications.triggerMode.label")}
          description={t("settings.general.notifications.triggerMode.description")}
          value={preferences.notificationTriggerMode}
          options={notificationTriggerOptions}
          onChange={preferences.setNotificationTriggerMode}
        />
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("settings.general.notifications.subagents.label")}</strong>
            <p>{t("settings.general.notifications.subagents.description")}</p>
          </div>
          <div className="settings-row-control">
            <ToggleSwitch
              checked={preferences.subagentNotificationsEnabled}
              label={t("settings.general.notifications.subagents.label")}
              onToggle={() =>
                preferences.setSubagentNotificationsEnabled(
                  !preferences.subagentNotificationsEnabled,
                )}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong>{t("settings.general.notifications.test.label")}</strong>
            <p>{t("settings.general.notifications.test.description")}</p>
            {props.notificationTestFeedback ? (
              <p
                className={
                  props.notificationTestFeedback.tone === "error"
                    ? "settings-status-note settings-status-note-error"
                    : "settings-status-note settings-status-note-success"
                }
              >
                {props.notificationTestFeedback.message}
              </p>
            ) : null}
          </div>
          <div className="settings-row-control">
            <div className="settings-action-group">
              <button
                type="button"
                className="settings-action-btn settings-action-btn-sm"
                onClick={props.onTestNotificationSound}
              >
                {t("settings.general.notifications.test.sound")}
              </button>
              <button
                type="button"
                className="settings-action-btn settings-action-btn-sm"
                onClick={props.onTestSystemNotification}
              >
                {t("settings.general.notifications.test.popup")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
