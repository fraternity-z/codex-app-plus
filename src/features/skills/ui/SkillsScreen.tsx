import { lazy, Suspense } from "react";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../../../app/controller/appControllerTypes";
import { useSkillsScreenState } from "../../../app/controller/appControllerState";
import { SettingsLoadingFallback } from "../../../app/ui/SettingsLoadingFallback";
import type { MarketplacePluginCard } from "../model/skillCatalog";
import type { SkillsViewProps } from "./SkillsView";

const LazySkillsView = lazy(async () => {
  const module = await import("./SkillsView");
  return { default: module.SkillsView };
});

interface SkillsScreenProps {
  readonly controller: AppController;
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
    onTryPlugin: (plugin) => {
      props.controller.setInput(createPluginTryPrompt(plugin));
      props.onBackHome();
    },
    listMcpServerStatuses: props.controller.listMcpServerStatuses,
    listSkills: props.controller.listSkills,
    listMarketplacePlugins: props.controller.listMarketplacePlugins,
    readMarketplacePlugin: props.controller.readMarketplacePlugin,
    setAppEnabled: props.controller.setAppEnabled,
    writeSkillConfig: props.controller.writeSkillConfig,
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

function createPluginTryPrompt(plugin: MarketplacePluginCard): string {
  const prompt = plugin.defaultPrompts[0]?.trim();
  return prompt && prompt.length > 0 ? `@${plugin.pluginName} ${prompt}` : `@${plugin.pluginName} `;
}
