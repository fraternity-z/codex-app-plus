import { FolderIcon, SidebarIcon, TopActionIcon, CodexGlyph } from "./icons";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import { SettingsPopover } from "./SettingsPopover";

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

function Sidebar(
  props: Pick<HomeViewProps, "roots" | "selectedRootId" | "onSelectRoot" | "onAddRoot" | "settingsMenuOpen" | "onToggleSettingsMenu" | "onDismissSettingsMenu" | "onOpenSettings">
): JSX.Element {
  const { roots, selectedRootId, onSelectRoot, onAddRoot, settingsMenuOpen, onToggleSettingsMenu, onDismissSettingsMenu, onOpenSettings } = props;

  return (
    <aside className="replica-sidebar">
      {settingsMenuOpen ? <button type="button" className="settings-backdrop" onClick={onDismissSettingsMenu} aria-label="关闭菜单" /> : null}
      <header className="sidebar-header">
        <CodexGlyph className="brand-logo" />
        <span className="brand-name">Codex</span>
      </header>
      <button type="button" className="sidebar-collapse" aria-label="折叠边栏">◻</button>
      <nav className="sidebar-nav">
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="new-thread" /><span>新线程</span></button>
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="automation" /><span>自动化</span></button>
        <button type="button" className="sidebar-nav-item"><SidebarIcon kind="skills" /><span>技能</span></button>
      </nav>
      <section className="thread-section">
        <div className="thread-section-title">线程</div>
        <div className="thread-header-actions">
          <button type="button" className="thread-header-btn" onClick={onAddRoot}>＋</button>
          <span>⋯ ≡</span>
        </div>
        <ul className="thread-list">
          {roots.map((root) => (
            <li key={root.id} className={root.id === selectedRootId ? "thread-item thread-item-active" : "thread-item"} onClick={() => onSelectRoot(root.id)}>
              <FolderIcon active={root.id === selectedRootId} />
              <span className="thread-label">{root.name}</span>
              {root.id === selectedRootId ? <span className="thread-item-tools">··· ✎</span> : null}
            </li>
          ))}
          {roots.length === 0 ? <li className="thread-empty">暂无项目，点击 + 添加</li> : null}
        </ul>
      </section>
      <div className="settings-slot">
        {settingsMenuOpen ? <SettingsPopover onOpenSettings={onOpenSettings} /> : null}
        <button type="button" className="sidebar-settings" onClick={onToggleSettingsMenu}>
          <span className="settings-gear">⚙</span>
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
}

function MainContent({ selectedRootName }: { readonly selectedRootName: string }): JSX.Element {
  return (
    <div className="replica-main">
      <header className="main-toolbar">
        <h1 className="toolbar-title">新线程</h1>
        <div className="toolbar-actions">
          <button type="button" className="toolbar-pill"><TopActionIcon /><span>打开</span><span className="toolbar-caret">⌄</span></button>
          <button type="button" className="toolbar-pill"><span>提交</span><span className="toolbar-caret">⌄</span></button>
          <span className="toolbar-credits"><span className="credit-positive">+846</span><span className="credit-negative">-846</span></span>
          <span className="toolbar-mini-icons">◱ ⧉</span>
        </div>
      </header>
      <main className="main-canvas">
        <svg className="center-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2a4.5 4.5 0 0 1 4.5 4.5v.5h.5a4.5 4.5 0 1 1 0 9h-.5v.5a4.5 4.5 0 1 1-9 0v-.5H7a4.5 4.5 0 1 1 0-9h.5v-.5A4.5 4.5 0 0 1 12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="8.5" cy="8.4" r=".9" fill="currentColor" />
          <circle cx="15.6" cy="15.5" r=".9" fill="currentColor" />
        </svg>
        <h2 className="canvas-title">开始构建</h2>
        <button type="button" className="workspace-pill"><span>{selectedRootName}</span><span>⌄</span></button>
      </main>
      <footer className="composer-area">
        <div className="composer-card">
          <textarea className="composer-input" readOnly value="ui完全复刻此页面，完全完全复刻，解包数据在E:\\code\\codex-official-deconstructed" />
          <div className="composer-bar">
            <div className="composer-left">
              <button type="button" className="composer-mini-btn" aria-label="添加">+</button>
              <button type="button" className="composer-chip">GPT-5.3-Codex ⌄</button>
              <button type="button" className="composer-chip">超高 ⌄</button>
            </div>
            <button type="button" className="send-btn" aria-label="发送">↑</button>
          </div>
        </div>
        <div className="composer-footer">
          <span className="composer-footer-item">⌂ 本地 ⌄</span>
          <span className="composer-footer-item footer-warning">⊘ 完全访问权限 ⌄</span>
          <span className="composer-footer-item">⎇ main ⌄</span>
        </div>
      </footer>
    </div>
  );
}

export function HomeView(props: HomeViewProps): JSX.Element {
  return (
    <div className="replica-app">
      <Sidebar {...props} />
      <MainContent selectedRootName={props.selectedRootName} />
    </div>
  );
}
