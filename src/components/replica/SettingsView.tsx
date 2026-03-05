import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import { useState } from "react";
import { OpenSourceLicensesDialog } from "./OpenSourceLicensesDialog";

export type SettingsSection =
  | "general"
  | "config"
  | "personalization"
  | "mcp"
  | "git"
  | "environment"
  | "worktree"
  | "archived";

interface SettingsViewProps {
  readonly section: SettingsSection;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onAddRoot: () => void;
  onOpenConfigToml: () => Promise<void>;
}

interface NavItem {
  readonly key: SettingsSection;
  readonly label: string;
  readonly icon: string;
}

interface McpServerItem {
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly action: "toggle" | "install";
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "general", label: "常规", icon: "◌" },
  { key: "config", label: "配置", icon: "⦿" },
  { key: "personalization", label: "个性化", icon: "◔" },
  { key: "mcp", label: "MCP 服务器", icon: "✎" },
  { key: "git", label: "Git", icon: "⎇" },
  { key: "environment", label: "环境", icon: "◫" },
  { key: "worktree", label: "工作树", icon: "⇲" },
  { key: "archived", label: "已归档线程", icon: "▣" }
];

const MCP_RECOMMENDED: ReadonlyArray<McpServerItem> = [
  {
    name: "Linear",
    author: "Linear",
    description: "集成 Linear 的问题追踪和项目管理功能",
    action: "install"
  },
  {
    name: "Notion",
    author: "Notion",
    description: "阅读文档、更新页面、管理任务",
    action: "install"
  },
  {
    name: "Figma",
    author: "Figma",
    description: "通过引入完整的 Figma 设计背景信息来生成更优质的代码",
    action: "install"
  },
  {
    name: "Playwright",
    author: "Microsoft",
    description: "集成浏览器自动化功能以设计和测试用户界面。",
    action: "toggle"
  }
];

function SettingsSidebar(props: {
  readonly section: SettingsSection;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
}): JSX.Element {
  const { section, onBackHome, onSelectSection } = props;
  return (
    <aside className="settings-sidebar">
      <button type="button" className="settings-back-app" onClick={onBackHome}>
        ← 返回应用
      </button>
      <nav className="settings-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === section ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"}
            onClick={() => onSelectSection(item.key)}
          >
            <span className="settings-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function SectionHeader(props: { readonly title: string; readonly subtitle?: string }): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      {props.subtitle ? <p className="settings-subtitle">{props.subtitle}</p> : null}
    </header>
  );
}

function ToggleControl(props: { readonly checked?: boolean }): JSX.Element {
  return (
    <span className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}>
      <span className="settings-toggle-knob" />
    </span>
  );
}

function GeneralContent(): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="常规" />
      <section className="settings-card">
        <div className="settings-row"><div><strong>默认打开目标</strong><p>默认打开文件和文件夹的位置</p></div><span className="settings-chip">VS Code</span></div>
        <div className="settings-row"><div><strong>集成终端 Shell</strong><p>选择集成终端默认打开的 Shell。</p></div><span className="settings-chip">PowerShell</span></div>
        <div className="settings-row"><div><strong>语言</strong><p>应用 UI 语言</p></div><span className="settings-chip">中文（中国）</span></div>
        <div className="settings-row"><div><strong>线程详细信息</strong><p>选择线程中命令输出的显示量</p></div><span className="settings-chip">带代码命令的步骤</span></div>
      </section>
    </div>
  );
}

function ConfigContent(props: { onOpenConfigToml: () => Promise<void> }): JSX.Element {
  const [licensesOpen, setLicensesOpen] = useState(false);
  return (
    <div className="settings-panel-group">
      <SectionHeader title="配置" subtitle="此设置对 Codex 的所有使用场景生效" />
      <section className="settings-card settings-config-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-heading">config.toml</strong>
            <p className="settings-row-meta">编辑你的配置以自定义代理行为</p>
            <p className="settings-row-meta">编辑后重启 Codex 以应用更改 <span className="settings-inline-doc">文档 ↗</span></p>
          </div>
          <button type="button" className="settings-action-btn" onClick={() => void props.onOpenConfigToml()}>打开 config.toml</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <strong className="settings-row-heading">打开源许可证</strong>
            <p className="settings-row-meta">捆绑依赖项的第三方声明</p>
          </div>
          <button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => setLicensesOpen(true)}>查看</button>
        </div>
      </section>
      <OpenSourceLicensesDialog open={licensesOpen} onClose={() => setLicensesOpen(false)} />
    </div>
  );
}

function PersonalizationContent(): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="个性化" />
      <section className="settings-card">
        <div className="settings-row"><div><strong>个性</strong><p>选择 Codex 回复的默认语气</p></div><span className="settings-chip">务实</span></div>
      </section>
      <section className="settings-card">
        <div className="settings-block-header"><strong>自定义指令</strong><p>编辑用于将 Codex 调整至适合你需求的指令</p></div>
        <textarea className="settings-textarea" readOnly value="# Global Agent Rules\n\n## Language\n\nDefault to Chinese in user-facing replies unless the user explicitly requests another language." />
        <div className="settings-save-row"><button type="button" className="settings-save-btn">保存</button></div>
      </section>
    </div>
  );
}

function McpContent(): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="MCP 服务器" subtitle="连接外部工具和数据源。文档 ↗" />
      <section className="settings-card">
        <div className="settings-section-head"><strong>自定义服务器</strong><button type="button" className="settings-head-action">＋ 添加服务器</button></div>
        <div className="settings-row"><strong>context7</strong><div className="settings-inline-action">⚙ <ToggleControl checked /></div></div>
        <div className="settings-row"><strong>fetch</strong><div className="settings-inline-action">⚙ <ToggleControl checked /></div></div>
        <div className="settings-row"><strong>memory</strong><div className="settings-inline-action">⚙ <ToggleControl checked /></div></div>
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>推荐的服务器</strong><button type="button" className="settings-head-action">⟳ 刷新</button></div>
        {MCP_RECOMMENDED.map((server) => (
          <div key={server.name} className="settings-reco-row">
            <div className="settings-reco-avatar">◍</div>
            <div className="settings-reco-text"><strong>{server.name} <span>操作者：{server.author}</span></strong><p>{server.description}</p></div>
            {server.action === "install" ? <button type="button" className="settings-mini-btn">安装</button> : <div className="settings-inline-action">⚙ <ToggleControl checked /></div>}
          </div>
        ))}
      </section>
    </div>
  );
}

function GitContent(): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="Git" />
      <section className="settings-card">
        <div className="settings-row"><div><strong>分支前缀</strong><p>在 Codex 中创建新分支时使用的前缀</p></div><span className="settings-chip">codex/</span></div>
        <div className="settings-row"><div><strong>始终强制推送</strong><p>从 Codex 推送时使用 --force-with-lease 参数</p></div><ToggleControl /></div>
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>提交指令</strong><button type="button" className="settings-head-action">保存</button></div>
        <p className="settings-note">已添加到提交信息生成提示中</p>
        <textarea className="settings-textarea settings-textarea-sm" readOnly value="添加提交消息指引..." />
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>拉取请求指令</strong><button type="button" className="settings-head-action">保存</button></div>
        <p className="settings-note">已添加到由 Codex 创建的拉取请求正文中</p>
        <textarea className="settings-textarea settings-textarea-sm" readOnly value="添加拉取请求指引..." />
      </section>
    </div>
  );
}

function EnvironmentContent(props: { readonly roots: ReadonlyArray<WorkspaceRoot>; onAddRoot: () => void }): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="环境" />
      <section className="settings-card">
        <div className="settings-section-head"><strong>选择项目</strong><button type="button" className="settings-head-action" onClick={props.onAddRoot}>添加项目</button></div>
        <p className="settings-note">本地环境用于指示 Codex 如何为项目设置工作树。了解更多 ↗</p>
        {props.roots.map((root) => (
          <div key={root.id} className="settings-env-row">
            <div className="settings-env-main"><span className="settings-folder">▭</span><strong>{root.name}</strong><span>{root.path}</span></div>
            <button type="button" className="settings-plus-btn">＋</button>
          </div>
        ))}
        {props.roots.length === 0 ? <div className="settings-empty">暂无项目，点击“添加项目”添加工作区文件夹。</div> : null}
      </section>
    </div>
  );
}

function WorktreeContent(): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="工作树" />
      <section className="settings-card">
        <div className="settings-row"><div><strong>Automatically delete old worktrees</strong><p>Recommended for most users. Turn this off only if you want to manage old worktrees and disk usage yourself.</p></div><ToggleControl checked /></div>
        <div className="settings-row"><div><strong>Auto-delete limit</strong><p>Number of Codex-managed worktrees to keep before older ones are pruned automatically.</p></div><span className="settings-chip settings-chip-sm">15</span></div>
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>尚无工作树</strong></div>
        <p className="settings-note settings-note-pad">Codex 创建的工作树将显示在此处。</p>
      </section>
    </div>
  );
}

function PlaceholderContent(props: { readonly section: SettingsSection }): JSX.Element {
  const title = NAV_ITEMS.find((item) => item.key === props.section)?.label ?? "设置";
  return (
    <div className="settings-panel-group">
      <SectionHeader title={title} />
      <section className="settings-card"><div className="settings-placeholder">该页面按官方布局预留，后续可接入真实设置数据。</div></section>
    </div>
  );
}

function SettingsContent(props: {
  readonly section: SettingsSection;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  onAddRoot: () => void;
  onOpenConfigToml: () => Promise<void>;
}): JSX.Element {
  const { section, roots, onAddRoot, onOpenConfigToml } = props;
  if (section === "general") return <GeneralContent />;
  if (section === "config") return <ConfigContent onOpenConfigToml={onOpenConfigToml} />;
  if (section === "personalization") return <PersonalizationContent />;
  if (section === "mcp") return <McpContent />;
  if (section === "git") return <GitContent />;
  if (section === "environment") return <EnvironmentContent roots={roots} onAddRoot={onAddRoot} />;
  if (section === "worktree") return <WorktreeContent />;
  return <PlaceholderContent section={section} />;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  return (
    <div className="settings-layout">
      <SettingsSidebar section={props.section} onBackHome={props.onBackHome} onSelectSection={props.onSelectSection} />
      <main className="settings-main">
        <SettingsContent section={props.section} roots={props.roots} onAddRoot={props.onAddRoot} onOpenConfigToml={props.onOpenConfigToml} />
      </main>
    </div>
  );
}
