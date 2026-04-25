import type { ReceivedNotification } from "../../../domain/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { ConfigWriteResponse } from "../../../protocol/generated/v2/ConfigWriteResponse";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import type { PluginInstallParams } from "../../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
import type { PluginReadParams } from "../../../protocol/generated/v2/PluginReadParams";
import type { PluginReadResponse } from "../../../protocol/generated/v2/PluginReadResponse";
import type { PluginUninstallParams } from "../../../protocol/generated/v2/PluginUninstallParams";
import type { PluginUninstallResponse } from "../../../protocol/generated/v2/PluginUninstallResponse";
import type { SkillsConfigWriteParams } from "../../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import { useI18n } from "../../../i18n";
import type { ConfigMutationResult } from "../../settings/config/configOperations";
import "../../../styles/replica/replica-skills.css";
import {
  useSkillsViewModel,
  type ManagedAppCard,
  type ManagedMcpServerCard,
  type SkillsManagementTab,
} from "../hooks/useSkillsViewModel";
import type { InstalledSkillCard, MarketplaceFilterOption, MarketplacePluginCard } from "../model/skillCatalog";
import { SkillAvatar } from "./SkillAvatar";

type PluginStatusFilter = "all" | "installed" | "available";

export interface SkillsViewProps {
  readonly configSnapshot: ConfigReadResponse | null;
  readonly mcpServerStatuses: ReadonlyArray<McpServerStatus>;
  readonly ready?: boolean;
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly onOpenMcpSettings?: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly onTryPlugin: (plugin: MarketplacePluginCard) => void;
  readonly listMcpServerStatuses: () => Promise<ReadonlyArray<McpServerStatus>>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly readMarketplacePlugin: (params: PluginReadParams) => Promise<PluginReadResponse>;
  readonly setAppEnabled: (appId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
  readonly uninstallMarketplacePlugin: (params: PluginUninstallParams) => Promise<PluginUninstallResponse>;
  readonly setMarketplacePluginEnabled: (pluginId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
}

export function SkillsView(props: SkillsViewProps): JSX.Element {
  const model = useSkillsViewModel({
    configSnapshot: props.configSnapshot,
    mcpServerStatuses: props.mcpServerStatuses,
    ready: props.ready,
    selectedRootPath: props.selectedRootPath,
    notifications: props.notifications,
    listMcpServerStatuses: props.listMcpServerStatuses,
    listSkills: props.listSkills,
    listMarketplacePlugins: props.listMarketplacePlugins,
    readMarketplacePlugin: props.readMarketplacePlugin,
    setAppEnabled: props.setAppEnabled,
    writeSkillConfig: props.writeSkillConfig,
    writeConfigValue: props.writeConfigValue,
    installMarketplacePlugin: props.installMarketplacePlugin,
    uninstallMarketplacePlugin: props.uninstallMarketplacePlugin,
    setMarketplacePluginEnabled: props.setMarketplacePluginEnabled,
  });

  return (
    <div className="skills-page">
      <div className={model.managerOpen ? "skills-shell skills-shell-manager" : "skills-shell"}>
        {model.managerOpen ? (
          <SkillsManager
            actionError={model.actionError}
            apps={model.managedApps}
            appsError={model.appsError}
            counts={model.managementCounts}
            loadingApps={model.loadingApps}
            loadingMcpServers={model.loadingMcpServers}
            loadingPlugins={model.loadingMarketplace}
            loadingSkills={model.loadingInstalled}
            marketplaceError={model.marketplaceError}
            mcpServers={model.managedMcpServers}
            mcpServersError={model.mcpServersError}
            pendingAppIds={model.pendingAppIds}
            pendingMcpServerIds={model.pendingMcpServerIds}
            pendingPaths={model.pendingPaths}
            pendingPluginIds={model.pendingPluginIds}
            plugins={model.managedPlugins}
            query={model.managementQuery}
            ready={props.ready !== false}
            skills={model.managedSkills}
            skillsError={model.installedError}
            tab={model.managementTab}
            onClose={() => model.setManagerOpen(false)}
            onOpenMcpSettings={props.onOpenMcpSettings}
            onQueryChange={model.setManagementQuery}
            onTabChange={model.setManagementTab}
            onToggleApp={model.toggleAppEnabled}
            onToggleMcpServer={model.toggleMcpServerEnabled}
            onTogglePlugin={model.toggleMarketplacePluginEnabled}
            onToggleSkill={model.toggleSkillEnabled}
          />
        ) : (
          <>
            <SkillsToolbar
              activeTab={model.activeTab}
              marketplaceFilter={model.marketplaceFilter}
              marketplaceOptions={model.marketplaceOptions}
              pluginStatusFilter={model.pluginStatusFilter}
              query={model.query}
              refreshPending={model.refreshPending}
              ready={props.ready !== false}
              onMarketplaceFilterChange={model.setMarketplaceFilter}
              onOpenManager={() => model.setManagerOpen(true)}
              onPluginStatusFilterChange={model.setPluginStatusFilter}
              onQueryChange={model.setQuery}
              onRefresh={model.refresh}
              onTabChange={model.setActiveTab}
            />
            <main className="skills-main">
              {model.activeTab === "plugins" ? (
                <PluginMarketplace
                  actionError={model.actionError}
                  error={model.marketplaceError}
                  loading={model.loadingMarketplace}
                  pendingPluginIds={model.pendingPluginIds}
                  plugins={model.marketplacePlugins}
                  onInstallPlugin={model.installMarketplacePluginCard}
                  onTogglePluginEnabled={model.toggleMarketplacePluginEnabled}
                  onTryPlugin={props.onTryPlugin}
                  onUninstallPlugin={model.uninstallMarketplacePluginCard}
                />
              ) : (
                <InstalledSkillsSection
                  actionError={model.actionError}
                  installedError={model.installedError}
                  loading={model.loadingInstalled}
                  pendingPaths={model.pendingPaths}
                  scanErrors={model.scanErrors}
                  skills={model.installedSkills}
                  onToggleSkillEnabled={model.toggleSkillEnabled}
                />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}

function SkillsToolbar(props: {
  readonly activeTab: "plugins" | "skills";
  readonly marketplaceFilter: string;
  readonly marketplaceOptions: ReadonlyArray<MarketplaceFilterOption>;
  readonly pluginStatusFilter: PluginStatusFilter;
  readonly query: string;
  readonly refreshPending: boolean;
  readonly ready: boolean;
  readonly onMarketplaceFilterChange: (value: string) => void;
  readonly onOpenManager: () => void;
  readonly onPluginStatusFilterChange: (value: PluginStatusFilter) => void;
  readonly onQueryChange: (value: string) => void;
  readonly onRefresh: () => Promise<void>;
  readonly onTabChange: (value: "plugins" | "skills") => void;
}): JSX.Element {
  const { t } = useI18n();
  const searchPlaceholder = props.activeTab === "plugins"
    ? t("home.skills.searchPlugins")
    : t("home.skills.searchSkills");
  return (
    <header className="skills-toolbar">
      <div className="skills-toolbar-top">
        <div className="skills-mode-tabs" role="tablist" aria-label={t("home.skills.tabs.label")}>
          <button
            type="button"
            className={props.activeTab === "plugins" ? "skills-mode-tab skills-mode-tab-active" : "skills-mode-tab"}
            role="tab"
            aria-selected={props.activeTab === "plugins"}
            onClick={() => props.onTabChange("plugins")}
          >
            {t("home.skills.tabs.plugins")}
          </button>
          <button
            type="button"
            className={props.activeTab === "skills" ? "skills-mode-tab skills-mode-tab-active" : "skills-mode-tab"}
            role="tab"
            aria-selected={props.activeTab === "skills"}
            onClick={() => props.onTabChange("skills")}
          >
            {t("home.skills.tabs.skills")}
          </button>
        </div>
        <div className="skills-toolbar-actions">
          <button
            type="button"
            className="skills-quiet-button"
            disabled={!props.ready}
            onClick={props.onOpenManager}
          >
            <GearIcon />
            <span>{t("home.skills.manage.action")}</span>
          </button>
          <button
            type="button"
            className="skills-quiet-button"
            disabled
            title={t("home.skills.createDisabled")}
          >
            <PlusIcon />
            <span>{t("home.skills.create")}</span>
          </button>
        </div>
      </div>
      <div className="skills-header-copy">
        <h1>{t("home.skills.title")}</h1>
      </div>
      <div className="skills-market-controls">
        <label className="skills-search-field">
          <SearchIcon />
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </label>
        {props.activeTab === "plugins" ? (
          <>
            <label className="skills-select-field">
              <span className="skills-select-label">{t("home.skills.filters.marketplace")}</span>
              <select
                value={props.marketplaceFilter}
                onChange={(event) => props.onMarketplaceFilterChange(event.target.value)}
                aria-label={t("home.skills.filters.marketplace")}
              >
                <option value="all">{t("home.skills.filters.allMarketplaces")}</option>
                {props.marketplaceOptions.map((marketplace) => (
                  <option key={marketplace.id} value={marketplace.id}>{marketplace.label}</option>
                ))}
              </select>
            </label>
            <label className="skills-select-field">
              <span className="skills-select-label">{t("home.skills.filters.status")}</span>
              <select
                value={props.pluginStatusFilter}
                onChange={(event) => props.onPluginStatusFilterChange(event.target.value as PluginStatusFilter)}
                aria-label={t("home.skills.filters.status")}
              >
                <option value="all">{t("home.skills.filters.all")}</option>
                <option value="installed">{t("home.skills.filters.installed")}</option>
                <option value="available">{t("home.skills.filters.available")}</option>
              </select>
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="skills-refresh-icon-button"
          disabled={!props.ready || props.refreshPending}
          onClick={() => void props.onRefresh()}
          aria-label={props.refreshPending ? t("home.skills.refreshing") : t("home.skills.refresh")}
          title={props.refreshPending ? t("home.skills.refreshing") : t("home.skills.refresh")}
        >
          <RefreshIcon />
        </button>
      </div>
    </header>
  );
}

function SkillsManager(props: {
  readonly actionError: string | null;
  readonly apps: ReadonlyArray<ManagedAppCard>;
  readonly appsError: string | null;
  readonly counts: Readonly<Record<SkillsManagementTab, number>>;
  readonly loadingApps: boolean;
  readonly loadingMcpServers: boolean;
  readonly loadingPlugins: boolean;
  readonly loadingSkills: boolean;
  readonly marketplaceError: string | null;
  readonly mcpServers: ReadonlyArray<ManagedMcpServerCard>;
  readonly mcpServersError: string | null;
  readonly pendingAppIds: Readonly<Record<string, boolean>>;
  readonly pendingMcpServerIds: Readonly<Record<string, boolean>>;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly pendingPluginIds: Readonly<Record<string, boolean>>;
  readonly plugins: ReadonlyArray<MarketplacePluginCard>;
  readonly query: string;
  readonly ready: boolean;
  readonly skills: ReadonlyArray<InstalledSkillCard>;
  readonly skillsError: string | null;
  readonly tab: SkillsManagementTab;
  readonly onClose: () => void;
  readonly onOpenMcpSettings?: () => void;
  readonly onQueryChange: (value: string) => void;
  readonly onTabChange: (value: SkillsManagementTab) => void;
  readonly onToggleApp: (app: ManagedAppCard) => Promise<void>;
  readonly onToggleMcpServer: (server: ManagedMcpServerCard) => Promise<void>;
  readonly onTogglePlugin: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onToggleSkill: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const tabs = createManagementTabs(t, props.counts);
  const searchPlaceholder = getManagementSearchPlaceholder(props.tab, t);

  return (
    <section className="skills-manager" aria-label={t("home.skills.manage.title")}>
      <div className="skills-manager-toolbar">
        <div className="skills-manager-tabs" role="tablist" aria-label={t("home.skills.manage.tabs.label")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={props.tab === tab.id ? "skills-manager-tab skills-manager-tab-active" : "skills-manager-tab"}
              role="tab"
              aria-selected={props.tab === tab.id}
              onClick={() => props.onTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <label className="skills-manager-search">
          <SearchIcon />
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </label>
        <button type="button" className="skills-manager-return" onClick={props.onClose}>
          <span>{t("home.skills.manage.marketplace")}</span>
        </button>
      </div>
      <SectionBanner message={props.actionError} tone="error" />
      <div className="skills-manager-list">
        {renderManagementTab(props, t)}
      </div>
    </section>
  );
}

function renderManagementTab(
  props: Parameters<typeof SkillsManager>[0],
  t: ReturnType<typeof useI18n>["t"],
): JSX.Element {
  if (props.tab === "apps") {
    return (
      <ManagementListState
        emptyDetail={t("home.skills.manage.empty.apps")}
        emptyTitle={t("home.skills.empty")}
        error={props.appsError}
        items={props.apps}
        loading={props.loadingApps}
        loadingDetail={t("home.skills.manage.loading.apps")}
        t={t}
        renderItem={(app) => (
          <ManagementRow
            key={app.id}
            description={app.description}
            icon={app.icon}
            name={app.name}
            title={app.id}
            action={(
              <ManagementSwitch
                checked={app.enabled}
                disabled={!props.ready || props.pendingAppIds[app.id] === true}
                label={app.enabled
                  ? t("home.skills.manage.disable", { name: app.name })
                  : t("home.skills.manage.enable", { name: app.name })}
                onClick={() => void props.onToggleApp(app)}
              />
            )}
          />
        )}
      />
    );
  }
  if (props.tab === "mcp") {
    return (
      <ManagementListState
        emptyDetail={t("home.skills.manage.empty.mcp")}
        emptyTitle={t("home.skills.empty")}
        error={props.mcpServersError}
        items={props.mcpServers}
        loading={props.loadingMcpServers}
        loadingDetail={t("home.skills.manage.loading.mcp")}
        t={t}
        renderItem={(server) => (
          <ManagementRow
            key={server.id}
            description={server.description}
            icon={null}
            iconKind="connector"
            name={server.name}
            settingsLabel={t("home.skills.manage.configure", { name: server.name })}
            showDescription={false}
            title={server.id}
            onSettings={props.onOpenMcpSettings}
            action={(
              <ManagementSwitch
                checked={server.enabled}
                disabled={!props.ready || !server.writable || props.pendingMcpServerIds[server.id] === true}
                label={server.enabled
                  ? t("home.skills.manage.disable", { name: server.name })
                  : t("home.skills.manage.enable", { name: server.name })}
                onClick={() => void props.onToggleMcpServer(server)}
              />
            )}
          />
        )}
      />
    );
  }
  if (props.tab === "skills") {
    return (
      <ManagementListState
        emptyDetail={t("home.skills.manage.empty.skills")}
        emptyTitle={t("home.skills.empty")}
        error={props.skillsError}
        items={props.skills}
        loading={props.loadingSkills}
        loadingDetail={t("home.skills.installed.loadingDetail")}
        t={t}
        renderItem={(skill) => (
          <ManagementRow
            key={skill.path}
            description={skill.description}
            icon={skill.icon}
            name={skill.name}
            title={skill.path}
            action={(
              <ManagementSwitch
                checked={skill.enabled}
                disabled={!props.ready || props.pendingPaths[skill.path] === true}
                label={skill.enabled
                  ? t("home.skills.manage.disable", { name: skill.name })
                  : t("home.skills.manage.enable", { name: skill.name })}
                onClick={() => void props.onToggleSkill(skill)}
              />
            )}
          />
        )}
      />
    );
  }
  return (
    <ManagementListState
      emptyDetail={t("home.skills.manage.empty.plugins")}
      emptyTitle={t("home.skills.empty")}
      error={props.marketplaceError}
      items={props.plugins}
      loading={props.loadingPlugins}
      loadingDetail={t("home.skills.marketplace.loadingDetail")}
      t={t}
      renderItem={(plugin) => (
        <ManagementRow
          key={plugin.id}
          description={plugin.description}
          icon={plugin.icon}
          name={plugin.name}
          title={plugin.id}
          action={(
            <ManagementSwitch
              checked={plugin.enabled}
              disabled={!props.ready || props.pendingPluginIds[plugin.id] === true}
              label={plugin.enabled
                ? t("home.skills.manage.disable", { name: plugin.name })
                : t("home.skills.manage.enable", { name: plugin.name })}
              onClick={() => void props.onTogglePlugin(plugin)}
            />
          )}
        />
      )}
    />
  );
}

function ManagementListState<T>(props: {
  readonly error: string | null;
  readonly items: ReadonlyArray<T>;
  readonly loading: boolean;
  readonly emptyTitle: string;
  readonly emptyDetail: string;
  readonly loadingDetail: string;
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly renderItem: (item: T) => JSX.Element;
}): JSX.Element {
  if (props.error !== null) {
    return <SectionErrorState title={props.t("home.skills.marketplace.errorTitle")} detail={props.error} />;
  }
  if (props.loading && props.items.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.marketplace.loadingTitle")} detail={props.loadingDetail} />;
  }
  if (props.items.length === 0) {
    return <SectionEmptyState title={props.emptyTitle} detail={props.emptyDetail} />;
  }
  return <>{props.items.map(props.renderItem)}</>;
}

function ManagementRow(props: {
  readonly action: JSX.Element;
  readonly description: string;
  readonly icon: string | null;
  readonly iconKind?: "avatar" | "connector";
  readonly name: string;
  readonly settingsLabel?: string;
  readonly showDescription?: boolean;
  readonly title: string;
  readonly onSettings?: () => void;
}): JSX.Element {
  return (
    <article className="skills-manager-row" title={props.title}>
      <ManagementIcon kind={props.iconKind ?? "avatar"} icon={props.icon} name={props.name} />
      <div className="skills-manager-row-copy">
        <strong>{props.name}</strong>
        {props.showDescription === false ? null : <p>{props.description}</p>}
      </div>
      <div className="skills-manager-row-actions">
        {props.onSettings !== undefined && props.settingsLabel !== undefined ? (
          <button
            type="button"
            className="skills-manager-icon-button"
            aria-label={props.settingsLabel}
            title={props.settingsLabel}
            onClick={props.onSettings}
          >
            <GearIcon />
          </button>
        ) : null}
        {props.action}
      </div>
    </article>
  );
}

function ManagementIcon(props: {
  readonly icon: string | null;
  readonly kind: "avatar" | "connector";
  readonly name: string;
}): JSX.Element {
  if (props.kind === "connector") {
    return (
      <span className="skills-manager-connector-icon" aria-hidden="true">
        <ConnectorIcon />
      </span>
    );
  }
  return <SkillAvatar brandColor={null} icon={props.icon} name={props.name} />;
}

function ManagementSwitch(props: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function createManagementTabs(
  t: ReturnType<typeof useI18n>["t"],
  counts: Readonly<Record<SkillsManagementTab, number>>,
): ReadonlyArray<{ readonly id: SkillsManagementTab; readonly label: string; readonly count: number }> {
  return [
    { id: "plugins", label: t("home.skills.manage.tabs.plugins"), count: counts.plugins },
    { id: "apps", label: t("home.skills.manage.tabs.apps"), count: counts.apps },
    { id: "mcp", label: t("home.skills.manage.tabs.mcp"), count: counts.mcp },
    { id: "skills", label: t("home.skills.manage.tabs.skills"), count: counts.skills },
  ];
}

function getManagementSearchPlaceholder(
  tab: SkillsManagementTab,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (tab === "apps") return t("home.skills.manage.search.apps");
  if (tab === "mcp") return t("home.skills.manage.search.mcp");
  if (tab === "skills") return t("home.skills.manage.search.skills");
  return t("home.skills.manage.search.plugins");
}

function PluginMarketplace(props: {
  readonly plugins: ReadonlyArray<MarketplacePluginCard>;
  readonly pendingPluginIds: Readonly<Record<string, boolean>>;
  readonly error: string | null;
  readonly actionError: string | null;
  readonly loading: boolean;
  readonly onInstallPlugin: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onTogglePluginEnabled: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onTryPlugin: (plugin: MarketplacePluginCard) => void;
  readonly onUninstallPlugin: (plugin: MarketplacePluginCard) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const heroPlugin = props.plugins.find((plugin) => plugin.featured) ?? props.plugins[0] ?? null;
  const sections = createPluginSections(props.plugins, t);
  return (
    <>
      {heroPlugin !== null ? (
        <PluginHero
          plugin={heroPlugin}
          pending={props.pendingPluginIds[heroPlugin.id] === true}
          onInstallPlugin={props.onInstallPlugin}
          onTryPlugin={props.onTryPlugin}
        />
      ) : null}
      <SectionBanner message={props.actionError} tone="error" />
      <PluginMarketplaceState
        emptyCopy={t("home.skills.marketplace.empty")}
        error={props.error}
        loading={props.loading}
        t={t}
      >
        {sections.map((section) => (
          <section className="plugin-market-section" key={section.id}>
            <h2>{section.title}</h2>
            <div className="plugin-market-list">
              {section.plugins.map((plugin) => (
                <PluginRow
                  key={plugin.id}
                  pending={props.pendingPluginIds[plugin.id] === true}
                  plugin={plugin}
                  onInstallPlugin={props.onInstallPlugin}
                  onTogglePluginEnabled={props.onTogglePluginEnabled}
                  onUninstallPlugin={props.onUninstallPlugin}
                />
              ))}
            </div>
          </section>
        ))}
      </PluginMarketplaceState>
    </>
  );
}

function PluginHero(props: {
  readonly plugin: MarketplacePluginCard;
  readonly pending: boolean;
  readonly onInstallPlugin: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onTryPlugin: (plugin: MarketplacePluginCard) => void;
}): JSX.Element {
  const { t } = useI18n();
  const heroPrompt = props.plugin.defaultPrompts[0] ?? props.plugin.description;
  const canInstall = !props.plugin.installed && props.plugin.installPolicy !== "NOT_AVAILABLE";
  const handleAction = () => {
    if (props.plugin.installed) {
      props.onTryPlugin(props.plugin);
      return;
    }
    if (canInstall) {
      void props.onInstallPlugin(props.plugin);
    }
  };
  return (
    <section className="plugin-market-hero" aria-label={props.plugin.name}>
      <div className="plugin-hero-prompt">
        <SkillAvatar brandColor={props.plugin.brandColor} icon={props.plugin.icon} name={props.plugin.name} />
        <span>{heroPrompt}</span>
      </div>
      <button
        type="button"
        className="plugin-hero-action"
        disabled={props.pending || (!props.plugin.installed && !canInstall)}
        onClick={handleAction}
      >
        {props.plugin.installed ? t("home.skills.hero.try") : t("home.skills.card.install")}
      </button>
    </section>
  );
}

function PluginMarketplaceState(props: {
  readonly children: JSX.Element | ReadonlyArray<JSX.Element>;
  readonly error: string | null;
  readonly loading: boolean;
  readonly emptyCopy: string;
  readonly t: ReturnType<typeof useI18n>["t"];
}): JSX.Element {
  const children = Array.isArray(props.children) ? props.children : [props.children];
  if (props.error !== null) {
    return <SectionErrorState title={props.t("home.skills.marketplace.errorTitle")} detail={props.error} />;
  }
  if (props.loading && children.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.marketplace.loadingTitle")} detail={props.t("home.skills.marketplace.loadingDetail")} />;
  }
  if (children.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.empty")} detail={props.emptyCopy} />;
  }
  return <>{props.children}</>;
}

function PluginRow(props: {
  readonly plugin: MarketplacePluginCard;
  readonly pending: boolean;
  readonly onInstallPlugin: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onTogglePluginEnabled: (plugin: MarketplacePluginCard) => Promise<void>;
  readonly onUninstallPlugin: (plugin: MarketplacePluginCard) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  const canInstall = !props.plugin.installed && props.plugin.installPolicy !== "NOT_AVAILABLE";
  const rowTitle = props.plugin.longDescription ?? props.plugin.description;
  return (
    <article className="plugin-row" title={rowTitle}>
      <SkillAvatar brandColor={props.plugin.brandColor} icon={props.plugin.icon} name={props.plugin.name} />
      <div className="plugin-row-copy">
        <strong>{props.plugin.name}</strong>
        <p>{props.plugin.description}</p>
      </div>
      {props.plugin.installed ? (
        <div className="plugin-row-actions">
          <button
            type="button"
            className={props.plugin.enabled ? "plugin-icon-button plugin-icon-button-installed" : "plugin-icon-button plugin-icon-button-disabled"}
            disabled={props.pending}
            aria-label={props.plugin.enabled
              ? t("home.skills.card.disablePlugin", { name: props.plugin.name })
              : t("home.skills.card.enablePlugin", { name: props.plugin.name })}
            title={props.plugin.enabled ? t("home.skills.card.enabled") : t("home.skills.card.disabled")}
            onClick={() => void props.onTogglePluginEnabled(props.plugin)}
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            className="plugin-icon-button"
            disabled={props.pending}
            aria-label={t("home.skills.card.uninstallPlugin", { name: props.plugin.name })}
            title={t("home.skills.card.uninstall")}
            onClick={() => void props.onUninstallPlugin(props.plugin)}
          >
            <TrashIcon />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="plugin-icon-button"
          disabled={props.pending || !canInstall}
          aria-label={canInstall
            ? t("home.skills.card.installPlugin", { name: props.plugin.name })
            : t("home.skills.card.notAvailable")}
          title={canInstall ? t("home.skills.card.install") : t("home.skills.card.notAvailable")}
          onClick={() => void props.onInstallPlugin(props.plugin)}
        >
          <PlusIcon />
        </button>
      )}
    </article>
  );
}

function InstalledSkillsSection(props: {
  readonly skills: ReadonlyArray<InstalledSkillCard>;
  readonly scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly installedError: string | null;
  readonly actionError: string | null;
  readonly loading: boolean;
  readonly onToggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="skills-section">
      <SectionHeading title={t("home.skills.installed.title")} loading={props.loading} />
      <SectionBanner message={props.actionError} tone="error" />
      <SectionBanner message={formatScanErrors(props.scanErrors, t)} tone="warning" />
      <SkillsGridState
        emptyCopy={t("home.skills.installed.empty")}
        error={props.installedError}
        items={props.skills}
        loading={props.loading}
        t={t}
        renderItem={(skill) => (
          <InstalledSkillCardView
            key={skill.path}
            pending={props.pendingPaths[skill.path] === true}
            skill={skill}
            t={t}
            onToggleSkillEnabled={props.onToggleSkillEnabled}
          />
        )}
      />
    </section>
  );
}

function SkillsGridState<T>(props: {
  readonly items: ReadonlyArray<T>;
  readonly error: string | null;
  readonly loading: boolean;
  readonly emptyCopy: string;
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly renderItem: (item: T) => JSX.Element;
}): JSX.Element {
  if (props.error !== null) {
    return <SectionErrorState title={props.t("home.skills.installed.errorTitle")} detail={props.error} />;
  }
  if (props.loading && props.items.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.installed.loadingTitle")} detail={props.t("home.skills.installed.loadingDetail")} />;
  }
  if (props.items.length === 0) {
    return <SectionEmptyState title={props.t("home.skills.empty")} detail={props.emptyCopy} />;
  }
  return <div className="skills-grid">{props.items.map(props.renderItem)}</div>;
}

function InstalledSkillCardView(props: {
  readonly skill: InstalledSkillCard;
  readonly pending: boolean;
  readonly t: ReturnType<typeof useI18n>["t"];
  readonly onToggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
}): JSX.Element {
  return (
    <article className="skills-card" title={props.skill.path}>
      <SkillAvatar brandColor={props.skill.brandColor} icon={props.skill.icon} name={props.skill.name} />
      <div className="skills-card-copy">
        <div className="skills-card-title-row">
          <strong>{props.skill.name}</strong>
          <span className="skills-scope-pill">{formatScope(props.skill.scope, props.t)}</span>
        </div>
        <p>{props.skill.description}</p>
      </div>
      <button
        type="button"
        className={props.skill.enabled ? "settings-toggle settings-toggle-on" : "settings-toggle"}
        role="switch"
        aria-checked={props.skill.enabled}
        aria-label={`${props.skill.name}${props.skill.enabled ? props.t("home.skills.card.enabled") : props.t("home.skills.card.disabled")}`}
        disabled={props.pending}
        onClick={() => void props.onToggleSkillEnabled(props.skill)}
      >
        <span className="settings-toggle-knob" />
      </button>
    </article>
  );
}

function SectionHeading(props: { readonly title: string; readonly loading: boolean }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="skills-section-heading">
      <h2>{props.title}</h2>
      {props.loading ? <span>{t("home.skills.installed.syncing")}</span> : null}
    </div>
  );
}

function SectionBanner(props: { readonly message: string | null; readonly tone: "error" | "warning" }): JSX.Element | null {
  if (props.message === null) {
    return null;
  }
  return <div className={`skills-banner skills-banner-${props.tone}`}>{props.message}</div>;
}

function SectionErrorState(props: { readonly title: string; readonly detail: string }): JSX.Element {
  return (
    <div className="skills-empty-state skills-error-state">
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function SectionEmptyState(props: { readonly title: string; readonly detail: string }): JSX.Element {
  return (
    <div className="skills-empty-state">
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 13.5 13.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function RefreshIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 7.8A5 5 0 1 1 11.5 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M11.3 1.9h3v3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.2 8.4 3 3 6.6-6.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.2 5.8v6.4m5.6-6.4v6.4M3.5 4.4h9M6.2 4.4l.5-1.2h2.6l.5 1.2M4.6 4.4l.5 9h5.8l.5-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

function ConnectorIcon(): JSX.Element {
  return (
    <svg className="skills-manager-connector-glyph" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7.2 4.9 8.9 3a3 3 0 0 1 4.3 4.2l-2 2.2a3 3 0 0 1-3.9.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
      <path d="m10.8 13.1-1.7 1.9a3 3 0 0 1-4.3-4.2l2-2.2a3 3 0 0 1 3.9-.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45" />
      <path d="m7.8 10.2 2.4-2.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
    </svg>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg className="skills-toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.9 1.8h2.2l.4 1.5c.4.1.8.3 1.1.5l1.4-.8 1.5 1.5-.8 1.4c.2.4.4.7.5 1.1l1.5.4v2.2l-1.5.4c-.1.4-.3.8-.5 1.1l.8 1.4-1.5 1.5-1.4-.8c-.4.2-.7.4-1.1.5l-.4 1.5H6.9l-.4-1.5c-.4-.1-.8-.3-1.1-.5l-1.4.8-1.5-1.5.8-1.4c-.2-.4-.4-.7-.5-1.1l-1.5-.4V7.4l1.5-.4c.1-.4.3-.8.5-1.1l-.8-1.4L4 3l1.4.8c.4-.2.7-.4 1.1-.5l.4-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function createPluginSections(
  plugins: ReadonlyArray<MarketplacePluginCard>,
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{ readonly id: string; readonly title: string; readonly plugins: ReadonlyArray<MarketplacePluginCard> }> {
  const featuredPlugins = plugins.filter((plugin) => plugin.featured);
  const featuredIds = new Set(featuredPlugins.map((plugin) => plugin.id));
  const categoryGroups = new Map<string, MarketplacePluginCard[]>();
  for (const plugin of plugins) {
    if (featuredIds.has(plugin.id)) {
      continue;
    }
    const group = categoryGroups.get(plugin.category) ?? [];
    group.push(plugin);
    categoryGroups.set(plugin.category, group);
  }
  const sections = featuredPlugins.length > 0
    ? [{ id: "featured", title: t("home.skills.sections.featured"), plugins: featuredPlugins }]
    : [];
  const categorySections = [...categoryGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN", { sensitivity: "base" }))
    .map(([category, categoryPlugins]) => ({
      id: `category:${category}`,
      title: category,
      plugins: categoryPlugins,
    }));
  return [...sections, ...categorySections];
}

function formatScope(scope: InstalledSkillCard["scope"], t: ReturnType<typeof useI18n>["t"]): string {
  if (scope === "repo") return t("home.skills.card.scopeRepo");
  if (scope === "user") return t("home.skills.card.scopePersonal");
  if (scope === "system") return t("home.skills.card.scopeSystem");
  return t("home.skills.card.scopeAdmin");
}

function formatScanErrors(
  scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (scanErrors.length === 0) {
    return null;
  }
  const [firstError] = scanErrors;
  if (scanErrors.length === 1) {
    return t("home.skills.scan.error", { path: firstError.path, message: firstError.message });
  }
  return t("home.skills.scan.errorMultiple", { path: firstError.path, message: firstError.message, count: scanErrors.length - 1 });
}
