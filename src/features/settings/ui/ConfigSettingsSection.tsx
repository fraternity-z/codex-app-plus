import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import type {
  CodexProviderApplyResult,
  CodexProviderDraft,
  CodexProviderRecord,
  CodexProviderStore,
  DeleteCodexProviderInput,
} from "../../../bridge/types";
import type { WindowsSandboxSetupState } from "../../../domain/types";
import type { WindowsSandboxSetupMode } from "../../../protocol/generated/v2/WindowsSandboxSetupMode";
import {
  createEmptyCodexProviderDraft,
  createDraftFromRecord,
  readCurrentCodexProviderKey,
} from "../config/codexProviderConfig";
import { CodexProviderDialog } from "./CodexProviderDialog";
import { WindowsSandboxSettingsCard } from "./WindowsSandboxSettingsCard";

const LazyOpenSourceLicensesDialog = lazy(async () => {
  const module = await import("../../shared/ui/OpenSourceLicensesDialog");
  return { default: module.OpenSourceLicensesDialog };
});

interface ConfigSettingsSectionProps {
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  onOpenConfigToml: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<unknown>;
  refreshAuthState: () => Promise<void>;
  listCodexProviders: () => Promise<CodexProviderStore>;
  upsertCodexProvider: (input: CodexProviderDraft) => Promise<CodexProviderRecord>;
  deleteCodexProvider: (input: DeleteCodexProviderInput) => Promise<CodexProviderStore>;
  applyCodexProvider: (input: { readonly id: string }) => Promise<CodexProviderApplyResult>;
  readonly windowsSandboxSetup: WindowsSandboxSetupState;
  readonly startWindowsSandboxSetup: (mode: WindowsSandboxSetupMode) => Promise<unknown>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [providers, setProviders] = useState<ReadonlyArray<CodexProviderRecord>>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<CodexProviderDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CodexProviderRecord | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);

  const currentProviderKey = useMemo(
    () => readCurrentCodexProviderKey(props.configSnapshot),
    [props.configSnapshot]
  );

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const store = await props.listCodexProviders();
      setProviders(store.providers);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [props.listCodexProviders]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleSave = async (draft: CodexProviderDraft, applyAfterSave: boolean) => {
    setSaving(true);
    setSubmitError(null);
    setNoticeMessage(null);
    try {
      const saved = await props.upsertCodexProvider(draft);
      if (applyAfterSave) {
        await props.applyCodexProvider({ id: saved.id });
        await Promise.all([props.refreshConfigSnapshot(), props.refreshAuthState()]);
        setNoticeMessage(`已应用提供商：${saved.name}`);
      } else {
        setNoticeMessage(`已保存提供商：${saved.name}`);
      }
      await loadProviders();
      setEditingDraft(null);
    } catch (error) {
      setSubmitError(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async (provider: CodexProviderRecord) => {
    setPendingProviderId(provider.id);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      await props.applyCodexProvider({ id: provider.id });
      await Promise.all([props.refreshConfigSnapshot(), props.refreshAuthState()]);
      setNoticeMessage(`已应用提供商：${provider.name}`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPendingProviderId(null);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget === null) {
      return;
    }
    setPendingProviderId(deleteTarget.id);
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const store = await props.deleteCodexProvider({ id: deleteTarget.id });
      setProviders(store.providers);
      setDeleteTarget(null);
      setNoticeMessage(`已删除提供商：${deleteTarget.name}`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPendingProviderId(null);
    }
  };

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">配置</h1>
        <p className="settings-subtitle">管理当前 Codex live 配置，并保存可复用的提供商模板。</p>
      </header>
      <section className="settings-card settings-config-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">用户配置</div>
            <p className="settings-row-meta">打开 `~/.codex/config.toml`。</p>
          </div>
          <button type="button" className="settings-action-btn" onClick={() => void props.onOpenConfigToml()}>
            打开配置文件
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">开源许可</div>
            <p className="settings-row-meta">查看当前桌面端打包的第三方许可清单。</p>
          </div>
          <button type="button" className="settings-action-btn" onClick={() => setLicensesOpen(true)}>
            查看许可
          </button>
        </div>
      </section>
      <WindowsSandboxSettingsCard busy={props.busy} configSnapshot={props.configSnapshot} setupState={props.windowsSandboxSetup} onStartSetup={props.startWindowsSandboxSetup} />
      <section className="settings-card codex-provider-card">
        <div className="settings-section-head">
          <strong>提供商配置</strong>
          <button type="button" className="settings-head-action" onClick={() => {
            setEditingDraft(createEmptyCodexProviderDraft());
            setSubmitError(null);
          }}>
            新增提供商
          </button>
        </div>
        <p className="settings-note settings-note-pad">保存到应用本地文件；“一键应用”只覆盖当前提供商相关 live 配置。</p>
        {noticeMessage ? <p className="settings-status-note settings-status-note-success">{noticeMessage}</p> : null}
        {errorMessage ? <p className="settings-status-note settings-status-note-error">{errorMessage}</p> : null}
        {loading ? <div className="settings-empty">正在加载提供商列表…</div> : null}
        {!loading && providers.length === 0 ? <div className="settings-empty">暂无提供商，点击“新增提供商”开始配置。</div> : null}
        {!loading
          ? providers.map((provider) => (
              <div key={provider.id} className="codex-provider-row">
                <div className="codex-provider-main">
                  <div className="codex-provider-title-row">
                    <strong>{provider.name}</strong>
                    <span className="settings-chip settings-chip-sm">{provider.providerKey}</span>
                    {provider.providerKey === currentProviderKey ? <span className="settings-chip settings-chip-sm codex-provider-current">当前已应用</span> : null}
                  </div>
                  <div className="codex-provider-meta-row">
                    <span>{provider.baseUrl}</span>
                  </div>
                </div>
                <div className="codex-provider-actions">
                  <button type="button" className="settings-action-btn settings-action-btn-sm" disabled={props.busy || pendingProviderId === provider.id} onClick={() => {
                    setEditingDraft(createDraftFromRecord(provider));
                    setSubmitError(null);
                  }}>
                    编辑
                  </button>
                  <button type="button" className="settings-action-btn settings-action-btn-sm" disabled={props.busy || pendingProviderId === provider.id} onClick={() => setDeleteTarget(provider)}>
                    删除
                  </button>
                  <button type="button" className="settings-action-btn settings-action-btn-sm settings-action-btn-primary" disabled={props.busy || pendingProviderId === provider.id} onClick={() => void handleApply(provider)}>
                    {pendingProviderId === provider.id ? "应用中…" : "一键应用"}
                  </button>
                </div>
              </div>
            ))
          : null}
      </section>
      {licensesOpen ? (
        <Suspense fallback={null}>
          <LazyOpenSourceLicensesDialog open={licensesOpen} onClose={() => setLicensesOpen(false)} />
        </Suspense>
      ) : null}
      <CodexProviderDialog
        open={editingDraft !== null}
        initialDraft={editingDraft}
        providers={providers}
        saving={saving}
        submitError={submitError}
        onClose={() => {
          if (!saving) {
            setEditingDraft(null);
            setSubmitError(null);
          }
        }}
        onSave={handleSave}
      />
      {deleteTarget !== null ? (
        <div className="settings-dialog-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <section className="settings-dialog mcp-confirm-dialog" role="dialog" aria-modal="true" aria-label="删除提供商" onClick={(event) => event.stopPropagation()}>
            <header className="settings-dialog-header">
              <strong>删除提供商</strong>
              <button type="button" className="settings-dialog-close" onClick={() => setDeleteTarget(null)} aria-label="关闭">×</button>
            </header>
            <div className="settings-dialog-body mcp-confirm-body">
              <p>将从应用本地配置中删除 <strong>{deleteTarget.name}</strong>，不会清理现有 `~/.codex/config.toml` 里的历史条目。</p>
              <div className="mcp-form-actions">
                <button type="button" className="settings-action-btn" onClick={() => setDeleteTarget(null)} disabled={pendingProviderId === deleteTarget.id}>取消</button>
                <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={() => void handleDelete()} disabled={pendingProviderId === deleteTarget.id}>{pendingProviderId === deleteTarget.id ? "删除中…" : "确认删除"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
