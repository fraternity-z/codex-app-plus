import { lazy, Suspense } from "react";
import type { WorkspaceRootController } from "../../workspace";
import { useSkillsScreenState } from "../hooks/useSkillsScreenState";
import { SettingsLoadingFallback } from "../../shared";
import type { SkillsViewProps } from "./SkillsView";

const LazySkillsView = lazy(async () => {
  const module = await import("./SkillsView");
  return { default: module.SkillsView };
});

interface SkillsScreenProps {
  readonly controller: Pick<
    SkillsViewProps,
    | "installMarketplacePlugin"
    | "listMarketplacePlugins"
    | "listMcpServerStatuses"
    | "listSkills"
    | "readMarketplacePlugin"
    | "removePath"
    | "setAppEnabled"
    | "setMarketplacePluginEnabled"
    | "uninstallMarketplacePlugin"
    | "writeConfigValue"
    | "writeSkillConfig"
  >;
  readonly onBackHome: () => void;
  readonly onOpenMcpSettings?: () => void;
  readonly onOpenLearnMore: () => Promise<void>;
  readonly workspace: WorkspaceRootController;
}

export function SkillsScreen(props: SkillsScreenProps): JSX.Element {
  const state = useSkillsScreenState();
  const selectedRootPath = props.workspace.selectedRoot?.path ?? null;

  const skillsProps: SkillsViewProps = {
    configSnapshot: state.configSnapshot,
    mcpServerStatuses: state.mcpServerStatuses,
    ready: state.initialized,
    selectedRootPath,
    notifications: state.notifications,
    onOpenMcpSettings: props.onOpenMcpSettings,
    onOpenLearnMore: props.onOpenLearnMore,
    listMcpServerStatuses: props.controller.listMcpServerStatuses,
    listSkills: props.controller.listSkills,
    listMarketplacePlugins: props.controller.listMarketplacePlugins,
    readMarketplacePlugin: props.controller.readMarketplacePlugin,
    setAppEnabled: props.controller.setAppEnabled,
    writeSkillConfig: props.controller.writeSkillConfig,
    removePath: props.controller.removePath,
    writeConfigValue: props.controller.writeConfigValue,
    installMarketplacePlugin: props.controller.installMarketplacePlugin,
    uninstallMarketplacePlugin: props.controller.uninstallMarketplacePlugin,
    setMarketplacePluginEnabled: props.controller.setMarketplacePluginEnabled,
  };

  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <LazySkillsView {...skillsProps} />
    </Suspense>
  );
}
