import type { ConfigMutationResult, ConfigSnapshotMutationResult, McpRefreshResult } from "../config/configOperations";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { AppUpdateState } from "../../../domain/types";
import type { ResolvedTheme } from "../../../domain/theme";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type {
  AgentEnvironment,
  GlobalAgentInstructionsOutput,
  ManagedPromptOutput,
  ReadProxySettingsOutput,
  ReadMcpSharedPoolSettingsOutput,
  UpsertManagedPromptInput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
  UpdateMcpSharedPoolSettingsInput,
  UpdateMcpSharedPoolSettingsOutput,
  UpdateGlobalAgentInstructionsInput,
  BrowserUseApprovalMode,
  BrowserBrowsingDataKind,
  BrowserUseOriginKind,
  BrowserUseSettingsOutput,
  CustomPetsOutput,
  WriteProjectPermissionConfigInput,
} from "../../../bridge/types";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type { GitWorktreeEntry } from "../../../bridge/types";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { ThreadMemoryMode } from "../../../protocol/generated/ThreadMemoryMode";
import "../../../styles/replica/replica-settings.css";
import "../../../styles/replica/replica-settings-extra.css";
import "../../../styles/replica/replica-settings-layout.css";
import { useI18n, type MessageKey } from "../../../i18n";
import { McpSettingsPanel } from "../../mcp/ui/McpSettingsPanel";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { AgentsSettingsSection } from "./AgentsSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { BrowserUseSettingsSection } from "./BrowserUseSettingsSection";
import { ConfigSettingsSection } from "./ConfigSettingsSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { GitSettingsSection } from "./GitSettingsSection";
import { PersonalizationSettingsSection } from "./PersonalizationSettingsSection";
import { ProxySettingsCard } from "./ProxySettingsCard";
import { SettingsNavIcon, type SettingsNavIconKind } from "./settingsNavIcons";
import {
  ConnectionsPlaceholderContent,
  EnvironmentContent,
  HooksPlaceholderContent,
  PlaceholderContent,
  WorktreeContent,
} from "./SettingsStaticSections";
export type SettingsSection =
  | "general"
  | "appearance"
  | "config"
  | "agents"
  | "personalization"
  | "mcp"
  | "hooks"
  | "connections"
  | "git"
  | "environment"
  | "worktree"
  | "browserUse"
  | "about";

export interface SettingsViewProps {
  readonly appUpdate: AppUpdateState;
  readonly section: SettingsSection;
  readonly sidebarCollapsed: boolean;
  readonly sidebarWidth?: number;
  readonly sidebarResizing?: boolean;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly selectedRoot: WorkspaceRoot | null;
  readonly worktrees?: ReadonlyArray<GitWorktreeEntry>;
  readonly onCreateWorktree?: () => Promise<void>;
  readonly onDeleteWorktree?: (worktreePath: string) => Promise<void>;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly selectedConversationId: string | null;
  readonly experimentalFeatures: ReadonlyArray<import("../../../protocol/generated/v2/ExperimentalFeature").ExperimentalFeature>;
  readonly steerAvailable: boolean;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly onTestNotificationSound?: () => void;
  readonly onTestSystemNotification?: () => void;
  readonly notificationTestFeedback?: {
    readonly tone: "success" | "error";
    readonly message: string;
  } | null;
  readonly petAwake: boolean;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onSidebarResizeStart?: (event: ReactMouseEvent) => void;
  onAddRoot: () => void;
  onTogglePetAwake: () => void;
  onOpenConfigToml: (filePath?: string | null) => Promise<void>;
  onOpenConfigDocs: () => Promise<void>;
  onOpenMcpDocs: () => Promise<void>;
  writeProjectPermissionConfig: (input: WriteProjectPermissionConfigInput) => Promise<unknown>;
  refreshConfigSnapshot: (cwd?: string | null) => Promise<ConfigReadResponse>;
  readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
  listCustomPets: () => Promise<CustomPetsOutput>;
  openCustomPetsFolder: (path: string) => Promise<void>;
  listManagedPrompts: () => Promise<ReadonlyArray<ManagedPromptOutput>>;
  upsertManagedPrompt: (
    input: Omit<UpsertManagedPromptInput, "agentEnvironment">
  ) => Promise<ManagedPromptOutput>;
  deleteManagedPrompt: (name: string) => Promise<void>;
  setUserModelInstructionsFile: (path: string | null) => Promise<void>;
  getAgentsSettings: () => Promise<import("../../../bridge/types").AgentsSettingsOutput>;
  createAgent: (input: import("../../../bridge/types").CreateAgentInput) => Promise<import("../../../bridge/types").AgentsSettingsOutput>;
  updateAgent: (input: import("../../../bridge/types").UpdateAgentInput) => Promise<import("../../../bridge/types").AgentsSettingsOutput>;
  deleteAgent: (input: import("../../../bridge/types").DeleteAgentInput) => Promise<import("../../../bridge/types").AgentsSettingsOutput>;
  readAgentConfig: (name: string) => Promise<import("../../../bridge/types").ReadAgentConfigOutput>;
  writeAgentConfig: (name: string, content: string) => Promise<import("../../../bridge/types").WriteAgentConfigOutput>;
  readProxySettings: (input: { readonly agentEnvironment: AgentEnvironment }) => Promise<ReadProxySettingsOutput>;
  writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
  writeProxySettings: (input: UpdateProxySettingsInput) => Promise<UpdateProxySettingsOutput>;
  readMcpSharedPoolSettings: (input: { readonly agentEnvironment: AgentEnvironment }) => Promise<ReadMcpSharedPoolSettingsOutput>;
  writeMcpSharedPoolSettings: (input: UpdateMcpSharedPoolSettingsInput) => Promise<UpdateMcpSharedPoolSettingsOutput>;
  readBrowserUseSettings: () => Promise<BrowserUseSettingsOutput>;
  writeBrowserUseApprovalMode: (
    input: { readonly approvalMode: BrowserUseApprovalMode }
  ) => Promise<BrowserUseSettingsOutput>;
  addBrowserUseOrigin: (
    input: { readonly kind: BrowserUseOriginKind; readonly origin: string }
  ) => Promise<BrowserUseSettingsOutput>;
  removeBrowserUseOrigin: (
    input: { readonly kind: BrowserUseOriginKind; readonly origin: string }
  ) => Promise<BrowserUseSettingsOutput>;
  clearBrowserBrowsingData: () => Promise<void>;
  clearBrowserBrowsingDataByKind: (
    input: { readonly kind: BrowserBrowsingDataKind }
  ) => Promise<void>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listArchivedThreads: () => Promise<ReadonlyArray<import("../../../domain/types").ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>;
  setThreadMemoryMode: (threadId: string, mode: ThreadMemoryMode) => Promise<void>;
  resetMemories: () => Promise<void>;
  checkForAppUpdate: () => Promise<void>;
  installAppUpdate: () => Promise<void>;
}

interface NavItem {
  readonly key: SettingsSection;
  readonly label: string;
  readonly icon: SettingsNavIconKind;
}

const NAV_ITEM_DEFINITIONS: ReadonlyArray<{
  readonly key: SettingsSection;
  readonly icon: SettingsNavIconKind;
  readonly labelKey: MessageKey;
}> = [
  { key: "general", labelKey: "settings.nav.general", icon: "general" },
  { key: "appearance", labelKey: "settings.nav.appearance", icon: "appearance" },
  { key: "config", labelKey: "settings.nav.config", icon: "config" },
  { key: "personalization", labelKey: "settings.nav.personalization", icon: "personalization" },
  { key: "mcp", labelKey: "settings.nav.mcp", icon: "mcp" },
  { key: "hooks", labelKey: "settings.nav.hooks", icon: "hooks" },
  { key: "connections", labelKey: "settings.nav.connections", icon: "connections" },
  { key: "git", labelKey: "settings.nav.git", icon: "git" },
  { key: "environment", labelKey: "settings.nav.environment", icon: "environment" },
  { key: "worktree", labelKey: "settings.nav.worktree", icon: "worktree" },
  { key: "browserUse", labelKey: "settings.nav.browserUse", icon: "browserUse" },
  { key: "about", labelKey: "settings.nav.about", icon: "about" },
];
function createNavItems(t: (key: MessageKey) => string): ReadonlyArray<NavItem> {
  return NAV_ITEM_DEFINITIONS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    icon: item.icon,
  }));
}

function resolveVisibleSection(section: SettingsSection): Exclude<SettingsSection, "agents"> {
  return section === "agents" ? "config" : section;
}

function SettingsSidebar(props: {
  readonly backToAppLabel: string;
  readonly collapsed: boolean;
  readonly navItems: ReadonlyArray<NavItem>;
  readonly section: SettingsSection;
  readonly sidebarResizing?: boolean;
  onBackHome: () => void;
  onSidebarResizeStart?: (event: ReactMouseEvent) => void;
  onSelectSection: (section: SettingsSection) => void;
}): JSX.Element {
  const activeSection = resolveVisibleSection(props.section);
  const getItem = (key: SettingsSection) => props.navItems.find((i) => i.key === key)!;
  const renderNavItem = (key: SettingsSection, comingSoon = false) => {
    const item = getItem(key);
    return (
      <button
        key={item.key}
        type="button"
        className={[
          "settings-nav-item",
          item.key === activeSection ? "settings-nav-item-active" : "",
          comingSoon ? "settings-nav-item--coming-soon" : "",
        ].filter(Boolean).join(" ")}
        onClick={comingSoon ? undefined : () => props.onSelectSection(item.key)}
      >
        <span className="settings-nav-icon"><SettingsNavIcon className="settings-nav-icon-svg" kind={item.icon} /></span>
        <span>{item.label}</span>
        {comingSoon && <span className="settings-nav-coming-soon-badge">Coming Soon</span>}
      </button>
    );
  };
  const resizeClassName = props.sidebarResizing === true
    ? "replica-sidebar-resize replica-sidebar-resize-active"
    : "replica-sidebar-resize";
  return (
    <aside className="settings-sidebar" aria-hidden={props.collapsed}>
      {props.onSidebarResizeStart === undefined ? null : (
        <div
          className={resizeClassName}
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动以调整侧边栏宽度"
          onMouseDown={props.onSidebarResizeStart}
        />
      )}
      <button type="button" className="settings-back-app" onClick={props.onBackHome}>
        <span aria-hidden="true">←</span>
        <span>{props.backToAppLabel}</span>
      </button>
      <nav className="settings-nav">
        {renderNavItem("general")}
        {renderNavItem("appearance")}
        {renderNavItem("config")}
        {renderNavItem("personalization")}
        {renderNavItem("mcp")}
        {renderNavItem("hooks")}
        {renderNavItem("connections")}
        {renderNavItem("git")}
        {renderNavItem("environment")}
        {renderNavItem("worktree")}
        {renderNavItem("browserUse")}
      </nav>
    </aside>
  );
}

function SettingsContent(props: SettingsViewProps & { readonly sectionTitle: string }): JSX.Element {
  const section = resolveVisibleSection(props.section);

  if (section === "general") {
    return (
      <div className="settings-panel-group settings-general-page">
        <GeneralSettingsSection
          preferences={props.preferences}
          steerAvailable={props.steerAvailable}
          runtimeSettings={
            <ProxySettingsCard
              agentEnvironment={props.preferences.agentEnvironment}
              busy={props.busy}
              readProxySettings={props.readProxySettings}
              writeProxySettings={props.writeProxySettings}
            />
          }
          onTestNotificationSound={props.onTestNotificationSound}
          onTestSystemNotification={props.onTestSystemNotification}
          notificationTestFeedback={props.notificationTestFeedback}
        />
      </div>
    );
  }
  if (section === "appearance") {
    return (
      <AppearanceSettingsSection
        busy={props.busy}
        preferences={props.preferences}
        resolvedTheme={props.resolvedTheme}
        petAwake={props.petAwake}
        listCustomPets={props.listCustomPets}
        openCustomPetsFolder={props.openCustomPetsFolder}
        onTogglePetAwake={props.onTogglePetAwake}
      />
    );
  }
  if (section === "config") {
    return (
      <>
        <ConfigSettingsSection
          preferences={props.preferences}
          agentEnvironment={props.preferences.agentEnvironment}
          configSnapshot={props.configSnapshot}
          selectedRoot={props.selectedRoot}
          onOpenConfigToml={props.onOpenConfigToml}
          onOpenConfigDocs={props.onOpenConfigDocs}
          writeProjectPermissionConfig={props.writeProjectPermissionConfig}
          refreshConfigSnapshot={props.refreshConfigSnapshot}
          batchWriteConfigSnapshot={props.batchWriteConfigSnapshot}
        />
        <AgentsSettingsSection
          embedded
          busy={props.busy}
          configSnapshot={props.configSnapshot}
          experimentalFeatures={props.experimentalFeatures}
          onOpenConfigToml={props.onOpenConfigToml}
          refreshConfigSnapshot={props.refreshConfigSnapshot}
          getAgentsSettings={props.getAgentsSettings}
          createAgent={props.createAgent}
          updateAgent={props.updateAgent}
          deleteAgent={props.deleteAgent}
          readAgentConfig={props.readAgentConfig}
          writeAgentConfig={props.writeAgentConfig}
          batchWriteConfig={props.batchWriteConfig}
        />
      </>
    );
  }
  if (section === "personalization") {
    return (
      <PersonalizationSettingsSection
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        selectedConversationId={props.selectedConversationId}
        writeConfigValue={props.writeConfigValue}
        batchWriteConfigSnapshot={props.batchWriteConfigSnapshot}
        setThreadMemoryMode={props.setThreadMemoryMode}
        resetMemories={props.resetMemories}
        readGlobalAgentInstructions={props.readGlobalAgentInstructions}
        listManagedPrompts={props.listManagedPrompts}
        upsertManagedPrompt={props.upsertManagedPrompt}
        deleteManagedPrompt={props.deleteManagedPrompt}
        setUserModelInstructionsFile={props.setUserModelInstructionsFile}
        refreshConfigSnapshot={props.refreshConfigSnapshot}
        writeGlobalAgentInstructions={props.writeGlobalAgentInstructions}
      />
    );
  }
  if (section === "mcp") {
    return (
      <McpSettingsPanel
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        agentEnvironment={props.preferences.agentEnvironment}
        ready={props.ready}
        readMcpSharedPoolSettings={props.readMcpSharedPoolSettings}
        writeMcpSharedPoolSettings={props.writeMcpSharedPoolSettings}
        refreshMcpData={props.refreshMcpData}
        writeConfigValue={props.writeConfigValue}
        batchWriteConfig={props.batchWriteConfig}
        onOpenMcpDocs={props.onOpenMcpDocs}
      />
    );
  }
  if (section === "hooks") {
    return <HooksPlaceholderContent />;
  }
  if (section === "connections") {
    return <ConnectionsPlaceholderContent />;
  }
  if (section === "about") {
    return (
      <AboutSettingsSection
        appUpdate={props.appUpdate}
        onCheckForAppUpdate={props.checkForAppUpdate}
        onInstallAppUpdate={props.installAppUpdate}
      />
    );
  }
  if (section === "git") {
    return <GitSettingsSection preferences={props.preferences} />;
  }
  if (section === "environment") {
    return <EnvironmentContent roots={props.roots} ready={props.ready} onAddRoot={props.onAddRoot} listArchivedThreads={props.listArchivedThreads} unarchiveThread={props.unarchiveThread} />;
  }
  if (section === "worktree") {
    return <WorktreeContent worktrees={props.worktrees ?? []} onCreateWorktree={props.onCreateWorktree} onDeleteWorktree={props.onDeleteWorktree} />;
  }
  if (section === "browserUse") {
    return (
      <BrowserUseSettingsSection
        readBrowserUseSettings={props.readBrowserUseSettings}
        writeBrowserUseApprovalMode={props.writeBrowserUseApprovalMode}
        addBrowserUseOrigin={props.addBrowserUseOrigin}
        removeBrowserUseOrigin={props.removeBrowserUseOrigin}
        clearBrowserBrowsingData={props.clearBrowserBrowsingData}
        clearBrowserBrowsingDataByKind={props.clearBrowserBrowsingDataByKind}
      />
    );
  }
  return <PlaceholderContent sectionTitle={props.sectionTitle} />;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const { t } = useI18n();
  const navItems = createNavItems(t);
  const visibleSection = resolveVisibleSection(props.section);
  const sectionTitle = navItems.find((item) => item.key === visibleSection)?.label ?? t("settings.nav.general");
  const layoutClassName = [
    "settings-layout",
    props.sidebarCollapsed ? "settings-layout-sidebar-collapsed" : "",
    props.sidebarResizing === true ? "settings-layout-sidebar-resizing" : "",
  ].filter(Boolean).join(" ");
  const layoutStyle = props.sidebarWidth === undefined
    ? undefined
    : ({ ["--replica-sidebar-width" as "width"]: `${props.sidebarWidth}px` } as CSSProperties);

  return (
    <div className={layoutClassName} style={layoutStyle}>
      <SettingsSidebar
        backToAppLabel={t("settings.sidebar.backToApp")}
        collapsed={props.sidebarCollapsed}
        navItems={navItems}
        section={props.section}
        sidebarResizing={props.sidebarResizing}
        onBackHome={props.onBackHome}
        onSidebarResizeStart={props.onSidebarResizeStart}
        onSelectSection={props.onSelectSection}
      />
      <main className="settings-main">
        <SettingsContent {...props} sectionTitle={sectionTitle} />
      </main>
    </div>
  );
}
