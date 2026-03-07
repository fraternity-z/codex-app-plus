import { useState } from "react";
import type { ConfigMutationResult, McpRefreshResult } from "../../app/configOperations";
import type { AppPreferencesController } from "../../app/useAppPreferences";
import type {
  GlobalAgentInstructionsOutput,
  UpdateGlobalAgentInstructionsInput
} from "../../bridge/types";
import type { WorkspaceRoot } from "../../app/useWorkspaceRoots";
import type { ConfigBatchWriteParams } from "../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../protocol/generated/v2/ConfigValueWriteParams";
import { OpenSourceLicensesDialog } from "./OpenSourceLicensesDialog";
import { McpSettingsPanel } from "./mcp/McpSettingsPanel";
import { GeneralSettingsSection } from "./settings/GeneralSettingsSection";
import { PersonalizationSettingsSection } from "./settings/PersonalizationSettingsSection";

export type SettingsSection = "general" | "config" | "personalization" | "mcp" | "git" | "environment" | "worktree" | "archived";

interface SettingsViewProps {
  readonly section: SettingsSection;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly preferences: AppPreferencesController;
  readonly configSnapshot: unknown;
  readonly busy: boolean;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onAddRoot: () => void;
  onOpenConfigToml: () => Promise<void>;
  readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
  writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
}

interface NavItem {
  readonly key: SettingsSection;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "general", label: "常规", icon: "●" },
  { key: "config", label: "配置", icon: "⌘" },
  { key: "personalization", label: "个性化", icon: "◐" },
  { key: "mcp", label: "MCP 服务器", icon: "✦" },
  { key: "git", label: "Git", icon: "⑂" },
  { key: "environment", label: "环境", icon: "◌" },
  { key: "worktree", label: "工作树", icon: "▦" },
  { key: "archived", label: "已归档线程", icon: "▤" }
];

function SectionHeader(props: { readonly title: string; readonly subtitle?: string }): JSX.Element {
  return (
    <header className="settings-title-wrap">
      <h1 className="settings-page-title">{props.title}</h1>
      {props.subtitle ? <p className="settings-subtitle">{props.subtitle}</p> : null}
    </header>
  );
}

function ToggleControl(props: { readonly checked?: boolean }): JSX.Element {
  return <span className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}><span className="settings-toggle-knob" /></span>;
}

function SettingsSidebar(props: { readonly section: SettingsSection; onBackHome: () => void; onSelectSection: (section: SettingsSection) => void }): JSX.Element {
  return (
    <aside className="settings-sidebar">
      <button type="button" className="settings-back-app" onClick={props.onBackHome}>← 返回应用</button>
      <nav className="settings-nav">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} type="button" className={item.key === props.section ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"} onClick={() => props.onSelectSection(item.key)}>
            <span className="settings-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function ConfigContent(props: { readonly onOpenConfigToml: () => Promise<void> }): JSX.Element {
  const [licensesOpen, setLicensesOpen] = useState(false);
  return (
    <div className="settings-panel-group">
      <SectionHeader title="配置" subtitle="查看当前配置文件，并检查第三方许可信息。" />
      <section className="settings-card settings-config-card">
        <div className="settings-row"><div className="settings-row-copy"><div className="settings-row-heading">用户配置</div><p className="settings-row-meta">打开 `~/.codex/config.toml`。</p></div><button type="button" className="settings-action-btn" onClick={() => void props.onOpenConfigToml()}>打开配置文件</button></div>
        <div className="settings-row"><div className="settings-row-copy"><div className="settings-row-heading">开源许可</div><p className="settings-row-meta">查看当前桌面端打包的第三方许可清单。</p></div><button type="button" className="settings-action-btn" onClick={() => setLicensesOpen(true)}>查看许可</button></div>
      </section>
      <OpenSourceLicensesDialog open={licensesOpen} onClose={() => setLicensesOpen(false)} />
    </div>
  );
}

function GitContent(): JSX.Element {
  return <div className="settings-panel-group"><SectionHeader title="Git" /><section className="settings-card"><div className="settings-row"><div><strong>分支前缀</strong><p>在 Codex 中创建新分支时使用的前缀。</p></div><span className="settings-chip">codex/</span></div><div className="settings-row"><div><strong>推送时强制 lease</strong><p>推送时附带 `--force-with-lease`。</p></div><ToggleControl /></div></section></div>;
}

function EnvironmentContent(props: { readonly roots: ReadonlyArray<WorkspaceRoot>; onAddRoot: () => void }): JSX.Element {
  return (
    <div className="settings-panel-group">
      <SectionHeader title="环境" />
      <section className="settings-card">
        <div className="settings-section-head"><strong>工作区</strong><button type="button" className="settings-head-action" onClick={props.onAddRoot}>添加项目</button></div>
        <p className="settings-note">选择要在 Codex 中使用的本地项目目录。</p>
        {props.roots.map((root) => <div key={root.id} className="settings-env-row"><div className="settings-env-main"><span className="settings-folder">▣</span><strong>{root.name}</strong><span>{root.path}</span></div></div>)}
        {props.roots.length === 0 ? <div className="settings-empty">暂无项目，点击“添加项目”后即可在侧边栏中切换工作区。</div> : null}
      </section>
    </div>
  );
}

function WorktreeContent(): JSX.Element {
  return <div className="settings-panel-group"><SectionHeader title="工作树" /><section className="settings-card"><div className="settings-row"><div><strong>自动清理旧工作树</strong><p>超过保留数量时自动移除较旧的 Codex 工作树。</p></div><ToggleControl checked /></div><div className="settings-row"><div><strong>保留上限</strong><p>自动清理前最多保留的工作树数量。</p></div><span className="settings-chip settings-chip-sm">15</span></div></section></div>;
}

function PlaceholderContent(props: { readonly section: SettingsSection }): JSX.Element {
  const title = NAV_ITEMS.find((item) => item.key === props.section)?.label ?? "设置";
  return <div className="settings-panel-group"><SectionHeader title={title} /><section className="settings-card"><div className="settings-placeholder">该页面仍保留官方布局占位，后续可接入真实设置数据。</div></section></div>;
}

function SettingsContent(props: SettingsViewProps): JSX.Element {
  if (props.section === "general") return <GeneralSettingsSection preferences={props.preferences} />;
  if (props.section === "config") return <ConfigContent onOpenConfigToml={props.onOpenConfigToml} />;
  if (props.section === "personalization") {
    return (
      <PersonalizationSettingsSection
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        readGlobalAgentInstructions={props.readGlobalAgentInstructions}
        writeGlobalAgentInstructions={props.writeGlobalAgentInstructions}
      />
    );
  }
  if (props.section === "mcp") return <McpSettingsPanel busy={props.busy} configSnapshot={props.configSnapshot} refreshMcpData={props.refreshMcpData} writeConfigValue={props.writeConfigValue} batchWriteConfig={props.batchWriteConfig} />;
  if (props.section === "git") return <GitContent />;
  if (props.section === "environment") return <EnvironmentContent roots={props.roots} onAddRoot={props.onAddRoot} />;
  if (props.section === "worktree") return <WorktreeContent />;
  return <PlaceholderContent section={props.section} />;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  return (
    <div className="settings-layout">
      <SettingsSidebar section={props.section} onBackHome={props.onBackHome} onSelectSection={props.onSelectSection} />
      <main className="settings-main">
        <SettingsContent {...props} />
      </main>
    </div>
  );
}
