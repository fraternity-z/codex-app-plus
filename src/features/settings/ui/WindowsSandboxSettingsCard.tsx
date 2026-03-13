import { useMemo } from "react";
import { readWindowsSandboxConfigView } from "../sandbox/windowsSandboxConfig";
import type { WindowsSandboxSetupState } from "../../../domain/types";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";

interface WindowsSandboxSettingsCardProps {
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  readonly setupState: WindowsSandboxSetupState;
  readonly onStartSetup: (mode: WindowsSandboxSetupMode) => Promise<unknown>;
}

function modeLabel(mode: "disabled" | WindowsSandboxSetupMode): string {
  if (mode === "elevated") return "增强模式";
  if (mode === "unelevated") return "标准模式";
  return "未启用";
}

function resultMessage(state: WindowsSandboxSetupState): string | null {
  if (state.pending && state.mode !== null) {
    return `正在执行${modeLabel(state.mode)}预配置…`;
  }
  if (state.success === true && state.mode !== null) {
    return `${modeLabel(state.mode)}预配置已完成。`;
  }
  if (state.success === false && state.mode !== null) {
    return state.error ?? `${modeLabel(state.mode)}预配置失败。`;
  }
  return null;
}

function SetupAction(props: {
  readonly busy: boolean;
  readonly currentMode: WindowsSandboxSetupState["mode"];
  readonly mode: WindowsSandboxSetupMode;
  readonly title: string;
  readonly description: string;
  readonly primary?: boolean;
  readonly onStartSetup: (mode: WindowsSandboxSetupMode) => Promise<unknown>;
}): JSX.Element {
  const running = props.busy && props.currentMode === props.mode;
  const className = props.primary
    ? "windows-sandbox-action windows-sandbox-action-primary"
    : "windows-sandbox-action";

  return (
    <button type="button" className={className} disabled={props.busy} onClick={() => void props.onStartSetup(props.mode)}>
      <span className="windows-sandbox-action-title">{running ? "配置进行中…" : props.title}</span>
      <span className="windows-sandbox-action-copy">{props.description}</span>
    </button>
  );
}

export function WindowsSandboxSettingsCard(props: WindowsSandboxSettingsCardProps): JSX.Element {
  const view = useMemo(() => readWindowsSandboxConfigView(props.configSnapshot), [props.configSnapshot]);
  const result = resultMessage(props.setupState);
  const actionsDisabled = props.busy || props.setupState.pending || !view.canRunSetup;
  const resultClass = props.setupState.success === false
    ? "settings-status-note settings-status-note-error windows-sandbox-status"
    : props.setupState.pending
      ? "settings-status-note windows-sandbox-status"
      : "settings-status-note settings-status-note-success windows-sandbox-status";

  return (
    <section className="settings-card windows-sandbox-card">
      <div className="windows-sandbox-head">
        <div className="windows-sandbox-head-main">
          <strong>Windows 沙盒</strong>
          <p className="windows-sandbox-summary-copy">
            使用官方预配置流程增强工具执行隔离；不会改动当前对话的写权限与审批策略。
          </p>
        </div>
        <span className="settings-chip settings-chip-sm windows-sandbox-chip">{modeLabel(view.mode)}</span>
      </div>

      <div className="windows-sandbox-meta">
        <div className="windows-sandbox-meta-block">
          <span className="windows-sandbox-meta-label">当前状态</span>
          <strong>{modeLabel(view.mode)}</strong>
          <p>{view.source ?? "当前还没有配置 Windows 沙盒模式。"}</p>
        </div>
      </div>

      {view.isLegacy ? <p className="settings-status-note windows-sandbox-status">当前模式来自旧版特性开关，建议后续迁移到 `windows.sandbox` 配置。</p> : null}
      {!view.canRunSetup ? <p className="settings-status-note settings-status-note-error windows-sandbox-status">当前环境不是 Windows，无法执行 Windows 沙盒预配置。</p> : null}
      {result ? <p className={resultClass}>{result}</p> : null}

      <div className="windows-sandbox-actions">
        <SetupAction
          busy={actionsDisabled}
          currentMode={props.setupState.mode}
          mode="unelevated"
          title="标准模式（无需管理员）"
          description="优先推荐。适合先完成常规预配置，减少额外打扰。"
          primary
          onStartSetup={props.onStartSetup}
        />
        <SetupAction
          busy={actionsDisabled}
          currentMode={props.setupState.mode}
          mode="elevated"
          title="增强模式（管理员）"
          description="需要管理员授权，适合需要更完整系统级准备时执行。"
          onStartSetup={props.onStartSetup}
        />
      </div>
    </section>
  );
}
