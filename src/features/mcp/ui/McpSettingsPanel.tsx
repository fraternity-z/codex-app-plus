import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigMutationResult, McpRefreshResult } from "../../settings/config/configOperations";
import { readMcpConfigView, type JsonObject, type McpConfigServerView } from "../../settings/config/mcpConfig";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import { useI18n } from "../../../i18n";
import { McpServerDialog } from "./McpServerDialog";

interface McpSettingsPanelProps {
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  readonly ready?: boolean;
  refreshMcpData: () => Promise<McpRefreshResult>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
  onOpenMcpDocs?: () => Promise<void>;
}

function ToggleSwitch(props: { readonly checked: boolean; readonly disabled?: boolean; readonly onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"} role="switch" aria-checked={props.checked} disabled={props.disabled} onClick={props.onClick}>
      <span className="settings-toggle-knob" />
    </button>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg className="mcp-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.9 1.8h2.2l.4 1.5c.4.1.8.3 1.1.5l1.4-.8 1.5 1.5-.8 1.4c.2.4.4.7.5 1.1l1.5.4v2.2l-1.5.4c-.1.4-.3.8-.5 1.1l.8 1.4-1.5 1.5-1.4-.8c-.4.2-.7.4-1.1.5l-.4 1.5H6.9l-.4-1.5c-.4-.1-.8-.3-1.1-.5l-1.4.8-1.5-1.5.8-1.4c-.2-.4-.4-.7-.5-1.1l-1.5-.4V7.4l1.5-.4c.1-.4.3-.8.5-1.1l-.8-1.4L4 3l1.4.8c.4-.2.7-.4 1.1-.5l.4-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg className="mcp-inline-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ServerRow(props: {
  readonly server: McpConfigServerView;
  readonly pending: boolean;
  onToggle?: (server: McpConfigServerView, enabled: boolean) => void;
  onEdit?: (server: McpConfigServerView) => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="mcp-server-row">
      <strong className="mcp-server-name">{props.server.name}</strong>
      <div className="mcp-server-actions">
        <button
          type="button"
          className="mcp-icon-button"
          disabled={props.pending}
          aria-label={t("settings.mcp.editServerAria", { name: props.server.name })}
          onClick={() => props.onEdit?.(props.server)}
        >
          <GearIcon />
        </button>
        <ToggleSwitch checked={props.server.enabled} disabled={props.pending} onClick={() => props.onToggle?.(props.server, !props.server.enabled)} />
      </div>
    </div>
  );
}

function CustomServersSection(props: {
  readonly view: ReturnType<typeof readMcpConfigView>;
  readonly busy: boolean;
  readonly pendingKey: string | null;
  readonly errorMessage: string | null;
  readonly onAdd: () => void;
  readonly onToggle: (server: McpConfigServerView, enabled: boolean) => void;
  readonly onEdit: (server: McpConfigServerView) => void;
}): JSX.Element {
  const { t } = useI18n();

  return (
    <section className="mcp-server-section">
      <div className="mcp-server-section-head">
        <strong>{t("settings.mcp.customTitle")}</strong>
        <button type="button" className="mcp-add-server-button" onClick={props.onAdd} disabled={props.busy || props.pendingKey !== null}>
          <PlusIcon />
          <span>{t("settings.mcp.addServerAction")}</span>
        </button>
      </div>
      {props.errorMessage ? <p className="settings-note mcp-error-note">{props.errorMessage}</p> : null}
      <div className="settings-card mcp-server-list-card">
        {props.view.userServers.length === 0
          ? <div className="settings-empty">{t("settings.mcp.emptyUserServers")}</div>
          : props.view.userServers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              pending={props.pendingKey === server.id || props.pendingKey === `save:${server.id}`}
              onToggle={props.onToggle}
              onEdit={props.onEdit}
            />
          ))}
      </div>
    </section>
  );
}


export function McpSettingsPanel(props: McpSettingsPanelProps): JSX.Element {
  const { t } = useI18n();
  const [statuses, setStatuses] = useState<ReadonlyArray<McpServerStatus>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogServer, setDialogServer] = useState<McpConfigServerView | null | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const view = useMemo(() => readMcpConfigView(props.configSnapshot, statuses), [props.configSnapshot, statuses]);
  const syncStatuses = useCallback((items: ReadonlyArray<McpServerStatus>) => {
    setStatuses(items);
    setErrorMessage(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (props.ready === false) {
      return;
    }
    try {
      const result = await props.refreshMcpData();
      syncStatuses(result.statuses);
    } catch (error) {
      setErrorMessage(String(error));
    }
  }, [props.ready, props.refreshMcpData, syncStatuses]);

  useEffect(() => {
    if (props.ready === false) {
      setErrorMessage(null);
      return;
    }
    void handleRefresh();
  }, [handleRefresh, props.ready]);

  const runMutation = useCallback(async (key: string, runner: () => Promise<ConfigMutationResult>) => {
    setPendingKey(key);
    setSubmitError(null);
    setErrorMessage(null);
    try {
      const result = await runner();
      syncStatuses(result.statuses);
      return result;
    } catch (error) {
      const message = String(error);
      setErrorMessage(message);
      setSubmitError(message);
      throw error;
    } finally {
      setPendingKey(null);
    }
  }, [syncStatuses]);

  const handleToggle = useCallback((server: McpConfigServerView, enabled: boolean) => {
    void runMutation(server.id, () => props.writeConfigValue({ keyPath: `mcp_servers.${server.id}.enabled`, value: enabled, mergeStrategy: "upsert", filePath: view.writeTarget.filePath, expectedVersion: view.writeTarget.expectedVersion }));
  }, [props.writeConfigValue, runMutation, view.writeTarget]);

  const handleSubmit = useCallback(async (serverId: string, value: JsonObject) => {
    await runMutation(`save:${serverId}`, () => props.writeConfigValue({ keyPath: `mcp_servers.${serverId}`, value, mergeStrategy: "upsert", filePath: view.writeTarget.filePath, expectedVersion: view.writeTarget.expectedVersion }));
    setDialogServer(undefined);
    setSubmitError(null);
  }, [props.writeConfigValue, runMutation, view.writeTarget]);

  if (dialogServer !== undefined) {
    return (
      <McpServerDialog
        open
        saving={pendingKey !== null}
        server={dialogServer}
        submitError={submitError}
        onClose={() => { setDialogServer(undefined); setSubmitError(null); }}
        onOpenDocs={props.onOpenMcpDocs}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div className="settings-panel-group mcp-settings-page">
      <header className="settings-title-wrap"><h1 className="settings-page-title">{t("settings.mcp.title")}</h1></header>
      <CustomServersSection view={view} busy={props.busy} pendingKey={pendingKey} errorMessage={errorMessage} onAdd={() => setDialogServer(null)} onToggle={handleToggle} onEdit={setDialogServer} />
    </div>
  );
}
