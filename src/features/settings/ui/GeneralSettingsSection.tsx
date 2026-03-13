import type {
  AppPreferencesController,
  ThreadDetailLevel,
  UiLanguage
} from "../hooks/useAppPreferences";
import type { AgentEnvironment, EmbeddedTerminalShell, WorkspaceOpener } from "../../../bridge/types";
import type { ComposerEnterBehavior, FollowUpMode } from "../../../domain/timeline";
import { SettingsSelectRow, type SettingsSelectOption } from "./SettingsSelectRow";

const AGENT_ENVIRONMENT_OPTIONS: ReadonlyArray<SettingsSelectOption<AgentEnvironment>> = [
  { value: "windowsNative", label: "Windows native" },
  { value: "wsl", label: "WSL" }
];

const WORKSPACE_OPENER_OPTIONS: ReadonlyArray<SettingsSelectOption<WorkspaceOpener>> = [
  { value: "vscode", label: "VS Code" },
  { value: "visualStudio", label: "Visual Studio" },
  { value: "githubDesktop", label: "GitHub Desktop" },
  { value: "explorer", label: "File Explorer" },
  { value: "terminal", label: "Terminal" },
  { value: "gitBash", label: "Git Bash" }
];

const TERMINAL_SHELL_OPTIONS: ReadonlyArray<SettingsSelectOption<EmbeddedTerminalShell>> = [
  { value: "powerShell", label: "PowerShell" },
  { value: "commandPrompt", label: "Command Prompt" },
  { value: "gitBash", label: "Git Bash" }
];

const UI_LANGUAGE_OPTIONS: ReadonlyArray<SettingsSelectOption<UiLanguage>> = [
  { value: "zh-CN", label: "中文（中国）" },
  { value: "en-US", label: "English (US)" }
];

const THREAD_DETAIL_LEVEL_OPTIONS: ReadonlyArray<SettingsSelectOption<ThreadDetailLevel>> = [
  { value: "compact", label: "精简步骤" },
  { value: "commands", label: "包含命令输出" },
  { value: "full", label: "完整输出" }
];

const FOLLOW_UP_MODE_OPTIONS: ReadonlyArray<SettingsSelectOption<FollowUpMode>> = [
  { value: "queue", label: "Queue" },
  { value: "steer", label: "Steer" },
  { value: "interrupt", label: "Interrupt" }
];

const COMPOSER_ENTER_OPTIONS: ReadonlyArray<SettingsSelectOption<ComposerEnterBehavior>> = [
  { value: "enter", label: "Enter 发送" },
  { value: "cmdIfMultiline", label: "多行时 Ctrl/Cmd+Enter 发送" }
];

interface GeneralSettingsSectionProps {
  readonly preferences: AppPreferencesController;
}

export function GeneralSettingsSection(props: GeneralSettingsSectionProps): JSX.Element {
  const { preferences } = props;

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">常规</h1>
      </header>
      <section className="settings-card">
        <SettingsSelectRow
          label="Agent environment"
          description="Choose where the agent runs on Windows."
          value={preferences.agentEnvironment}
          options={AGENT_ENVIRONMENT_OPTIONS}
          onChange={preferences.setAgentEnvironment}
        />
        <SettingsSelectRow
          label="默认打开目标"
          description="打开文件夹或工作区时优先使用的应用。"
          value={preferences.workspaceOpener}
          options={WORKSPACE_OPENER_OPTIONS}
          onChange={preferences.setWorkspaceOpener}
        />
        <SettingsSelectRow
          label="集成终端 Shell"
          description="内置终端默认启动的 Shell。"
          value={preferences.embeddedTerminalShell}
          options={TERMINAL_SHELL_OPTIONS}
          onChange={preferences.setEmbeddedTerminalShell}
        />
        <SettingsSelectRow
          label="界面语言"
          description="应用界面显示语言。"
          value={preferences.uiLanguage}
          options={UI_LANGUAGE_OPTIONS}
          onChange={preferences.setUiLanguage}
          statusNote="当前先保存偏好，未做完整 UI 国际化切换。"
        />
        <SettingsSelectRow
          label="线程详情级别"
          description="控制会话内命令、工具与辅助信息的显示粒度。"
          value={preferences.threadDetailLevel}
          options={THREAD_DETAIL_LEVEL_OPTIONS}
          onChange={preferences.setThreadDetailLevel}
          statusNote="已作用于时间线；完整输出会额外显示 raw response 与调试项。"
        />
        <SettingsSelectRow
          label="Follow-up 模式"
          description="会话进行中再次发送消息时的默认处理方式。"
          value={preferences.followUpQueueMode}
          options={FOLLOW_UP_MODE_OPTIONS}
          onChange={preferences.setFollowUpQueueMode}
          statusNote="支持 queue、steer、interrupt 三种模式。"
        />
        <SettingsSelectRow
          label="回车行为"
          description="Composer 中 Enter 的发送规则。"
          value={preferences.composerEnterBehavior}
          options={COMPOSER_ENTER_OPTIONS}
          onChange={preferences.setComposerEnterBehavior}
          statusNote="支持 Cmd/Ctrl+Shift+Enter 单次反向 follow-up。"
        />
      </section>
    </div>
  );
}
