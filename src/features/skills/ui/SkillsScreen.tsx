import { lazy, Suspense } from "react";
import type { WorkspaceRootController } from "../../workspace/hooks/useWorkspaceRoots";
import type { AppController } from "../../../app/controller/appControllerTypes";
import { useSkillsScreenState } from "../../../app/controller/appControllerState";
import { SettingsLoadingFallback } from "../../../app/ui/SettingsLoadingFallback";
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
    authStatus: state.authStatus,
    authMode: state.authMode === "apikey" || state.authMode === "chatgpt" || state.authMode === "chatgptAuthTokens"
      ? state.authMode
      : null,
    ready: state.initialized,
    selectedRootPath,
    notifications: state.notifications,
    onBackHome: props.onBackHome,
    onOpenLearnMore: props.onOpenLearnMore,
    listSkills: props.controller.listSkills,
    listMarketplacePlugins: props.controller.listMarketplacePlugins,
    writeSkillConfig: props.controller.writeSkillConfig,
    installMarketplacePlugin: props.controller.installMarketplacePlugin,
  };

  return (
    <Suspense fallback={<SettingsLoadingFallback />}>
      <LazySkillsView {...skillsProps} />
    </Suspense>
  );
}
