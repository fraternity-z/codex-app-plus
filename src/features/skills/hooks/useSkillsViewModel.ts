import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceivedNotification } from "../../../domain/types";
import type { AppSummary } from "../../../protocol/generated/v2/AppSummary";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { ConfigWriteResponse } from "../../../protocol/generated/v2/ConfigWriteResponse";
import type { McpAuthStatus } from "../../../protocol/generated/v2/McpAuthStatus";
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
import {
  createInstalledSkillsCatalog,
  createMarketplacePluginCards,
  filterInstalledSkillCards,
  filterMarketplacePluginCards,
  replaceInstalledSkillEnabled,
  type InstalledSkillCard,
  type InstalledSkillsCatalog,
  type MarketplaceFilterOption,
  type MarketplacePluginCard,
  type MarketplacePluginsCatalog,
} from "../model/skillCatalog";
import { readMcpConfigView } from "../../settings/config/mcpConfig";
import type { ConfigMutationResult } from "../../settings/config/configOperations";

interface AsyncState<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: string | null;
}

interface PluginComponentCatalog {
  readonly apps: ReadonlyArray<ManagedAppCard>;
  readonly mcpServerIds: ReadonlyArray<string>;
}

interface SkillsViewModelOptions {
  readonly configSnapshot: ConfigReadResponse | null;
  readonly mcpServerStatuses: ReadonlyArray<McpServerStatus>;
  readonly ready?: boolean;
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly listMcpServerStatuses: () => Promise<ReadonlyArray<McpServerStatus>>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly readMarketplacePlugin: (params: PluginReadParams) => Promise<PluginReadResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
  readonly uninstallMarketplacePlugin: (params: PluginUninstallParams) => Promise<PluginUninstallResponse>;
  readonly setAppEnabled: (appId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
  readonly setMarketplacePluginEnabled: (pluginId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
}

export type SkillsManagementTab = "plugins" | "apps" | "mcp" | "skills";

export interface ManagedAppCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly accessible: boolean;
  readonly icon: string | null;
}

export interface ManagedMcpServerCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly writable: boolean;
  readonly authStatus: McpAuthStatus | null;
}

export interface SkillsViewModel {
  readonly activeTab: "plugins" | "skills";
  readonly managerOpen: boolean;
  readonly managementTab: SkillsManagementTab;
  readonly managementQuery: string;
  readonly managedPlugins: ReadonlyArray<MarketplacePluginCard>;
  readonly managedApps: ReadonlyArray<ManagedAppCard>;
  readonly managedMcpServers: ReadonlyArray<ManagedMcpServerCard>;
  readonly managedSkills: ReadonlyArray<InstalledSkillCard>;
  readonly managementCounts: Readonly<Record<SkillsManagementTab, number>>;
  readonly query: string;
  readonly marketplaceFilter: string;
  readonly pluginStatusFilter: "all" | "installed" | "available";
  readonly installedSkills: ReadonlyArray<InstalledSkillCard>;
  readonly marketplacePlugins: ReadonlyArray<MarketplacePluginCard>;
  readonly marketplaceOptions: ReadonlyArray<MarketplaceFilterOption>;
  readonly scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly installedError: string | null;
  readonly marketplaceError: string | null;
  readonly actionError: string | null;
  readonly loadingInstalled: boolean;
  readonly loadingMarketplace: boolean;
  readonly loadingApps: boolean;
  readonly loadingMcpServers: boolean;
  readonly appsError: string | null;
  readonly mcpServersError: string | null;
  readonly refreshPending: boolean;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly pendingAppIds: Readonly<Record<string, boolean>>;
  readonly pendingMcpServerIds: Readonly<Record<string, boolean>>;
  readonly pendingPluginIds: Readonly<Record<string, boolean>>;
  readonly setActiveTab: (value: "plugins" | "skills") => void;
  readonly setManagerOpen: (value: boolean) => void;
  readonly setManagementTab: (value: SkillsManagementTab) => void;
  readonly setManagementQuery: (value: string) => void;
  readonly setQuery: (value: string) => void;
  readonly setMarketplaceFilter: (value: string) => void;
  readonly setPluginStatusFilter: (value: "all" | "installed" | "available") => void;
  readonly refresh: () => Promise<void>;
  readonly toggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
  readonly installMarketplacePluginCard: (skill: MarketplacePluginCard) => Promise<void>;
  readonly uninstallMarketplacePluginCard: (skill: MarketplacePluginCard) => Promise<void>;
  readonly toggleMarketplacePluginEnabled: (skill: MarketplacePluginCard) => Promise<void>;
  readonly toggleAppEnabled: (app: ManagedAppCard) => Promise<void>;
  readonly toggleMcpServerEnabled: (server: ManagedMcpServerCard) => Promise<void>;
}

const EMPTY_LOCAL_CATALOG: InstalledSkillsCatalog = { skills: [], scanErrors: [] };
const EMPTY_MARKETPLACE_CATALOG: MarketplacePluginsCatalog = { plugins: [], marketplaces: [] };
const HIDDEN_MCP_SERVER_IDS = new Set(["codex_apps"]);

export function useSkillsViewModel(options: SkillsViewModelOptions): SkillsViewModel {
  const {
    configSnapshot,
    mcpServerStatuses,
    ready,
    selectedRootPath,
    notifications,
    listMcpServerStatuses,
    listSkills,
    listMarketplacePlugins,
    readMarketplacePlugin,
    writeSkillConfig,
    writeConfigValue,
    installMarketplacePlugin,
    uninstallMarketplacePlugin,
    setAppEnabled,
    setMarketplacePluginEnabled,
  } = options;
  const [activeTab, setActiveTab] = useState<"plugins" | "skills">("plugins");
  const [managerOpen, setManagerOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<SkillsManagementTab>("plugins");
  const [managementQuery, setManagementQuery] = useState("");
  const [query, setQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<"all" | "installed" | "available">("all");
  const [installedState, setInstalledState] = useState<AsyncState<InstalledSkillsCatalog>>(
    createAsyncState(EMPTY_LOCAL_CATALOG),
  );
  const [marketplaceState, setMarketplaceState] = useState<AsyncState<MarketplacePluginsCatalog>>(
    createAsyncState(EMPTY_MARKETPLACE_CATALOG),
  );
  const [pluginComponentsState, setPluginComponentsState] = useState<AsyncState<PluginComponentCatalog>>(
    createAsyncState({ apps: [], mcpServerIds: [] }),
  );
  const [mcpServersState, setMcpServersState] = useState<AsyncState<ReadonlyArray<McpServerStatus>>>(
    { data: mcpServerStatuses, loading: mcpServerStatuses.length === 0, error: null },
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<Readonly<Record<string, boolean>>>({});
  const [pendingAppIds, setPendingAppIds] = useState<Readonly<Record<string, boolean>>>({});
  const [pendingMcpServerIds, setPendingMcpServerIds] = useState<Readonly<Record<string, boolean>>>({});
  const [pendingPluginIds, setPendingPluginIds] = useState<Readonly<Record<string, boolean>>>({});
  const lastHandledSkillsChangeRef = useRef(0);

  const refreshInstalled = useCallback(async (forceReload: boolean) => {
    if (ready === false) {
      setInstalledState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    setInstalledState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listSkills(createSkillsListParams(selectedRootPath, forceReload));
      setInstalledState({ data: createInstalledSkillsCatalog(response.data), loading: false, error: null });
    } catch (error) {
      setInstalledState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listSkills, ready, selectedRootPath]);

  const refreshPluginComponents = useCallback(async (plugins: ReadonlyArray<MarketplacePluginCard>) => {
    if (ready === false) {
      setPluginComponentsState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    const installedPlugins = plugins.filter((plugin) => plugin.installed);
    if (installedPlugins.length === 0) {
      setPluginComponentsState({ data: { apps: [], mcpServerIds: [] }, loading: false, error: null });
      return;
    }
    setPluginComponentsState((current) => ({ ...current, loading: true, error: null }));
    try {
      const details = await Promise.all(installedPlugins.map((plugin) => (
        readMarketplacePlugin(createPluginReadParams(plugin))
      )));
      setPluginComponentsState({
        data: createPluginComponentCatalog(details.map((detail) => detail.plugin), configSnapshot),
        loading: false,
        error: null,
      });
    } catch (error) {
      setPluginComponentsState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [configSnapshot, readMarketplacePlugin, ready]);

  const refreshMarketplace = useCallback(async () => {
    if (ready === false) {
      setMarketplaceState((current) => ({ ...current, loading: true, error: null }));
      setPluginComponentsState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    setMarketplaceState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listMarketplacePlugins(createPluginListParams(selectedRootPath));
      const catalog = createMarketplacePluginCards(response);
      setMarketplaceState({
        data: catalog,
        loading: false,
        error: formatMarketplaceLoadErrors(response),
      });
      await refreshPluginComponents(catalog.plugins);
    } catch (error) {
      setMarketplaceState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
      setPluginComponentsState((current) => ({ ...current, loading: false }));
    }
  }, [listMarketplacePlugins, ready, refreshPluginComponents, selectedRootPath]);

  const refreshMcpServers = useCallback(async () => {
    if (ready === false) {
      setMcpServersState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    setMcpServersState((current) => ({ ...current, loading: true, error: null }));
    try {
      const statuses = await listMcpServerStatuses();
      setMcpServersState({ data: statuses, loading: false, error: null });
    } catch (error) {
      setMcpServersState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listMcpServerStatuses, ready]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshInstalled(true), refreshMarketplace()]);
  }, [refreshInstalled, refreshMarketplace]);

  const toggleSkillEnabled = useCallback(async (skill: InstalledSkillCard) => {
    setActionError(null);
    setPendingPaths((current) => ({ ...current, [skill.path]: true }));
    try {
      const response = await writeSkillConfig({ path: skill.path, enabled: !skill.enabled });
      setInstalledState((current) => ({
        ...current,
        data: replaceInstalledSkillEnabled(current.data, skill.path, response.effectiveEnabled),
      }));
    } catch (error) {
      setActionError(`更新技能状态失败：${toErrorMessage(error)}`);
    } finally {
      setPendingPaths((current) => omitRecordKey(current, skill.path));
    }
  }, [writeSkillConfig]);

  const installMarketplacePluginCard = useCallback(async (skill: MarketplacePluginCard) => {
    setActionError(null);
    setPendingPluginIds((current) => ({ ...current, [skill.id]: true }));
    try {
      await installMarketplacePlugin(
        skill.marketplacePath === null
          ? {
            remoteMarketplaceName: skill.marketplaceName,
            pluginName: skill.pluginName,
          }
          : {
            marketplacePath: skill.marketplacePath,
            pluginName: skill.pluginName,
          },
      );
      await refreshInstalled(true);
      await refreshMarketplace();
    } catch (error) {
      setActionError(`安装插件失败：${toErrorMessage(error)}`);
    } finally {
      setPendingPluginIds((current) => omitRecordKey(current, skill.id));
    }
  }, [installMarketplacePlugin, refreshInstalled, refreshMarketplace]);

  const uninstallMarketplacePluginCard = useCallback(async (skill: MarketplacePluginCard) => {
    setActionError(null);
    setPendingPluginIds((current) => ({ ...current, [skill.id]: true }));
    try {
      await uninstallMarketplacePlugin({ pluginId: skill.id });
      await refreshInstalled(true);
      await refreshMarketplace();
    } catch (error) {
      setActionError(`卸载插件失败：${toErrorMessage(error)}`);
    } finally {
      setPendingPluginIds((current) => omitRecordKey(current, skill.id));
    }
  }, [refreshInstalled, refreshMarketplace, uninstallMarketplacePlugin]);

  const toggleMarketplacePluginEnabled = useCallback(async (skill: MarketplacePluginCard) => {
    setActionError(null);
    setPendingPluginIds((current) => ({ ...current, [skill.id]: true }));
    try {
      await setMarketplacePluginEnabled(skill.id, !skill.enabled);
      await refreshMarketplace();
    } catch (error) {
      setActionError(`更新插件状态失败：${toErrorMessage(error)}`);
    } finally {
      setPendingPluginIds((current) => omitRecordKey(current, skill.id));
    }
  }, [refreshMarketplace, setMarketplacePluginEnabled]);

  const toggleAppEnabled = useCallback(async (app: ManagedAppCard) => {
    setActionError(null);
    setPendingAppIds((current) => ({ ...current, [app.id]: true }));
    try {
      await setAppEnabled(app.id, !app.enabled);
      setPluginComponentsState((current) => ({
        ...current,
        data: {
          ...current.data,
          apps: current.data.apps.map((item) => (
            item.id === app.id ? { ...item, enabled: !app.enabled } : item
          )),
        },
      }));
    } catch (error) {
      setActionError(`更新应用状态失败：${toErrorMessage(error)}`);
    } finally {
      setPendingAppIds((current) => omitRecordKey(current, app.id));
    }
  }, [setAppEnabled]);

  const toggleMcpServerEnabled = useCallback(async (server: ManagedMcpServerCard) => {
    if (!server.writable) {
      return;
    }
    setActionError(null);
    setPendingMcpServerIds((current) => ({ ...current, [server.id]: true }));
    try {
      const view = readMcpConfigView(configSnapshot, mcpServersState.data);
      const result = await writeConfigValue({
        keyPath: `mcp_servers.${server.id}.enabled`,
        value: !server.enabled,
        mergeStrategy: "upsert",
        filePath: view.writeTarget.filePath,
        expectedVersion: view.writeTarget.expectedVersion,
      });
      setMcpServersState({ data: result.statuses, loading: false, error: null });
    } catch (error) {
      setActionError(`更新 MCP 状态失败：${toErrorMessage(error)}`);
    } finally {
      setPendingMcpServerIds((current) => omitRecordKey(current, server.id));
    }
  }, [configSnapshot, mcpServersState.data, writeConfigValue]);

  useEffect(() => {
    void Promise.all([refreshInstalled(false), refreshMarketplace(), refreshMcpServers()]);
  }, [refreshInstalled, refreshMarketplace, refreshMcpServers]);

  useEffect(() => {
    if (mcpServerStatuses.length === 0) {
      return;
    }
    setMcpServersState((current) => ({
      ...current,
      data: mcpServerStatuses,
      loading: false,
      error: null,
    }));
  }, [mcpServerStatuses]);

  useEffect(() => {
    const latestChangeIndex = findLastSkillsChangedIndex(notifications);
    if (latestChangeIndex <= lastHandledSkillsChangeRef.current) {
      return;
    }
    lastHandledSkillsChangeRef.current = latestChangeIndex;
    void refreshInstalled(true);
  }, [notifications, refreshInstalled]);

  const installedSkills = useMemo(
    () => filterInstalledSkillCards(installedState.data.skills, query),
    [installedState.data.skills, query],
  );
  const marketplacePlugins = useMemo(
    () => filterMarketplacePluginCards(
      marketplaceState.data.plugins,
      query,
      marketplaceFilter,
      pluginStatusFilter,
    ),
    [marketplaceFilter, marketplaceState.data.plugins, pluginStatusFilter, query],
  );
  const mcpServers = useMemo(
    () => createManagedMcpServerCards(configSnapshot, mcpServersState.data, pluginComponentsState.data.mcpServerIds),
    [configSnapshot, mcpServersState.data, pluginComponentsState.data.mcpServerIds],
  );
  const installedMarketplacePlugins = useMemo(
    () => marketplaceState.data.plugins.filter((plugin) => plugin.installed),
    [marketplaceState.data.plugins],
  );
  const managedPlugins = useMemo(
    () => filterManagementItems(installedMarketplacePlugins, managementQuery),
    [installedMarketplacePlugins, managementQuery],
  );
  const managedApps = useMemo(
    () => filterManagementItems(pluginComponentsState.data.apps, managementQuery),
    [managementQuery, pluginComponentsState.data.apps],
  );
  const managedMcpServers = useMemo(
    () => filterManagementItems(mcpServers, managementQuery),
    [managementQuery, mcpServers],
  );
  const managedSkills = useMemo(
    () => filterInstalledSkillCards(installedState.data.skills, managementQuery),
    [installedState.data.skills, managementQuery],
  );
  const managementCounts = useMemo(() => ({
    plugins: installedMarketplacePlugins.length,
    apps: pluginComponentsState.data.apps.length,
    mcp: mcpServers.length,
    skills: installedState.data.skills.length,
  }), [installedMarketplacePlugins.length, installedState.data.skills.length, mcpServers.length, pluginComponentsState.data.apps.length]);

  return {
    activeTab,
    managerOpen,
    managementTab,
    managementQuery,
    managedPlugins,
    managedApps,
    managedMcpServers,
    managedSkills,
    managementCounts,
    query,
    marketplaceFilter,
    pluginStatusFilter,
    installedSkills,
    marketplacePlugins,
    marketplaceOptions: marketplaceState.data.marketplaces,
    scanErrors: installedState.data.scanErrors,
    installedError: installedState.error,
    marketplaceError: marketplaceState.error,
    actionError,
    loadingInstalled: installedState.loading,
    loadingMarketplace: marketplaceState.loading,
    loadingApps: pluginComponentsState.loading,
    loadingMcpServers: mcpServersState.loading,
    appsError: pluginComponentsState.error,
    mcpServersError: mcpServersState.error,
    refreshPending: installedState.loading || marketplaceState.loading,
    pendingPaths,
    pendingAppIds,
    pendingMcpServerIds,
    pendingPluginIds,
    setActiveTab,
    setManagerOpen,
    setManagementTab,
    setManagementQuery,
    setQuery,
    setMarketplaceFilter,
    setPluginStatusFilter,
    refresh,
    toggleSkillEnabled,
    installMarketplacePluginCard,
    uninstallMarketplacePluginCard,
    toggleMarketplacePluginEnabled,
    toggleAppEnabled,
    toggleMcpServerEnabled,
  };
}

function createAsyncState<T>(data: T): AsyncState<T> {
  return { data, loading: true, error: null };
}

function createSkillsListParams(selectedRootPath: string | null, forceReload: boolean): SkillsListParams {
  if (selectedRootPath === null) {
    return { forceReload };
  }
  return { cwds: [selectedRootPath], forceReload };
}

function createPluginListParams(selectedRootPath: string | null): PluginListParams {
  if (selectedRootPath === null) {
    return {};
  }
  return { cwds: [selectedRootPath] };
}

function createPluginReadParams(plugin: MarketplacePluginCard): PluginReadParams {
  if (plugin.marketplacePath === null) {
    return { remoteMarketplaceName: plugin.marketplaceName, pluginName: plugin.pluginName };
  }
  return { marketplacePath: plugin.marketplacePath, pluginName: plugin.pluginName };
}

function createPluginComponentCatalog(
  details: ReadonlyArray<PluginReadResponse["plugin"]>,
  configSnapshot: ConfigReadResponse | null,
): PluginComponentCatalog {
  const appsById = new Map<string, ManagedAppCard>();
  const mcpServerIds = new Set<string>();

  for (const detail of details) {
    for (const app of detail.apps) {
      appsById.set(app.id, createManagedAppCard(app, configSnapshot));
    }
    for (const mcpServerId of detail.mcpServers) {
      mcpServerIds.add(mcpServerId);
    }
  }

  return {
    apps: [...appsById.values()].sort(compareManagedItems),
    mcpServerIds: [...mcpServerIds].sort((left, right) => left.localeCompare(right, "zh-CN", { sensitivity: "base" })),
  };
}

function createManagedAppCard(app: AppSummary, configSnapshot: ConfigReadResponse | null): ManagedAppCard {
  const description = app.description?.trim() || app.id;
  return {
    id: app.id,
    name: app.name.trim().length > 0 ? app.name.trim() : app.id,
    description,
    enabled: resolveAppEnabled(configSnapshot, app.id),
    accessible: !app.needsAuth,
    icon: null,
  };
}

function resolveAppEnabled(configSnapshot: ConfigReadResponse | null, appId: string): boolean {
  const apps = configSnapshot?.config.apps;
  if (typeof apps !== "object" || apps === null || Array.isArray(apps)) {
    return true;
  }
  const config = apps[appId];
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return true;
  }
  return config.enabled !== false;
}

function createManagedMcpServerCards(
  configSnapshot: ConfigReadResponse | null,
  statuses: ReadonlyArray<McpServerStatus>,
  pluginMcpServerIds: ReadonlyArray<string>,
): ReadonlyArray<ManagedMcpServerCard> {
  const view = readMcpConfigView(configSnapshot, statuses);
  const cards = [...view.userServers, ...view.readOnlyServers]
    .filter((server) => !isHiddenMcpServerId(server.id))
    .map((server) => ({
      id: server.id,
      name: server.name,
      description: formatMcpDescription(
        server.type.toUpperCase(),
        server.runtime?.toolCount ?? 0,
        server.runtime?.resourceCount ?? 0,
        server.runtime?.authStatus ?? null,
      ),
      enabled: server.enabled,
      writable: server.writable,
      authStatus: server.runtime?.authStatus ?? null,
    }));
  const seenIds = new Set(cards.map((server) => server.id));
  const pluginCards = pluginMcpServerIds
    .filter((id) => !isHiddenMcpServerId(id))
    .filter((id) => !seenIds.has(id))
    .map((id) => {
      seenIds.add(id);
      return {
        id,
        name: id,
        description: "Plugin MCP server",
        enabled: true,
        writable: false,
        authStatus: null,
      };
    });
  const statusOnlyCards = statuses
    .filter((status) => !isHiddenMcpServerId(status.name))
    .filter((status) => !seenIds.has(status.name))
    .map((status) => ({
      id: status.name,
      name: status.name,
      description: formatMcpDescription(
        "Runtime",
        Object.keys(status.tools).length,
        status.resources.length + status.resourceTemplates.length,
        status.authStatus,
      ),
      enabled: true,
      writable: false,
      authStatus: status.authStatus,
    }));
  return [...cards, ...pluginCards, ...statusOnlyCards].sort(compareManagedItems);
}

function isHiddenMcpServerId(id: string): boolean {
  const normalizedId = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return HIDDEN_MCP_SERVER_IDS.has(normalizedId);
}

function formatMcpDescription(
  source: string,
  toolCount: number,
  resourceCount: number,
  authStatus: McpAuthStatus | null,
): string {
  const authCopy = authStatus === null ? "auth unknown" : `auth ${authStatus}`;
  return `${source} · ${toolCount} tools · ${resourceCount} resources · ${authCopy}`;
}

function filterManagementItems<T extends { readonly name: string; readonly description: string }>(
  items: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return items;
  }
  return items.filter((item) => `${item.name}\n${item.description}`.toLowerCase().includes(normalizedQuery));
}

function compareManagedItems<T extends { readonly name: string; readonly id: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" })
    || left.id.localeCompare(right.id, "zh-CN", { sensitivity: "base" });
}

function findLastSkillsChangedIndex(notifications: ReadonlyArray<ReceivedNotification>): number {
  for (let index = notifications.length - 1; index >= 0; index -= 1) {
    if (notifications[index]?.method === "skills/changed") {
      return index + 1;
    }
  }
  return 0;
}

function omitRecordKey(record: Readonly<Record<string, boolean>>, key: string): Readonly<Record<string, boolean>> {
  if (record[key] === undefined) {
    return record;
  }
  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
}

function toErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return normalizeErrorMessage(message);
}

function normalizeErrorMessage(message: string): string {
  const htmlStart = message.search(/<html[\s>]/i);
  if (htmlStart >= 0) {
    const prefix = message.slice(0, htmlStart).trim();
    if (prefix.length > 0) {
      return prefix;
    }
    const text = message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  }
  return message;
}

function formatMarketplaceLoadErrors(response: PluginListResponse): string | null {
  if (response.marketplaceLoadErrors.length === 0) {
    return null;
  }
  return response.marketplaceLoadErrors
    .map((error) => `${error.marketplacePath}: ${error.message}`)
    .join("；");
}
