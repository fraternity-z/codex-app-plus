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
  readonly onOpenLearnMore: () => Promise<void>;
  readonly workspace: WorkspaceRootController;
}

export function SkillsScreen(props: SkillsScreenProps): JSX.Element {
  const state = useSkillsScreenState();
  const selectedRootPath = props.workspace.selectedRoot?.path ?? null;

  const skillsProps: SkillsViewProps = {
    ready: state.initialized,
    selectedRootPath,
    notifications: state.notifications,
    onBackHome: props.onBackHome,
    onOpenLearnMore: props.onOpenLearnMore,
    onTryPlugin: (plugin) => {
      props.controller.setInput(createPluginTryPrompt(plugin));
      props.onBackHome();
    },
    listSkills: props.controller.listSkills,
    listMarketplacePlugins: props.controller.listMarketplacePlugins,
    upgradeMarketplaces: props.controller.upgradeMarketplaces,
    writeSkillConfig: props.controller.writeSkillConfig,
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
