import {
  OfficialArrowTopRightIcon,
  OfficialChevronRightIcon,
  OfficialCloseIcon,
  OfficialFolderIcon,
  OfficialFolderPlusIcon,
  OfficialPlusIcon,
  OfficialSidebarToggleIcon,
  OfficialSortIcon,
  OfficialSettingsGearIcon,
} from "./officialIcons";
import { SidebarIcon } from "./icons";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import { SettingsPopover } from "./SettingsPopover";
import { ComposerFooter } from "./ComposerFooter";
import { useCallback, useState } from "react";
import vscodeIconUrl from "../../assets/official/apps/vscode.png";

const MIN_TRIMMED_MESSAGE_LENGTH = 1;

interface HomeViewProps {
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRootId: string | null;
  readonly selectedRootName: string;
  readonly settingsMenuOpen: boolean;
  onToggleSettingsMenu: () => void;
  onDismissSettingsMenu: () => void;
  onOpenSettings: () => void;
  onSelectRoot: (rootId: string) => void;
  onAddRoot: () => void;
}

interface SidebarProps extends Pick<HomeViewProps, "roots" | "selectedRootId" | "onSelectRoot" | "onAddRoot" | "settingsMenuOpen" | "onToggleSettingsMenu" | "onDismissSettingsMenu" | "onOpenSettings"> {
  readonly collapsed: boolean;
}

function Sidebar(props: SidebarProps): JSX.Element {
  const { roots, selectedRootId, onSelectRoot, onAddRoot, settingsMenuOpen, onToggleSettingsMenu, onDismissSettingsMenu, onOpenSettings, collapsed } = props;
  const sidebarClassName = collapsed ? "replica-sidebar sidebar-collapsed" : "replica-sidebar";

  return (
    <aside className={sidebarClassName}>
      {settingsMenuOpen ? <button type="button" className="settings-backdrop" onClick={onDismissSettingsMenu} aria-label="关闭菜单" /> : null}
      <div className="sidebar-header" aria-hidden="true" />
      <nav className="sidebar-nav">
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="new-thread" /><span>新线程</span></button>
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="automation" /><span>自动化</span></button>
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="skills" /><span>技能</span></button>
      </nav>
      <section className="thread-section">
        <div className="thread-section-header">
          <div className="thread-section-title">线程</div>
          <div className="thread-header-actions">
            <button type="button" className="thread-header-btn" onClick={onAddRoot} aria-label="添加项目">
              <OfficialFolderPlusIcon className="thread-header-icon" />
            </button>
            <button type="button" className="thread-header-btn" aria-label="排序">
              <OfficialSortIcon className="thread-header-icon" />
            </button>
          </div>
        </div>
        <ul className="thread-list">
          {roots.map((root) => (
            <li key={root.id} className={root.id === selectedRootId ? "thread-item thread-item-active" : "thread-item"} onClick={() => onSelectRoot(root.id)}>
              <OfficialFolderIcon className={root.id === selectedRootId ? "thread-leading-icon thread-leading-icon-active" : "thread-leading-icon"} />
              <span className="thread-label">{root.name}</span>
              {root.id === selectedRootId ? <span className="thread-item-tools">···</span> : null}
            </li>
          ))}
          {roots.length === 0 ? <li className="thread-empty">暂无项目，点击 + 添加</li> : null}
        </ul>
      </section>
      <div className="settings-slot">
        {settingsMenuOpen ? <SettingsPopover onOpenSettings={onOpenSettings} /> : null}
        <button type="button" className="sidebar-settings" onClick={onToggleSettingsMenu}>
          <OfficialSettingsGearIcon className="settings-gear" />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

interface MainContentProps {
  readonly selectedRootName: string;
  readonly terminalOpen: boolean;
  readonly onToggleTerminal: () => void;
}

function MainContent({ selectedRootName, terminalOpen, onToggleTerminal }: MainContentProps): JSX.Element {
  return (
    <div className="replica-main">
      <MainToolbar terminalOpen={terminalOpen} onToggleTerminal={onToggleTerminal} />
      <EmptyCanvas selectedRootName={selectedRootName} />
      <ComposerArea />
    </div>
  );
}

interface MainToolbarProps {
  readonly terminalOpen: boolean;
  readonly onToggleTerminal: () => void;
}

function MainToolbar({ terminalOpen, onToggleTerminal }: MainToolbarProps): JSX.Element {
  return (
    <header className="main-toolbar">
      <h1 className="toolbar-title">新线程</h1>
      <div className="toolbar-actions">
        <button type="button" className="toolbar-pill">
          <img className="toolbar-app-icon" src={vscodeIconUrl} alt="" />
          <span>打开</span>
          <OfficialChevronRightIcon className="toolbar-caret-icon" />
        </button>
        <button type="button" className="toolbar-pill">
          <OfficialArrowTopRightIcon className="toolbar-leading-icon" />
          <span>推送</span>
          <OfficialChevronRightIcon className="toolbar-caret-icon" />
        </button>
        <div className="toolbar-icon-row" aria-label="快捷操作">
          <button
            type="button"
            className="toolbar-icon-btn"
            aria-label={terminalOpen ? "隐藏终端" : "显示终端"}
            aria-pressed={terminalOpen}
            onClick={onToggleTerminal}
          >
            <TerminalIcon className="toolbar-terminal-icon" />
          </button>
        </div>
      </div>
    </header>
  );
}

function EmptyCanvas({ selectedRootName }: { readonly selectedRootName: string }): JSX.Element {
  const isPlaceholder = selectedRootName === "选择项目";
  const selectorClassName = isPlaceholder ? "workspace-selector workspace-selector-placeholder" : "workspace-selector";

  return (
    <main className="main-canvas">
      <div className="empty-state" aria-label="欢迎界面">
        <h2 className="empty-title">开始构建</h2>
        <button type="button" className={selectorClassName}>
          <span className="workspace-selector-label">{selectedRootName}</span>
          <OfficialChevronRightIcon className="workspace-selector-caret" />
        </button>
      </div>
    </main>
  );
}

function ComposerArea(): JSX.Element {
  return (
    <footer className="composer-area">
      <ComposerCard />
      <ComposerFooter />
    </footer>
  );
}

function ComposerCard(): JSX.Element {
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length >= MIN_TRIMMED_MESSAGE_LENGTH;

  return (
    <div className="composer-card">
      <textarea
        className="composer-input"
        placeholder="向 Codex 任意提问，或 添加文件 / 运行命令"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <div className="composer-bar">
        <div className="composer-left">
          <button type="button" className="composer-mini-btn" aria-label="添加">
            <OfficialPlusIcon className="composer-plus-icon" />
          </button>
          <button type="button" className="composer-chip">
            GPT-5.2 <OfficialChevronRightIcon className="chip-caret" />
          </button>
          <button type="button" className="composer-chip">
            超高 <OfficialChevronRightIcon className="chip-caret" />
          </button>
        </div>
        <button type="button" className="send-btn" aria-label="发送" disabled={!canSend}>
          <SendArrowIcon className="send-icon" />
        </button>
      </div>
    </div>
  );
}

function SendArrowIcon({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 13.3V2.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 7.1L8 2.3l4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
      <Sidebar {...props} collapsed={sidebarCollapsed} />
      <MainContent selectedRootName={props.selectedRootName} terminalOpen={terminalOpen} onToggleTerminal={toggleTerminal} />
      {terminalOpen ? <TerminalPanel onClose={() => setTerminalOpen(false)} /> : null}
      <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
    </div>
  );
}

function SidebarCollapseButton({
  collapsed,
  onToggle
}: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="sidebar-collapse-toggle"
      onClick={onToggle}
      aria-label={collapsed ? "展开边栏" : "折叠边栏"}
    >
      <OfficialSidebarToggleIcon className="sidebar-collapse-icon" />
    </button>
  );
}

function TerminalPanel({ onClose }: { readonly onClose: () => void }): JSX.Element {
  return (
    <section className="replica-terminal" aria-label="终端">
      <header className="terminal-toolbar">
        <div className="terminal-title">
          <span className="terminal-title-main">终端</span>
          <span className="terminal-title-sub">PowerShell</span>
        </div>
        <button type="button" className="terminal-close-btn" aria-label="关闭终端" onClick={onClose}>
          <OfficialCloseIcon className="terminal-close-icon" />
        </button>
      </header>
      <pre className="terminal-body">
        {[
          "PS E:\\\\code\\\\codex-app-plus> pnpm dev",
          "",
          "> codex-app-plus@0.1.0 dev E:\\\\code\\\\codex-app-plus",
          "> vite",
          "",
          "Port 5173 is in use, trying another one...",
          "",
          "VITE v5.4.21  ready in 331 ms",
          "",
          "  ➜  Local:   http://localhost:5174/",
          "  ➜  Network: use --host to expose",
          "  ➜  press h + enter to show help",
          "",
          "PS E:\\\\code\\\\codex-app-plus> ^C",
          "PS E:\\\\code\\\\codex-app-plus>"
        ].join("\n")}
      </pre>
    </section>
  );
}
