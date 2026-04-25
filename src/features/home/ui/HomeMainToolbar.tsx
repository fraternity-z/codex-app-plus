import type { HostBridge, WorkspaceOpener } from "../../../bridge/types";
import { useI18n } from "../../../i18n/useI18n";
import { WorkspaceGitButtonLauncher } from "../../workspace/ui/WorkspaceGitButtonLauncher";
import type { WorkspaceGitController } from "../../git/model/types";
import { WorkspaceOpenButton } from "../../workspace/ui/WorkspaceOpenButton";
import { OfficialSidebarToggleIcon } from "../../shared/ui/officialIcons";
import type { WorkspaceLaunchScriptsState } from "../hooks/useWorkspaceLaunchScripts";
import { LaunchScriptsToolbar } from "./LaunchScriptsToolbar";

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
  readonly workspaceSwitching: boolean;
  readonly gitController: WorkspaceGitController;
  readonly launchState?: WorkspaceLaunchScriptsState | null;
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

function resolveTitle(props: HomeMainToolbarProps, conversationTitle: string, workspaceTitle: string): string {
  if (props.conversationActive) {
    return props.selectedThreadTitle?.trim() || conversationTitle;
  }
  return workspaceTitle;
}

function truncateToolbarTitle(value: string): string {
  if (value.length <= MAX_TOOLBAR_TITLE_LENGTH) {
    return value;
  }
  const headLength = MAX_TOOLBAR_TITLE_LENGTH - TOOLBAR_TITLE_TAIL_LENGTH - 1;
  return `${value.slice(0, headLength)}...${value.slice(-TOOLBAR_TITLE_TAIL_LENGTH)}`;
}

export function HomeMainToolbar(props: HomeMainToolbarProps): JSX.Element {
  const { t } = useI18n();
  const title = resolveTitle(props, t("home.toolbar.conversation"), t("home.toolbar.workspaceConversation"));
  const displayTitle = truncateToolbarTitle(title);
  const subtitle = props.conversationActive && props.selectedRootPath !== null
    ? props.workspaceSwitching
      ? `${props.selectedRootName} · ${t("home.toolbar.switching")}`
      : props.selectedRootName
    : null;
  const terminalLabel = props.terminalOpen ? t("home.toolbar.hideTerminal") : t("home.toolbar.showTerminal");
  const diffLabel = props.diffOpen ? t("home.toolbar.hideDiffSidebar") : t("home.toolbar.showDiffSidebar");
  const toolbarClassName = props.conversationActive ? "main-toolbar main-toolbar-conversation" : "main-toolbar";
  const titleClassName = props.conversationActive ? "toolbar-title toolbar-title-compact" : "toolbar-title";

  return (
    <header className={toolbarClassName}>
      <div className="toolbar-heading">
        <h1 className={titleClassName} title={title}>{displayTitle}</h1>
        {subtitle === null ? null : <p className="toolbar-subtitle">{subtitle}</p>}
      </div>
      <div className="toolbar-actions">
        {props.launchState === null || props.launchState === undefined ? null : (
          <LaunchScriptsToolbar
            disabled={props.selectedRootPath === null || props.workspaceSwitching}
            state={props.launchState}
          />
        )}
        <WorkspaceOpenButton
          hostBridge={props.hostBridge}
          selectedRootPath={props.selectedRootPath}
          selectedOpener={props.workspaceOpener}
          onSelectOpener={props.onSelectWorkspaceOpener}
        />
        <WorkspaceGitButtonLauncher controller={props.gitController} selectedRootPath={props.selectedRootPath} />
        <div className="toolbar-icon-row" aria-label={t("home.toolbar.quickActions")}>
          <ToolbarIconButton
            active={props.diffOpen}
            disabled={props.selectedRootPath === null || props.workspaceSwitching}
            label={diffLabel}
            onClick={props.onToggleDiff}
          >
            <OfficialSidebarToggleIcon className="toolbar-terminal-icon" />
          </ToolbarIconButton>
          <ToolbarIconButton active={props.terminalOpen} label={terminalLabel} onClick={props.onToggleTerminal}>
            <TerminalIcon className="toolbar-terminal-icon" />
          </ToolbarIconButton>
        </div>
      </div>
    </header>
  );
}
