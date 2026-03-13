import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigMutationResult, McpRefreshResult } from "../../settings/config/configOperations";
import { omitServer, readMcpConfigView, type JsonObject, type McpConfigServerView } from "../../settings/config/mcpConfig";
import { MCP_RECOMMENDED_PRESETS } from "../../settings/config/mcpPresets";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import type { McpServerStatus } from "../../../protocol/generated/v2/McpServerStatus";
import { McpServerDialog } from "./McpServerDialog";

interface McpSettingsPanelProps {
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  refreshMcpData: () => Promise<McpRefreshResult>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<ConfigMutationResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<ConfigMutationResult>;
}

function ToggleSwitch(props: { readonly checked: boolean; readonly disabled?: boolean; readonly onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={props.checked ? "settings-toggle settings-toggle-on" : "settings-toggle"} role="switch" aria-checked={props.checked} disabled={props.disabled} onClick={props.onClick}>
      <span className="settings-toggle-knob" />
    </button>
  );
}

function RuntimeMeta(props: { readonly server: McpConfigServerView }): JSX.Element {
  const runtime = props.server.runtime;
  return <span className="mcp-runtime-badge">{runtime === null ? "未加载状态" : `工具 ${runtime.toolCount} · 资源 ${runtime.resourceCount} · 鉴权 ${runtime.authStatus}`}</span>;
}

function ServerRow(props: {
  readonly server: McpConfigServerView;
  readonly pending: boolean;
  readonly readOnly?: boolean;
  onToggle?: (server: McpConfigServerView, enabled: boolean) => void;
  onEdit?: (server: McpConfigServerView) => void;
  onDelete?: (server: McpConfigServerView) => void;
}): JSX.Element {
  return (
    <div className="mcp-server-row">
      <div className="mcp-server-main">
        <div className="mcp-server-title-row"><strong>{props.server.name}</strong><span className="mcp-chip">{props.server.id}</span><span className="mcp-chip">{props.server.originLabel}</span><span className="mcp-chip">{props.server.type}</span></div>
        <div className="mcp-server-meta-row"><RuntimeMeta server={props.server} /></div>
      </div>
      <div className="mcp-server-actions">
        {props.readOnly ? <span className="mcp-readonly-label">只读</span> : <ToggleSwitch checked={props.server.enabled} disabled={props.pending} onClick={() => props.onToggle?.(props.server, !props.server.enabled)} />}
        {!props.readOnly ? <button type="button" className="settings-action-btn settings-action-btn-sm" disabled={props.pending} onClick={() => props.onEdit?.(props.server)}>编辑</button> : null}
        {!props.readOnly ? <button type="button" className="settings-action-btn settings-action-btn-sm mcp-danger-btn" disabled={props.pending} onClick={() => props.onDelete?.(props.server)}>删除</button> : null}
      </div>
    </div>
  );
}

function DeleteDialog(props: { readonly server: McpConfigServerView | null; readonly pending: boolean; onCancel: () => void; onConfirm: (server: McpConfigServerView) => void }): JSX.Element | null {
  const server = props.server;
  if (server === null) {
    return null;
  }
  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={props.onCancel}>
      <section className="settings-dialog mcp-confirm-dialog" role="dialog" aria-modal="true" aria-label="删除 MCP 服务器" onClick={(event) => event.stopPropagation()}>
        <header className="settings-dialog-header"><strong>删除 MCP 服务器</strong><button type="button" className="settings-dialog-close" onClick={props.onCancel} aria-label="关闭">×</button></header>
        <div className="settings-dialog-body mcp-confirm-body">
          <p>将从用户配置中删除 <strong>{server.name}</strong>（{server.id}）。</p>
          <div className="mcp-form-actions"><button type="button" className="settings-action-btn" onClick={props.onCancel} disabled={props.pending}>取消</button><button type="button" className="settings-action-btn settings-action-btn-primary" onClick={() => props.onConfirm(server)} disabled={props.pending}>{props.pending ? "删除中…" : "确认删除"}</button></div>
        </div>
      </section>
    </div>
  );
}

export function McpSettingsPanel(props: McpSettingsPanelProps): JSX.Element {
  const [statuses, setStatuses] = useState<ReadonlyArray<McpServerStatus>>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogServer, setDialogServer] = useState<McpConfigServerView | null | undefined>(undefined);
  const [deleteServer, setDeleteServer] = useState<McpConfigServerView | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const view = useMemo(() => readMcpConfigView(props.configSnapshot, statuses), [props.configSnapshot, statuses]);
  const syncStatuses = useCallback((items: ReadonlyArray<McpServerStatus>) => {
    setStatuses(items);
    setErrorMessage(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await props.refreshMcpData();
      syncStatuses(result.statuses);
    } catch (error) {
      setErrorMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, [props.refreshMcpData, syncStatuses]);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

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

  const handleDelete = useCallback((server: McpConfigServerView) => {
    void runMutation(`delete:${server.id}`, () => props.batchWriteConfig({ edits: [{ keyPath: "mcp_servers", value: omitServer(view.userServerMap, server.id), mergeStrategy: "replace" }], filePath: view.writeTarget.filePath, expectedVersion: view.writeTarget.expectedVersion })).then(() => setDeleteServer(null));
  }, [props.batchWriteConfig, runMutation, view.userServerMap, view.writeTarget]);

  const handleInstall = useCallback((presetId: string) => {
    const preset = MCP_RECOMMENDED_PRESETS.find((item) => item.id === presetId);
    if (preset === undefined) {
      return;
    }
    void runMutation(`install:${preset.id}`, () => props.writeConfigValue({ keyPath: `mcp_servers.${preset.id}`, value: preset.value, mergeStrategy: "upsert", filePath: view.writeTarget.filePath, expectedVersion: view.writeTarget.expectedVersion }));
  }, [props.writeConfigValue, runMutation, view.writeTarget]);

  const handleSubmit = useCallback(async (serverId: string, value: JsonObject) => {
    await runMutation(`save:${serverId}`, () => props.writeConfigValue({ keyPath: `mcp_servers.${serverId}`, value, mergeStrategy: "upsert", filePath: view.writeTarget.filePath, expectedVersion: view.writeTarget.expectedVersion }));
    setDialogServer(undefined);
    setSubmitError(null);
  }, [props.writeConfigValue, runMutation, view.writeTarget]);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap"><h1 className="settings-page-title">MCP 服务器</h1><p className="settings-subtitle">管理用户配置中的 Model Context Protocol 服务器。</p></header>
      <section className="settings-card">
        <div className="settings-section-head"><strong>自定义服务器</strong><div className="mcp-head-actions"><button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => setDialogServer(null)} disabled={props.busy || pendingKey !== null}>添加服务器</button><button type="button" className="settings-action-btn settings-action-btn-sm" onClick={() => void handleRefresh()} disabled={loading || pendingKey !== null}>{loading ? "刷新中…" : "刷新状态"}</button></div></div>
        {errorMessage ? <p className="settings-note mcp-error-note">{errorMessage}</p> : null}
        <p className="settings-note">写入目标：{view.writeTarget.filePath ?? "默认用户 config.toml"}</p>
        {view.userServers.length === 0 ? <div className="settings-empty">当前没有可编辑的用户层 MCP 服务器。</div> : view.userServers.map((server) => <ServerRow key={server.id} server={server} pending={pendingKey === server.id || pendingKey === `delete:${server.id}` || pendingKey === `save:${server.id}`} onToggle={handleToggle} onEdit={setDialogServer} onDelete={setDeleteServer} />)}
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>只读服务器</strong></div>
        {view.readOnlyServers.length === 0 ? <div className="settings-empty">没有来自项目或系统层的只读服务器。</div> : view.readOnlyServers.map((server) => <ServerRow key={server.id} server={server} pending={false} readOnly />)}
      </section>
      <section className="settings-card">
        <div className="settings-section-head"><strong>推荐服务器</strong></div>
        {MCP_RECOMMENDED_PRESETS.map((preset) => (
          <div key={preset.id} className="settings-reco-row">
            <div className="settings-reco-avatar">M</div>
            <div className="settings-reco-text"><strong>{preset.label} <span>提供方：{preset.vendor}</span></strong><p>{preset.description}</p></div>
            <button type="button" className="settings-mini-btn" disabled={view.installedPresetIds.has(preset.id) || pendingKey === `install:${preset.id}`} onClick={() => handleInstall(preset.id)}>{view.installedPresetIds.has(preset.id) ? "已安装" : pendingKey === `install:${preset.id}` ? "安装中…" : "安装"}</button>
          </div>
        ))}
      </section>
      <McpServerDialog open={dialogServer !== undefined} saving={pendingKey !== null} server={dialogServer ?? null} submitError={submitError} onClose={() => { setDialogServer(undefined); setSubmitError(null); }} onSubmit={handleSubmit} />
      <DeleteDialog server={deleteServer} pending={pendingKey !== null} onCancel={() => setDeleteServer(null)} onConfirm={handleDelete} />
    </div>
  );
}
