import { useCallback, useState } from "react";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import type { HostBridge } from "../../bridge/types";
import type {
  AuthStatus,
  ConnectionStatus,
  ConversationMessage,
  ReceivedServerRequest,
  ThreadSummary
} from "../../domain/types";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { ComposerFooter } from "./ComposerFooter";
import { HomeSidebar } from "./HomeSidebar";
import { WorkspaceGitButton } from "./WorkspaceGitButton";
import { WorkspaceOpenButton } from "./WorkspaceOpenButton";
import {
  OfficialChevronRightIcon,
  OfficialPlusIcon,
  OfficialSidebarToggleIcon
} from "./officialIcons";

const MIN_TRIMMED_MESSAGE_LENGTH = 1;

interface HomeViewProps {
  readonly hostBridge: HostBridge;
  readonly busy: boolean;
  readonly inputText: string;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly threads: ReadonlyArray<ThreadSummary>;
  readonly selectedThreadId: string | null;
  readonly messages: ReadonlyArray<ConversationMessage>;
  readonly pendingServerRequests: ReadonlyArray<ReceivedServerRequest>;
  readonly connectionStatus: ConnectionStatus;
  readonly fatalError: string | null;
  readonly authStatus: AuthStatus;
  readonly authMode: string | null;
  readonly retryScheduledAt: number | null;
  readonly settingsMenuOpen: boolean;
  readonly onToggleSettingsMenu: () => void;
  readonly onDismissSettingsMenu: () => void;
  readonly onOpenSettings: () => void;
  readonly onSelectRoot: (rootId: string) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onInputChange: (text: string) => void;
  readonly onCreateThread: () => Promise<void>;
  readonly onSendTurn: () => Promise<void>;
  readonly onAddRoot: () => void;
  readonly onRemoveRoot: (rootId: string) => void;
  readonly onRetryConnection: () => Promise<void>;
  readonly onLogin: () => Promise<void>;
  readonly onApproveRequest: (requestId: string) => Promise<void>;
  readonly onRejectRequest: (requestId: string) => Promise<void>;
}

interface MainContentProps {
  readonly busy: boolean;
  readonly hostBridge: HostBridge;
  readonly inputText: string;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly terminalOpen: boolean;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: () => Promise<void>;
  readonly onToggleTerminal: () => void;
}

function MainContent(props: MainContentProps): JSX.Element {
  return (
    <div className="replica-main">
      <MainToolbar
        hostBridge={props.hostBridge}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        terminalOpen={props.terminalOpen}
        onToggleTerminal={props.onToggleTerminal}
      />
      <EmptyCanvas selectedRootName={props.selectedRootName} selectedRootPath={props.selectedRootPath} />
      <ComposerArea
        busy={props.busy}
        inputText={props.inputText}
        selectedRootPath={props.selectedRootPath}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
      />
    </div>
  );
}

interface MainToolbarProps {
  readonly hostBridge: HostBridge;
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
  readonly terminalOpen: boolean;
  readonly onToggleTerminal: () => void;
}

function MainToolbar(props: MainToolbarProps): JSX.Element {
  const title = props.selectedRootPath === null ? "工作区会话" : props.selectedRootName;

  return (
    <header className="main-toolbar">
      <h1 className="toolbar-title">{title}</h1>
      <div className="toolbar-actions">
        <WorkspaceOpenButton hostBridge={props.hostBridge} selectedRootPath={props.selectedRootPath} />
        <WorkspaceGitButton
          hostBridge={props.hostBridge}
          selectedRootName={props.selectedRootName}
          selectedRootPath={props.selectedRootPath}
        />
        <div className="toolbar-icon-row" aria-label="快捷操作">
          <button
            type="button"
            className="toolbar-icon-btn"
            aria-label={props.terminalOpen ? "隐藏终端" : "显示终端"}
            aria-pressed={props.terminalOpen}
            onClick={props.onToggleTerminal}
          >
            <TerminalIcon className="toolbar-terminal-icon" />
          </button>
        </div>
      </div>
    </header>
  );
}

function EmptyCanvas(props: {
  readonly selectedRootName: string;
  readonly selectedRootPath: string | null;
}): JSX.Element {
  const selectorClassName =
    props.selectedRootPath === null ? "workspace-selector workspace-selector-placeholder" : "workspace-selector";
  const title = props.selectedRootPath === null ? "开始构建" : "当前工作区";

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="欢迎界面">
        <h2 className="empty-title">{title}</h2>
        <button type="button" className={selectorClassName}>
          <span className="workspace-selector-label">{props.selectedRootName}</span>
          <OfficialChevronRightIcon className="workspace-selector-caret" />
        </button>
      </div>
    </main>
  );
}

interface ComposerAreaProps {
  readonly busy: boolean;
  readonly inputText: string;
  readonly selectedRootPath: string | null;
  readonly onInputChange: (text: string) => void;
  readonly onSendTurn: () => Promise<void>;
}

function ComposerArea(props: ComposerAreaProps): JSX.Element {
  return (
    <footer className="composer-area">
      <ComposerCard {...props} />
      <ComposerFooter />
    </footer>
  );
}

function ComposerCard(props: ComposerAreaProps): JSX.Element {
  const canSend =
    !props.busy && props.selectedRootPath !== null && props.inputText.trim().length >= MIN_TRIMMED_MESSAGE_LENGTH;
  const placeholder =
    props.selectedRootPath === null ? "向 Codex 任意提问，@ 添加文件，/ 调出命令" : "输入问题，后续对话会固定在当前工作区";

  return (
    <div className="composer-card">
      <textarea
        className="composer-input"
        placeholder={placeholder}
        value={props.inputText}
        onChange={(event) => props.onInputChange(event.currentTarget.value)}
      />
      <div className="composer-bar">
        <div className="composer-left">
          <button type="button" className="composer-mini-btn" aria-label="添加">
            <OfficialPlusIcon className="composer-plus-icon" />
          </button>
          <button type="button" className="composer-chip">
            自定义 <OfficialChevronRightIcon className="chip-caret" />
          </button>
          <button type="button" className="composer-chip">
            超高 <OfficialChevronRightIcon className="chip-caret" />
          </button>
        </div>
        <button type="button" className="send-btn" aria-label="发送消息" disabled={!canSend} onClick={() => void props.onSendTurn()}>
          <SendArrowIcon className="send-icon" />
        </button>
      </div>
    </div>
  );
}

function SendArrowIcon(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 13.3V2.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 7.1L8 2.3l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

export function HomeView(props: HomeViewProps): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const toggleTerminal = useCallback(() => {
    setTerminalOpen((value) => !value);
  }, []);

  return (
    <div className="replica-app">
      <HomeSidebar
        roots={props.roots}
        selectedRootId={props.selectedRootId}
        settingsMenuOpen={props.settingsMenuOpen}
        collapsed={sidebarCollapsed}
        onToggleSettingsMenu={props.onToggleSettingsMenu}
        onDismissSettingsMenu={props.onDismissSettingsMenu}
        onOpenSettings={props.onOpenSettings}
        onSelectRoot={props.onSelectRoot}
        onCreateThread={props.onCreateThread}
        onAddRoot={props.onAddRoot}
        onRemoveRoot={props.onRemoveRoot}
      />
      <MainContent
        busy={props.busy}
        hostBridge={props.hostBridge}
        inputText={props.inputText}
        selectedRootName={props.selectedRootName}
        selectedRootPath={props.selectedRootPath}
        terminalOpen={terminalOpen}
        onInputChange={props.onInputChange}
        onSendTurn={props.onSendTurn}
        onToggleTerminal={toggleTerminal}
      />
      <TerminalPanel
        hostBridge={props.hostBridge}
        open={terminalOpen}
        cwd={props.selectedRootPath}
        cwdLabel={props.selectedRootName}
        onClose={() => setTerminalOpen(false)}
      />
      <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
    </div>
  );
}

function SidebarCollapseButton(props: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="sidebar-collapse-toggle"
      onClick={props.onToggle}
      aria-label={props.collapsed ? "展开侧边栏" : "折叠侧边栏"}
    >
      <OfficialSidebarToggleIcon className="sidebar-collapse-icon" />
    </button>
  );
}
