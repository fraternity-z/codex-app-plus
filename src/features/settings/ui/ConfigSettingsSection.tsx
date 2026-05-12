import type { AppPreferencesController } from "../hooks/useAppPreferences";
import { useI18n } from "../../../i18n";
import type { AgentEnvironment, WriteProjectPermissionConfigInput } from "../../../bridge/types";
import type { ConfigReadResponse } from "../../../protocol/generated/v2/ConfigReadResponse";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { WorkspaceRoot } from "../../workspace";
import type { ConfigSnapshotMutationResult } from "../config/configOperations";
import { ComposerPermissionDefaultsCard } from "./ComposerPermissionDefaultsCard";

interface ConfigSettingsSectionProps {
  readonly preferences: AppPreferencesController;
  readonly agentEnvironment: AgentEnvironment;
  readonly configSnapshot: ConfigReadResponse | null;
  readonly selectedRoot: WorkspaceRoot | null;
  onOpenConfigToml: (filePath?: string | null) => Promise<void>;
  onOpenConfigDocs: () => Promise<void>;
  writeProjectPermissionConfig: (input: WriteProjectPermissionConfigInput) => Promise<unknown>;
  refreshConfigSnapshot: (cwd?: string | null) => Promise<ConfigReadResponse>;
  batchWriteConfigSnapshot: (params: ConfigBatchWriteParams) => Promise<ConfigSnapshotMutationResult>;
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="settings-panel-group settings-config-page">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.config.title")}</h1>
        <p className="settings-subtitle">
          {t("settings.config.subtitle")}
          {" "}
          <a
            className="settings-config-learn-more"
            href="https://developers.openai.com/codex/config-basic"
            onClick={(event) => {
              event.preventDefault();
              void props.onOpenConfigDocs();
            }}
            rel="noreferrer"
            target="_blank"
          >
            {t("settings.config.learnMore")}
          </a>
        </p>
      </header>
      <ComposerPermissionDefaultsCard
        preferences={props.preferences}
        agentEnvironment={props.agentEnvironment}
        configSnapshot={props.configSnapshot}
        selectedRoot={props.selectedRoot}
        onOpenConfigToml={props.onOpenConfigToml}
        writeProjectPermissionConfig={props.writeProjectPermissionConfig}
        refreshConfigSnapshot={props.refreshConfigSnapshot}
        batchWriteConfigSnapshot={props.batchWriteConfigSnapshot}
      />
    </div>
  );
}
