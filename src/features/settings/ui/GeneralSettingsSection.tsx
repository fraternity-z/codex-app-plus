import type {
  AppPreferencesController,
  ThreadDetailLevel,
} from "../hooks/useAppPreferences";
import type { AgentEnvironment, EmbeddedTerminalShell, WorkspaceOpener } from "../../../bridge/types";
import type { ComposerEnterBehavior, FollowUpMode } from "../../../domain/timeline";
import { createLanguageOptions, useI18n, type MessageKey } from "../../../i18n";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

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

function createFollowUpModeOptions(t: Translator): ReadonlyArray<SettingsSelectOption<FollowUpMode>> {
  return [
    { value: "queue", label: t("settings.general.followUpQueueMode.options.queue") },
    { value: "steer", label: t("settings.general.followUpQueueMode.options.steer") },
    { value: "interrupt", label: t("settings.general.followUpQueueMode.options.interrupt") }
  ];
}

function createComposerEnterOptions(t: Translator): ReadonlyArray<SettingsSelectOption<ComposerEnterBehavior>> {
  return [
    { value: "enter", label: t("settings.general.composerEnterBehavior.options.enter") },
    { value: "cmdIfMultiline", label: t("settings.general.composerEnterBehavior.options.cmdIfMultiline") }
  ];
}

interface GeneralSettingsSectionProps {
  readonly preferences: AppPreferencesController;
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
  const followUpModeOptions = createFollowUpModeOptions(t);
  const composerEnterOptions = createComposerEnterOptions(t);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.general.title")}</h1>
      </header>
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
            <p className="settings-row-note">{t("settings.general.embeddedTerminalUtf8.note")}</p>
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
          statusNote={t("settings.general.language.note")}
        />
        <SettingsSelectRow
          label={t("settings.general.threadDetailLevel.label")}
          description={t("settings.general.threadDetailLevel.description")}
          value={preferences.threadDetailLevel}
          options={threadDetailOptions}
          onChange={preferences.setThreadDetailLevel}
          statusNote={t("settings.general.threadDetailLevel.note")}
        />
        <SettingsSelectRow
          label={t("settings.general.followUpQueueMode.label")}
          description={t("settings.general.followUpQueueMode.description")}
          value={preferences.followUpQueueMode}
          options={followUpModeOptions}
          onChange={preferences.setFollowUpQueueMode}
          statusNote={t("settings.general.followUpQueueMode.note")}
        />
        <SettingsSelectRow
          label={t("settings.general.composerEnterBehavior.label")}
          description={t("settings.general.composerEnterBehavior.description")}
          value={preferences.composerEnterBehavior}
          options={composerEnterOptions}
          onChange={preferences.setComposerEnterBehavior}
          statusNote={t("settings.general.composerEnterBehavior.note")}
        />
      </section>
    </div>
  );
}
