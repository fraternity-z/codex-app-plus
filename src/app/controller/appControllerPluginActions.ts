import { useCallback, useMemo } from "react";
import { ProtocolClient } from "../../protocol/client";
import type {
  ConfigWriteResponse,
  FsRemoveParams,
  FsRemoveResponse,
  MarketplaceAddParams,
  MarketplaceAddResponse,
  MarketplaceRemoveParams,
  MarketplaceRemoveResponse,
  PluginInstallParams,
  PluginInstallResponse,
  PluginListParams,
  PluginListResponse,
  PluginReadParams,
  PluginReadResponse,
  PluginUninstallParams,
  PluginUninstallResponse,
  SkillsConfigWriteParams,
  SkillsConfigWriteResponse,
  SkillsListParams,
  SkillsListResponse,
} from "./appControllerTypes";

export interface AppControllerPluginActions {
  readonly listSkills: (params: SkillsListParams) => Promise<SkillsListResponse>;
  readonly listMarketplacePlugins: (params: PluginListParams) => Promise<PluginListResponse>;
  readonly addMarketplace: (params: MarketplaceAddParams) => Promise<MarketplaceAddResponse>;
  readonly removeMarketplace: (params: MarketplaceRemoveParams) => Promise<MarketplaceRemoveResponse>;
  readonly readMarketplacePlugin: (params: PluginReadParams) => Promise<PluginReadResponse>;
  readonly writeSkillConfig: (params: SkillsConfigWriteParams) => Promise<SkillsConfigWriteResponse>;
  readonly removePath: (params: FsRemoveParams) => Promise<FsRemoveResponse>;
  readonly installMarketplacePlugin: (params: PluginInstallParams) => Promise<PluginInstallResponse>;
  readonly uninstallMarketplacePlugin: (params: PluginUninstallParams) => Promise<PluginUninstallResponse>;
  readonly setAppEnabled: (appId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
  readonly setMarketplacePluginEnabled: (pluginId: string, enabled: boolean) => Promise<ConfigWriteResponse>;
}

interface UseAppControllerPluginActionsArgs {
  readonly client: ProtocolClient;
}

export function useAppControllerPluginActions({
  client,
}: UseAppControllerPluginActionsArgs): AppControllerPluginActions {
  const listSkills = useCallback((params: SkillsListParams) => (
    client.request("skills/list", params) as Promise<SkillsListResponse>
  ), [client]);
  const listMarketplacePlugins = useCallback((params: PluginListParams) => (
    client.request("plugin/list", params) as Promise<PluginListResponse>
  ), [client]);
  const addMarketplace = useCallback((params: MarketplaceAddParams) => (
    client.request("marketplace/add", params) as Promise<MarketplaceAddResponse>
  ), [client]);
  const removeMarketplace = useCallback((params: MarketplaceRemoveParams) => (
    client.request("marketplace/remove", params) as Promise<MarketplaceRemoveResponse>
  ), [client]);
  const readMarketplacePlugin = useCallback((params: PluginReadParams) => (
    client.request("plugin/read", params) as Promise<PluginReadResponse>
  ), [client]);
  const writeSkillConfig = useCallback((params: SkillsConfigWriteParams) => (
    client.request("skills/config/write", params) as Promise<SkillsConfigWriteResponse>
  ), [client]);
  const removePath = useCallback((params: FsRemoveParams) => (
    client.request("fs/remove", params) as Promise<FsRemoveResponse>
  ), [client]);
  const installMarketplacePlugin = useCallback((params: PluginInstallParams) => (
    client.request("plugin/install", params) as Promise<PluginInstallResponse>
  ), [client]);
  const uninstallMarketplacePlugin = useCallback((params: PluginUninstallParams) => (
    client.request("plugin/uninstall", params) as Promise<PluginUninstallResponse>
  ), [client]);
  const setAppEnabled = useCallback((appId: string, enabled: boolean) => (
    client.request("config/value/write", {
      keyPath: `apps.${appId}.enabled`,
      value: enabled,
      mergeStrategy: "upsert",
      filePath: null,
      expectedVersion: null,
    }) as Promise<ConfigWriteResponse>
  ), [client]);
  const setMarketplacePluginEnabled = useCallback((pluginId: string, enabled: boolean) => (
    client.request("config/value/write", {
      keyPath: `plugins.${pluginId}`,
      value: { enabled },
      mergeStrategy: "upsert",
      filePath: null,
      expectedVersion: null,
    }) as Promise<ConfigWriteResponse>
  ), [client]);

  return useMemo(() => ({
    addMarketplace,
    installMarketplacePlugin,
    listMarketplacePlugins,
    listSkills,
    readMarketplacePlugin,
    removeMarketplace,
    removePath,
    setAppEnabled,
    setMarketplacePluginEnabled,
    uninstallMarketplacePlugin,
    writeSkillConfig,
  }), [
    addMarketplace,
    installMarketplacePlugin,
    listMarketplacePlugins,
    listSkills,
    readMarketplacePlugin,
    removeMarketplace,
    removePath,
    setAppEnabled,
    setMarketplacePluginEnabled,
    uninstallMarketplacePlugin,
    writeSkillConfig,
  ]);
}
