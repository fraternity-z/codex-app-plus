import type { ConfigMutationResult, McpRefreshResult } from "../config/configOperations";
import type { AppPreferencesController } from "../hooks/useAppPreferences";
import type { WindowsSandboxSetupState } from "../../../domain/types";
import type {
  CodexProviderApplyResult,
  CodexProviderDraft,
  CodexProviderRecord,
  CodexProviderStore,
  DeleteCodexProviderInput,
  GlobalAgentInstructionsOutput,
  UpdateGlobalAgentInstructionsInput,
} from "../../../bridge/types";
import type { WorkspaceRoot } from "../../workspace/hooks/useWorkspaceRoots";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";
import "../../../styles/replica/replica-settings.css";
import "../../../styles/replica/replica-settings-extra.css";
import "../../../styles/replica/replica-settings-layout.css";
import { useI18n, type MessageKey } from "../../../i18n";
import { McpSettingsPanel } from "../../mcp/ui/McpSettingsPanel";
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
  | "config"
  | "personalization"
  | "mcp"
  | "git"
  | "environment"
  | "worktree"
  | "archived";

export interface SettingsViewProps {
  readonly section: SettingsSection;
  readonly roots: ReadonlyArray<WorkspaceRoot>;
  readonly preferences: AppPreferencesController;
  readonly configSnapshot: unknown;
  readonly busy: boolean;
  readonly windowsSandboxSetup: WindowsSandboxSetupState;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
  onAddRoot: () => void;
  onOpenConfigToml: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<ConfigReadResponse>;
  refreshAuthState: () => Promise<void>;
  readGlobalAgentInstructions: () => Promise<GlobalAgentInstructionsOutput>;
  writeGlobalAgentInstructions: (
    input: UpdateGlobalAgentInstructionsInput
  ) => Promise<GlobalAgentInstructionsOutput>;
  listCodexProviders: () => Promise<CodexProviderStore>;
  upsertCodexProvider: (input: CodexProviderDraft) => Promise<CodexProviderRecord>;
  deleteCodexProvider: (input: DeleteCodexProviderInput) => Promise<CodexProviderStore>;
  applyCodexProvider: (input: { readonly id: string }) => Promise<CodexProviderApplyResult>;
  refreshMcpData: () => Promise<McpRefreshResult>;
  listArchivedThreads: () => Promise<ReadonlyArray<import("../../../domain/types").ThreadSummary>>;
  unarchiveThread: (threadId: string) => Promise<void>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  readonly startWindowsSandboxSetup: (mode: WindowsSandboxSetupMode) => Promise<unknown>;
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
  { key: "config", labelKey: "settings.nav.config", icon: "⚙" },
  { key: "personalization", labelKey: "settings.nav.personalization", icon: "◌" },
  { key: "mcp", labelKey: "settings.nav.mcp", icon: "✣" },
  { key: "git", labelKey: "settings.nav.git", icon: "⑂" },
  { key: "environment", labelKey: "settings.nav.environment", icon: "◍" },
  { key: "worktree", labelKey: "settings.nav.worktree", icon: "▣" },
  { key: "archived", labelKey: "settings.nav.archived", icon: "▥" },
];
function createNavItems(t: (key: MessageKey) => string): ReadonlyArray<NavItem> {
  return NAV_ITEM_DEFINITIONS.map((item) => ({
    key: item.key,
    label: t(item.labelKey),
    icon: item.icon,
  }));
}
function SettingsSidebar(props: {
  readonly section: SettingsSection;
  onBackHome: () => void;
  onSelectSection: (section: SettingsSection) => void;
}): JSX.Element {
  const { t } = useI18n();
  const navItems = createNavItems(t);
  return (
    <aside className="settings-sidebar">
      <button type="button" className="settings-back-app" onClick={props.onBackHome}>
        ← {t("settings.sidebar.backToApp")}
      </button>
      <nav className="settings-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === props.section ? "settings-nav-item settings-nav-item-active" : "settings-nav-item"}
            onClick={() => props.onSelectSection(item.key)}
          >
            <span className="settings-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function SettingsContent(props: SettingsViewProps): JSX.Element {
  const { t } = useI18n();
  const sectionTitle = createNavItems(t).find((item) => item.key === props.section)?.label ?? t("settings.nav.general");

  if (props.section === "general") {
    return <GeneralSettingsSection preferences={props.preferences} />;
  }
  if (props.section === "config") {
    return (
      <ConfigSettingsSection
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        onOpenConfigToml={props.onOpenConfigToml}
        refreshConfigSnapshot={props.refreshConfigSnapshot}
        refreshAuthState={props.refreshAuthState}
        listCodexProviders={props.listCodexProviders}
        upsertCodexProvider={props.upsertCodexProvider}
        deleteCodexProvider={props.deleteCodexProvider}
        applyCodexProvider={props.applyCodexProvider}
        windowsSandboxSetup={props.windowsSandboxSetup}
        startWindowsSandboxSetup={props.startWindowsSandboxSetup}
      />
    );
  }
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
  if (props.section === "mcp") {
    return (
      <McpSettingsPanel
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        refreshMcpData={props.refreshMcpData}
        writeConfigValue={props.writeConfigValue}
        batchWriteConfig={props.batchWriteConfig}
      />
    );
  }
  if (props.section === "archived") {
    return <ArchivedThreadsSettingsSection listArchivedThreads={props.listArchivedThreads} unarchiveThread={props.unarchiveThread} />;
  }
  if (props.section === "git") {
    return <GitSettingsSection preferences={props.preferences} />;
  }
  if (props.section === "environment") {
    return <EnvironmentContent roots={props.roots} onAddRoot={props.onAddRoot} />;
  }
  if (props.section === "worktree") {
    return <WorktreeContent />;
  }
  return <PlaceholderContent sectionTitle={sectionTitle} />;
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
