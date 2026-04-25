import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceivedNotification } from "../../../domain/types";
import type { ConfigWriteResponse } from "../../../protocol/generated/v2/ConfigWriteResponse";
import type { MarketplaceUpgradeParams } from "../../../protocol/generated/v2/MarketplaceUpgradeParams";
import type { MarketplaceUpgradeResponse } from "../../../protocol/generated/v2/MarketplaceUpgradeResponse";
import type { PluginInstallParams } from "../../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
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

interface AsyncState<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: string | null;
}

interface SkillsViewModelOptions {
  readonly ready?: boolean;
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
  readonly uninstallMarketplacePlugin: (params: PluginUninstallParams) => Promise<PluginUninstallResponse>;
  readonly setMarketplacePluginEnabled: (pluginId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
  readonly upgradeMarketplaces: (params: MarketplaceUpgradeParams) => Promise<MarketplaceUpgradeResponse>;
}

export interface SkillsViewModel {
  readonly activeTab: "plugins" | "skills";
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
  readonly refreshPending: boolean;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly pendingPluginIds: Readonly<Record<string, boolean>>;
  readonly upgradePending: boolean;
  readonly setActiveTab: (value: "plugins" | "skills") => void;
  readonly setQuery: (value: string) => void;
  readonly setMarketplaceFilter: (value: string) => void;
  readonly setPluginStatusFilter: (value: "all" | "installed" | "available") => void;
  readonly refresh: () => Promise<void>;
  readonly toggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
  readonly installMarketplacePluginCard: (skill: MarketplacePluginCard) => Promise<void>;
  readonly uninstallMarketplacePluginCard: (skill: MarketplacePluginCard) => Promise<void>;
  readonly toggleMarketplacePluginEnabled: (skill: MarketplacePluginCard) => Promise<void>;
  readonly upgradeMarketplaceCatalog: () => Promise<void>;
}

const EMPTY_LOCAL_CATALOG: InstalledSkillsCatalog = { skills: [], scanErrors: [] };
const EMPTY_MARKETPLACE_CATALOG: MarketplacePluginsCatalog = { plugins: [], marketplaces: [] };

export function useSkillsViewModel(options: SkillsViewModelOptions): SkillsViewModel {
  const {
    ready,
    selectedRootPath,
    notifications,
    listSkills,
    listMarketplacePlugins,
    writeSkillConfig,
    installMarketplacePlugin,
    uninstallMarketplacePlugin,
    setMarketplacePluginEnabled,
    upgradeMarketplaces,
  } = options;
  const [activeTab, setActiveTab] = useState<"plugins" | "skills">("plugins");
  const [query, setQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<"all" | "installed" | "available">("all");
  const [installedState, setInstalledState] = useState<AsyncState<InstalledSkillsCatalog>>(
    createAsyncState(EMPTY_LOCAL_CATALOG),
  );
  const [marketplaceState, setMarketplaceState] = useState<AsyncState<MarketplacePluginsCatalog>>(
    createAsyncState(EMPTY_MARKETPLACE_CATALOG),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<Readonly<Record<string, boolean>>>({});
  const [pendingPluginIds, setPendingPluginIds] = useState<Readonly<Record<string, boolean>>>({});
  const [upgradePending, setUpgradePending] = useState(false);
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

  const refreshMarketplace = useCallback(async () => {
    if (ready === false) {
      setMarketplaceState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    setMarketplaceState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listMarketplacePlugins(createPluginListParams(selectedRootPath));
      setMarketplaceState({
        data: createMarketplacePluginCards(response),
        loading: false,
        error: formatMarketplaceLoadErrors(response),
      });
    } catch (error) {
      setMarketplaceState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listMarketplacePlugins, ready, selectedRootPath]);

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

  const upgradeMarketplaceCatalog = useCallback(async () => {
    setActionError(null);
    setUpgradePending(true);
    try {
      const response = await upgradeMarketplaces({});
      if (response.errors.length > 0) {
        setActionError(response.errors.map((error) => `${error.marketplaceName}: ${error.message}`).join("；"));
      }
      await refreshMarketplace();
    } catch (error) {
      setActionError(`更新插件市场失败：${toErrorMessage(error)}`);
    } finally {
      setUpgradePending(false);
    }
  }, [refreshMarketplace, upgradeMarketplaces]);

  useEffect(() => {
    void Promise.all([refreshInstalled(false), refreshMarketplace()]);
  }, [refreshInstalled, refreshMarketplace]);

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

  return {
    activeTab,
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
    refreshPending: installedState.loading || marketplaceState.loading || upgradePending,
    pendingPaths,
    pendingPluginIds,
    upgradePending,
    setActiveTab,
    setQuery,
    setMarketplaceFilter,
    setPluginStatusFilter,
    refresh,
    toggleSkillEnabled,
    installMarketplacePluginCard,
    uninstallMarketplacePluginCard,
    toggleMarketplacePluginEnabled,
    upgradeMarketplaceCatalog,
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
  return error instanceof Error ? error.message : String(error);
}

function formatMarketplaceLoadErrors(response: PluginListResponse): string | null {
  if (response.marketplaceLoadErrors.length === 0) {
    return null;
  }
  return response.marketplaceLoadErrors
    .map((error) => `${error.marketplacePath}: ${error.message}`)
    .join("；");
}
