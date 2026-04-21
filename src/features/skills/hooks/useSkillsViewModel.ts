import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceivedNotification } from "../../../domain/types";
import type { AuthMode } from "../../../protocol/generated/AuthMode";
import type { PluginInstallParams } from "../../../protocol/generated/v2/PluginInstallParams";
import type { PluginInstallResponse } from "../../../protocol/generated/v2/PluginInstallResponse";
import type { PluginListParams } from "../../../protocol/generated/v2/PluginListParams";
import type { PluginListResponse } from "../../../protocol/generated/v2/PluginListResponse";
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
  type MarketplacePluginCard,
} from "../model/skillCatalog";

interface AsyncState<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: string | null;
}

interface SkillsViewModelOptions {
  readonly authStatus: "unknown" | "authenticated" | "needs_login";
  readonly authMode: AuthMode | null;
  readonly ready?: boolean;
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
}

export interface SkillsViewModel {
  readonly query: string;
  readonly installedSkills: ReadonlyArray<InstalledSkillCard>;
  readonly recommendedSkills: ReadonlyArray<MarketplacePluginCard>;
  readonly scanErrors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
  readonly installedError: string | null;
  readonly recommendedError: string | null;
  readonly actionError: string | null;
  readonly loadingInstalled: boolean;
  readonly loadingRecommended: boolean;
  readonly refreshPending: boolean;
  readonly pendingPaths: Readonly<Record<string, boolean>>;
  readonly installingIds: Readonly<Record<string, boolean>>;
  readonly setQuery: (value: string) => void;
  readonly refresh: () => Promise<void>;
  readonly toggleSkillEnabled: (skill: InstalledSkillCard) => Promise<void>;
  readonly installMarketplaceSkill: (skill: MarketplacePluginCard) => Promise<void>;
}

const EMPTY_LOCAL_CATALOG: InstalledSkillsCatalog = { skills: [], scanErrors: [] };
const EMPTY_RECOMMENDED_SKILLS: ReadonlyArray<MarketplacePluginCard> = [];

export function useSkillsViewModel(options: SkillsViewModelOptions): SkillsViewModel {
  const {
    authStatus,
    authMode,
    ready,
    selectedRootPath,
    notifications,
    listSkills,
    listMarketplacePlugins,
    writeSkillConfig,
    installMarketplacePlugin,
  } = options;
  const [query, setQuery] = useState("");
  const [installedState, setInstalledState] = useState<AsyncState<InstalledSkillsCatalog>>(
    createAsyncState(EMPTY_LOCAL_CATALOG),
  );
  const [recommendedState, setRecommendedState] = useState<AsyncState<ReadonlyArray<MarketplacePluginCard>>>(
    createAsyncState(EMPTY_RECOMMENDED_SKILLS),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<Readonly<Record<string, boolean>>>({});
  const [installingIds, setInstallingIds] = useState<Readonly<Record<string, boolean>>>({});
  const lastHandledSkillsChangeRef = useRef(0);

  const recommendedUnavailableReason = useMemo(
    () => getRecommendedUnavailableReason(authStatus, authMode),
    [authMode, authStatus],
  );

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

  const refreshRecommended = useCallback(async () => {
    if (ready === false) {
      setRecommendedState((current) => ({ ...current, loading: true, error: null }));
      return;
    }
    if (recommendedUnavailableReason !== null) {
      setRecommendedState({
        data: EMPTY_RECOMMENDED_SKILLS,
        loading: false,
        error: recommendedUnavailableReason,
      });
      return;
    }
    setRecommendedState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listMarketplacePlugins(createPluginListParams(selectedRootPath));
      setRecommendedState({
        data: createMarketplacePluginCards(response),
        loading: false,
        error: formatMarketplaceLoadErrors(response),
      });
    } catch (error) {
      setRecommendedState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listMarketplacePlugins, ready, recommendedUnavailableReason, selectedRootPath]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshInstalled(true), refreshRecommended()]);
  }, [refreshInstalled, refreshRecommended]);

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

  const installMarketplaceSkill = useCallback(async (skill: MarketplacePluginCard) => {
    if (recommendedUnavailableReason !== null) {
      setActionError(recommendedUnavailableReason);
      return;
    }
    setActionError(null);
    setInstallingIds((current) => ({ ...current, [skill.id]: true }));
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
      await refreshRecommended();
    } catch (error) {
      setActionError(`安装推荐插件失败：${toErrorMessage(error)}`);
    } finally {
      setInstallingIds((current) => omitRecordKey(current, skill.id));
    }
  }, [installMarketplacePlugin, recommendedUnavailableReason, refreshInstalled, refreshRecommended]);

  useEffect(() => {
    void Promise.all([refreshInstalled(false), refreshRecommended()]);
  }, [refreshInstalled, refreshRecommended]);

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
  const recommendedSkills = useMemo(
    () => filterMarketplacePluginCards(recommendedState.data, query),
    [query, recommendedState.data],
  );

  return {
    query,
    installedSkills,
    recommendedSkills,
    scanErrors: installedState.data.scanErrors,
    installedError: installedState.error,
    recommendedError: recommendedState.error,
    actionError,
    loadingInstalled: installedState.loading,
    loadingRecommended: recommendedState.loading,
    refreshPending: installedState.loading || recommendedState.loading,
    pendingPaths,
    installingIds,
    setQuery,
    refresh,
    toggleSkillEnabled,
    installMarketplaceSkill,
  };
}

function getRecommendedUnavailableReason(
  authStatus: "unknown" | "authenticated" | "needs_login",
  authMode: AuthMode | null,
): string | null {
  if (authStatus === "needs_login") {
    return "推荐插件仅支持 ChatGPT 登录。请先完成 ChatGPT 登录后再刷新。";
  }
  if (authStatus === "unknown") {
    return "正在检测认证状态，暂时无法加载推荐插件。";
  }
  if (authMode === "chatgpt" || authMode === "chatgptAuthTokens") {
    return null;
  }
  return "推荐插件仅支持 ChatGPT 登录；当前是 API Key 认证，官方插件市场链路不可用。";
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
