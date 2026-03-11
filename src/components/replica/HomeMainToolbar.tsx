import type { HostBridge, WorkspaceOpener } from "../../bridge/types";
import { WorkspaceGitButtonLauncher } from "./WorkspaceGitButtonLauncher";
import { WorkspaceOpenButton } from "./WorkspaceOpenButton";
import { GitDiffIcon } from "./git/gitIcons";

const DEFAULT_CONVERSATION_TITLE = "会话";
const DEFAULT_WORKSPACE_TITLE = "工作区会话";
const HIDE_TERMINAL_LABEL = "隐藏终端";
const SHOW_TERMINAL_LABEL = "显示终端";
const HIDE_DIFF_LABEL = "隐藏差异侧栏";
const SHOW_DIFF_LABEL = "显示差异侧栏";
const TOOLBAR_ACTIONS_LABEL = "快捷操作";
const MAX_TOOLBAR_TITLE_LENGTH = 72;
const TOOLBAR_TITLE_TAIL_LENGTH = 28;

interface HomeMainToolbarProps {
  readonly hostBridge: HostBridge;
  readonly conversationActive: boolean;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly selectedThreadTitle: string | null;
  readonly terminalOpen: boolean;
  readonly diffOpen: boolean;
  readonly workspaceOpener: WorkspaceOpener;
  readonly onSelectWorkspaceOpener: (opener: WorkspaceOpener) => void;
  readonly onToggleTerminal: () => void;
  readonly onToggleDiff: () => void;
}

function ToolbarIconButton(props: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      className="toolbar-icon-btn"
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function TerminalIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 8l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.8 12h3.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function resolveTitle(props: HomeMainToolbarProps): string {
  if (props.conversationActive) {
    return props.selectedThreadTitle?.trim() || DEFAULT_CONVERSATION_TITLE;
  }
  return props.selectedRootPath === null ? DEFAULT_WORKSPACE_TITLE : props.selectedRootName;
}

function truncateToolbarTitle(value: string): string {
  if (value.length <= MAX_TOOLBAR_TITLE_LENGTH) {
    return value;
  }
  const headLength = MAX_TOOLBAR_TITLE_LENGTH - TOOLBAR_TITLE_TAIL_LENGTH - 1;
  return `${value.slice(0, headLength)}…${value.slice(-TOOLBAR_TITLE_TAIL_LENGTH)}`;
}

export function HomeMainToolbar(props: HomeMainToolbarProps): JSX.Element {
  const title = resolveTitle(props);
  const displayTitle = truncateToolbarTitle(title);
  const subtitle = props.conversationActive && props.selectedRootPath !== null ? props.selectedRootName : null;
  const terminalLabel = props.terminalOpen ? HIDE_TERMINAL_LABEL : SHOW_TERMINAL_LABEL;
  const diffLabel = props.diffOpen ? HIDE_DIFF_LABEL : SHOW_DIFF_LABEL;
  const toolbarClassName = props.conversationActive ? "main-toolbar main-toolbar-conversation" : "main-toolbar";
  const titleClassName = props.conversationActive ? "toolbar-title toolbar-title-compact" : "toolbar-title";

  return (
    <header className={toolbarClassName}>
      <div className="toolbar-heading">
        <h1 className={titleClassName} title={title}>{displayTitle}</h1>
        {subtitle === null ? null : <p className="toolbar-subtitle">{subtitle}</p>}
      </div>
      <div className="toolbar-actions">
        <WorkspaceOpenButton
          hostBridge={props.hostBridge}
          selectedRootPath={props.selectedRootPath}
          selectedOpener={props.workspaceOpener}
          onSelectOpener={props.onSelectWorkspaceOpener}
        />
        <WorkspaceGitButtonLauncher hostBridge={props.hostBridge} selectedRootPath={props.selectedRootPath} />
        <div className="toolbar-icon-row" aria-label={TOOLBAR_ACTIONS_LABEL}>
          <ToolbarIconButton
            active={props.diffOpen}
            disabled={props.selectedRootPath === null}
            label={diffLabel}
            onClick={props.onToggleDiff}
          >
            <GitDiffIcon className="toolbar-terminal-icon" />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.terminalOpen} label={terminalLabel} onClick={props.onToggleTerminal}>
            <TerminalIcon className="toolbar-terminal-icon" />
          </ToolbarIconButton>
        </div>
      </div>
    </header>
  );
}
