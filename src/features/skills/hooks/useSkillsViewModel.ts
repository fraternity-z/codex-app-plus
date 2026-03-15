import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReceivedNotification } from "../../../domain/types";
import type { SkillsConfigWriteParams } from "../../../protocol/generated/v2/SkillsConfigWriteParams";
import type { SkillsConfigWriteResponse } from "../../../protocol/generated/v2/SkillsConfigWriteResponse";
import type { SkillsListParams } from "../../../protocol/generated/v2/SkillsListParams";
import type { SkillsListResponse } from "../../../protocol/generated/v2/SkillsListResponse";
import type { SkillsRemoteReadParams } from "../../../protocol/generated/v2/SkillsRemoteReadParams";
import type { SkillsRemoteReadResponse } from "../../../protocol/generated/v2/SkillsRemoteReadResponse";
import type { SkillsRemoteWriteParams } from "../../../protocol/generated/v2/SkillsRemoteWriteParams";
import type { SkillsRemoteWriteResponse } from "../../../protocol/generated/v2/SkillsRemoteWriteResponse";
import {
  createInstalledSkillsCatalog,
  createRemoteSkillCards,
  filterInstalledSkillCards,
  filterRemoteSkillCards,
  replaceInstalledSkillEnabled,
  type InstalledSkillCard,
  type InstalledSkillsCatalog,
  type RemoteSkillCard,
} from "../model/skillCatalog";

const REMOTE_SKILLS_PARAMS: SkillsRemoteReadParams = {
  hazelnutScope: "all-shared",
  productSurface: "codex",
  enabled: true,
};

interface AsyncState<T> {
  readonly data: T;
  readonly loading: boolean;
  readonly error: string | null;
}

interface SkillsViewModelOptions {
  readonly selectedRootPath: string | null;
  readonly notifications: ReadonlyArray<ReceivedNotification>;
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listRemoteSkills: (params: SkillsRemoteReadParams) => Promise<SkillsRemoteReadResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly exportRemoteSkill: (params: SkillsRemoteWriteParams) => Promise<SkillsRemoteWriteResponse>;
}

export interface SkillsViewModel {
  readonly query: string;
  readonly installedSkills: ReadonlyArray<InstalledSkillCard>;
  readonly recommendedSkills: ReadonlyArray<RemoteSkillCard>;
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
  readonly installRemoteSkill: (skill: RemoteSkillCard) => Promise<void>;
}

const EMPTY_LOCAL_CATALOG: InstalledSkillsCatalog = { skills: [], scanErrors: [] };
const EMPTY_REMOTE_SKILLS: ReadonlyArray<RemoteSkillCard> = [];

export function useSkillsViewModel(options: SkillsViewModelOptions): SkillsViewModel {
  const {
    selectedRootPath,
    notifications,
    listSkills,
    listRemoteSkills,
    writeSkillConfig,
    exportRemoteSkill,
  } = options;
  const [query, setQuery] = useState("");
  const [installedState, setInstalledState] = useState<AsyncState<InstalledSkillsCatalog>>(
    createAsyncState(EMPTY_LOCAL_CATALOG),
  );
  const [recommendedState, setRecommendedState] = useState<AsyncState<ReadonlyArray<RemoteSkillCard>>>(
    createAsyncState(EMPTY_REMOTE_SKILLS),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<Readonly<Record<string, boolean>>>({});
  const [installingIds, setInstallingIds] = useState<Readonly<Record<string, boolean>>>({});
  const lastHandledSkillsChangeRef = useRef(0);

  const refreshInstalled = useCallback(async (forceReload: boolean) => {
    setInstalledState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listSkills(createSkillsListParams(selectedRootPath, forceReload));
      setInstalledState({ data: createInstalledSkillsCatalog(response.data), loading: false, error: null });
    } catch (error) {
      setInstalledState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listSkills, selectedRootPath]);

  const refreshRecommended = useCallback(async () => {
    setRecommendedState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await listRemoteSkills(REMOTE_SKILLS_PARAMS);
      setRecommendedState({ data: createRemoteSkillCards(response.data), loading: false, error: null });
    } catch (error) {
      setRecommendedState((current) => ({ ...current, loading: false, error: toErrorMessage(error) }));
    }
  }, [listRemoteSkills]);

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

  const installRemoteSkill = useCallback(async (skill: RemoteSkillCard) => {
    setActionError(null);
    setInstallingIds((current) => ({ ...current, [skill.id]: true }));
    try {
      await exportRemoteSkill({ hazelnutId: skill.id });
      await refreshInstalled(true);
    } catch (error) {
      setActionError(`安装推荐技能失败：${toErrorMessage(error)}`);
    } finally {
      setInstallingIds((current) => omitRecordKey(current, skill.id));
    }
  }, [exportRemoteSkill, refreshInstalled]);

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
    () => filterRemoteSkillCards(recommendedState.data, query),
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
    installRemoteSkill,
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
