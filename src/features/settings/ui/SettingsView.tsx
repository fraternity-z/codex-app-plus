import type { ConfigMutationResult, McpRefreshResult } from "../config/configOperations";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { AppUpdateState, WindowsSandboxSetupState } from "../../../domain/types";
import type { ResolvedTheme } from "../../../domain/theme";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type {
  AgentEnvironment,
  CodexAuthModeStateOutput,
  CodexAuthSwitchResult,
  GlobalAgentInstructionsOutput,
  ReadProxySettingsOutput,
  UpdateProxySettingsInput,
  UpdateProxySettingsOutput,
  UpdateGlobalAgentInstructionsInput,
} from "../../../bridge/types";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type { GitWorktreeEntry } from "../../../bridge/types";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import "../../../styles/replica/replica-settings.css";
import "../../../styles/replica/replica-settings-extra.css";
import "../../../styles/replica/replica-settings-layout.css";
import { useI18n, type MessageKey } from "../../../i18n";
import { McpSettingsPanel } from "../../mcp/ui/McpSettingsPanel";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { AgentsSettingsSection } from "./AgentsSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { ComposerPermissionDefaultsCard } from "./ComposerPermissionDefaultsCard";
import { ConfigSettingsSection } from "./ConfigSettingsSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { GitSettingsSection } from "./GitSettingsSection";
import { PersonalizationSettingsSection } from "./PersonalizationSettingsSection";
import { ArchivedThreadsSettingsSection } from "./ArchivedThreadsSettingsSection";
import {
  EnvironmentContent,
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
  | "git"
  | "environment"
  | "worktree"
  | "archived"
  | "about";

export interface SettingsViewProps {
  readonly appUpdate: AppUpdateState;
  readonly section: SettingsSection;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly worktrees?: ReadonlyArray<GitWorktreeEntry>;
  readonly onCreateWorktree?: () => Promise<void>;
  readonly onDeleteWorktree?: (worktreePath: string) => Promise<void>;
  readonly preferences: AppPreferencesController;
  readonly resolvedTheme: ResolvedTheme;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly experimentalFeatures: ReadonlyArray<import("../../../protocol/generated/v2/ExperimentalFeature").ExperimentalFeature>;
  readonly steerAvailable: boolean;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly windowsSandboxSetup: WindowsSandboxSetupState;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onAddRoot: () => void;
  onOpenConfigToml: () => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  refreshAuthState: () => Promise<void>;
  login: () => Promise<void>;
  readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
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
  getCodexAuthModeState: () => Promise<CodexAuthModeStateOutput>;
  activateCodexChatgpt: () => Promise<CodexAuthSwitchResult>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listArchivedThreads: () => Promise<ReadonlyArray<import("../../../domain/types").ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  checkForAppUpdate: () => Promise<void>;
  installAppUpdate: () => Promise<void>;
}

interface NavItem {
  readonly key: SettingsSection;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEM_DEFINITIONS: ReadonlyArray<{
  readonly key: SettingsSection;
  readonly icon: string;
  readonly labelKey: MessageKey;
}> = [
  { key: "general", labelKey: "settings.nav.general", icon: "●" },
  { key: "appearance", labelKey: "settings.nav.appearance", icon: "◐" },
  { key: "config", labelKey: "settings.nav.config", icon: "⚙" },
  { key: "agents", labelKey: "settings.nav.agents", icon: "◉" },
  { key: "personalization", labelKey: "settings.nav.personalization", icon: "◌" },
  { key: "mcp", labelKey: "settings.nav.mcp", icon: "✣" },
  { key: "git", labelKey: "settings.nav.git", icon: "⑂" },
  { key: "environment", labelKey: "settings.nav.environment", icon: "◍" },
  { key: "worktree", labelKey: "settings.nav.worktree", icon: "▣" },
  { key: "archived", labelKey: "settings.nav.archived", icon: "▥" },
  { key: "about", labelKey: "settings.nav.about", icon: "ⓘ" },
];
function createNavItems(t: (key: MessageKey) => string): ReadonlyArray<NavItem> {
  return NAV_ITEM_DEFINITIONS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    icon: item.icon,
  }));
}
function SettingsSidebar(props: {
  readonly navItems: ReadonlyArray<NavItem>;
  readonly section: SettingsSection;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
}): JSX.Element {
  const { t } = useI18n();
  const getItem = (key: SettingsSection) => props.navItems.find((i) => i.key === key)!;
  const renderNavItem = (key: SettingsSection, comingSoon = false) => {
    const item = getItem(key);
    return (
      <button
        key={item.key}
        type="button"
        className={[
          "settings-nav-item",
          item.key === props.section ? "settings-nav-item-active" : "",
          comingSoon ? "settings-nav-item--coming-soon" : "",
        ].filter(Boolean).join(" ")}
        onClick={comingSoon ? undefined : () => props.onSelectSection(item.key)}
      >
        <span className="settings-nav-icon">{item.icon}</span>
        <span>{item.label}</span>
        {comingSoon && <span className="settings-nav-coming-soon-badge">Coming Soon</span>}
      </button>
    );
  };
  return (
    <aside className="settings-sidebar">
      <button type="button" className="settings-back-app" onClick={props.onBackHome}>
        ← {t("settings.sidebar.backToApp")}
      </button>
      <nav className="settings-nav">
        {renderNavItem("general")}
        {renderNavItem("appearance")}
        {renderNavItem("config")}
        {renderNavItem("agents")}
        {renderNavItem("personalization")}
        {renderNavItem("mcp")}
        {renderNavItem("git")}
        {renderNavItem("environment")}
        {renderNavItem("worktree")}
        {renderNavItem("archived")}
        {renderNavItem("about")}
      </nav>
    </aside>
  );
}

function SettingsContent(props: SettingsViewProps & { readonly sectionTitle: string }): JSX.Element {

  if (props.section === "general") {
    return (
      <>
        <GeneralSettingsSection preferences={props.preferences} steerAvailable={props.steerAvailable} />
        <ComposerPermissionDefaultsCard preferences={props.preferences} />
      </>
    );
  }
  if (props.section === "appearance") {
    return (
      <AppearanceSettingsSection
        preferences={props.preferences}
        resolvedTheme={props.resolvedTheme}
      />
    );
  }
  if (props.section === "config") {
    return (
      <>
        <ConfigSettingsSection
          agentEnvironment={props.preferences.agentEnvironment}
          busy={props.busy}
          configSnapshot={props.configSnapshot}
          onOpenConfigToml={props.onOpenConfigToml}
          onOpenExternal={props.onOpenExternal}
          refreshConfigSnapshot={props.refreshConfigSnapshot}
          refreshAuthState={props.refreshAuthState}
          login={props.login}
          readProxySettings={props.readProxySettings}
          getCodexAuthModeState={props.getCodexAuthModeState}
          activateCodexChatgpt={props.activateCodexChatgpt}
          writeProxySettings={props.writeProxySettings}
          batchWriteConfig={props.batchWriteConfig}
          writeConfigValue={props.writeConfigValue}
          windowsSandboxSetup={props.windowsSandboxSetup}
        />
      </>
    );
  }
  if (props.section === "agents") {
    return (
      <AgentsSettingsSection
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
    );
  }
  if (props.section === "personalization") {
    return (
      <PersonalizationSettingsSection
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        writeConfigValue={props.writeConfigValue}
        readGlobalAgentInstructions={props.readGlobalAgentInstructions}
        writeGlobalAgentInstructions={props.writeGlobalAgentInstructions}
      />
    );
  }
  if (props.section === "mcp") {
    return (
      <McpSettingsPanel
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        ready={props.ready}
        refreshMcpData={props.refreshMcpData}
        writeConfigValue={props.writeConfigValue}
        batchWriteConfig={props.batchWriteConfig}
      />
    );
  }
  if (props.section === "archived") {
    return <ArchivedThreadsSettingsSection ready={props.ready} listArchivedThreads={props.listArchivedThreads} unarchiveThread={props.unarchiveThread} />;
  }
  if (props.section === "about") {
    return (
      <AboutSettingsSection
        appUpdate={props.appUpdate}
        onCheckForAppUpdate={props.checkForAppUpdate}
        onInstallAppUpdate={props.installAppUpdate}
      />
    );
  }
  if (props.section === "git") {
    return <GitSettingsSection preferences={props.preferences} />;
  }
  if (props.section === "environment") {
    return <EnvironmentContent roots={props.roots} onAddRoot={props.onAddRoot} />;
  }
  if (props.section === "worktree") {
    return <WorktreeContent worktrees={props.worktrees ?? []} onCreateWorktree={props.onCreateWorktree} onDeleteWorktree={props.onDeleteWorktree} />;
  }
  return <PlaceholderContent sectionTitle={props.sectionTitle} />;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const { t } = useI18n();
  const navItems = createNavItems(t);
  const sectionTitle = navItems.find((item) => item.key === props.section)?.label ?? t("settings.nav.general");

  return (
    <div className="settings-layout">
      <SettingsSidebar
        navItems={navItems}
        section={props.section}
        onBackHome={props.onBackHome}
        onSelectSection={props.onSelectSection}
      />
      <main className="settings-main">
        <SettingsContent {...props} sectionTitle={sectionTitle} />
      </main>
    </div>
  );
}
