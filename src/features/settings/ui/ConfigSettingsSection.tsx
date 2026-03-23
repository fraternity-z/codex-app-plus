import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgentEnvironment,
  CodexAuthModeStateOutput,
  CodexAuthSwitchResult,
  CodexProviderApplyResult,
  CodexProviderDraft,
  CodexProviderRecord,
  CodexProviderStore,
  DeleteCodexProviderInput,
} from "../../../bridge/types";
import type { WindowsSandboxSetupState } from "../../../domain/types";
import { useI18n } from "../../../i18n";
import type { ConfigBatchWriteParams } from "../../../protocol/generated/v2/ConfigBatchWriteParams";
import type { ConfigValueWriteParams } from "../../../protocol/generated/v2/ConfigValueWriteParams";
import {
  createDraftFromRecord,
  createEmptyCodexProviderDraft,
  readCurrentCodexProviderKey,
} from "../config/codexProviderConfig";
import { createWindowsSandboxConfigWriteParams } from "../sandbox/windowsSandboxSetup";
import { CodexAuthModeCard } from "./CodexAuthModeCard";
import { CodexProviderDialog } from "./CodexProviderDialog";
import { CodexProviderDeleteDialog } from "./CodexProviderDeleteDialog";
import { CodexProviderListCard } from "./CodexProviderListCard";
import { WindowsSandboxSettingsCard } from "./WindowsSandboxSettingsCard";
import { writeForcedLoginMethod } from "./configAuthMode";

const LazyOpenSourceLicensesDialog = lazy(async () => {
  const module = await import("../../shared/ui/OpenSourceLicensesDialog");
  return { default: module.OpenSourceLicensesDialog };
});

interface ConfigSettingsSectionProps {
  readonly agentEnvironment: AgentEnvironment;
  readonly busy: boolean;
  readonly configSnapshot: unknown;
  readonly windowsSandboxSetup: WindowsSandboxSetupState;
  onOpenConfigToml: () => Promise<void>;
  refreshConfigSnapshot: () => Promise<unknown>;
  refreshAuthState: () => Promise<void>;
  login: () => Promise<void>;
  listCodexProviders: () => Promise<CodexProviderStore>;
  upsertCodexProvider: (input: CodexProviderDraft) => Promise<CodexProviderRecord>;
  deleteCodexProvider: (input: DeleteCodexProviderInput) => Promise<CodexProviderStore>;
  applyCodexProvider: (input: { readonly id: string }) => Promise<CodexProviderApplyResult>;
  getCodexAuthModeState: () => Promise<CodexAuthModeStateOutput>;
  activateCodexChatgpt: () => Promise<CodexAuthSwitchResult>;
  batchWriteConfig: (params: ConfigBatchWriteParams) => Promise<unknown>;
  writeConfigValue: (params: ConfigValueWriteParams) => Promise<unknown>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ConfigSettingsSection(props: ConfigSettingsSectionProps): JSX.Element {
  const { t } = useI18n();
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [providers, setProviders] = useState<ReadonlyArray<CodexProviderRecord>>([]);
  const [authModeState, setAuthModeState] = useState<CodexAuthModeStateOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<CodexProviderDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CodexProviderRecord | null>(null);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [authActionPending, setAuthActionPending] = useState<"chatgpt" | "login" | null>(null);

  const currentProviderKey = useMemo(
    () => readCurrentCodexProviderKey(props.configSnapshot),
    [props.configSnapshot],
  );

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const store = await props.listCodexProviders();
      setProviders(store.providers);
    } finally {
      setLoading(false);
    }
  }, [props.listCodexProviders]);

  const loadAuthModeState = useCallback(async () => {
    setAuthLoading(true);
    try {
      setAuthModeState(await props.getCodexAuthModeState());
    } finally {
      setAuthLoading(false);
    }
  }, [props.getCodexAuthModeState]);

  const refreshSection = useCallback(async () => {
    await Promise.all([
      loadProviders(),
      loadAuthModeState(),
      props.refreshConfigSnapshot(),
      props.refreshAuthState(),
    ]);
  }, [
    loadAuthModeState,
    loadProviders,
    props.refreshAuthState,
    props.refreshConfigSnapshot,
  ]);

  useEffect(() => {
    void (async () => {
      setErrorMessage(null);
      try {
        await Promise.all([loadProviders(), loadAuthModeState()]);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
    })();
  }, [loadAuthModeState, loadProviders]);

  const handleSave = async (draft: CodexProviderDraft, applyAfterSave: boolean) => {
    setSaving(true);
    setSubmitError(null);
    setNoticeMessage(null);
    try {
      const saved = await props.upsertCodexProvider(draft);
      if (!applyAfterSave) {
        await loadProviders();
        setNoticeMessage(t("settings.config.providers.savedMessage", { name: saved.name }));
        setEditingDraft(null);
        return;
      }
      await props.applyCodexProvider({ id: saved.id });
      await writeForcedLoginMethod(props.writeConfigValue, props.configSnapshot, "apikey");
      await refreshSection();
      setNoticeMessage(t("settings.config.providers.appliedMessage", { name: saved.name }));
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
      await writeForcedLoginMethod(props.writeConfigValue, props.configSnapshot, "apikey");
      await refreshSection();
      setNoticeMessage(t("settings.config.providers.appliedMessage", { name: provider.name }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPendingProviderId(null);
    }
  };

  const handleActivateChatgpt = async () => {
    setAuthActionPending("chatgpt");
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      const result = await props.activateCodexChatgpt();
      await writeForcedLoginMethod(props.writeConfigValue, props.configSnapshot, "chatgpt");
      await refreshSection();
      const key = result.restoredFromSnapshot
        ? "settings.config.auth.switchedMessage"
        : "settings.config.auth.switchedNeedsLoginMessage";
      setNoticeMessage(t(key));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setAuthActionPending(null);
    }
  };

  const handleChatgptLogin = async () => {
    setAuthActionPending("login");
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      await props.login();
      await Promise.all([props.refreshAuthState(), loadAuthModeState()]);
      setNoticeMessage(t("settings.config.auth.loginStartedMessage"));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setAuthActionPending(null);
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
      await loadAuthModeState();
      setNoticeMessage(t("settings.config.providers.deletedMessage", { name: deleteTarget.name }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPendingProviderId(null);
    }
  };

  const handleWindowsSandboxToggle = useCallback(async (enabled: boolean) => {
    setNoticeMessage(null);
    setErrorMessage(null);
    try {
      await props.batchWriteConfig(createWindowsSandboxConfigWriteParams(props.configSnapshot, enabled));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, [props.batchWriteConfig, props.configSnapshot]);

  return (
    <div className="settings-panel-group">
      <header className="settings-title-wrap">
        <h1 className="settings-page-title">{t("settings.config.title")}</h1>
        <p className="settings-subtitle">{t("settings.config.subtitle")}</p>
      </header>
      <section className="settings-card settings-config-card">
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.config.userConfig.label")}</div>
            <p className="settings-row-meta">{t("settings.config.userConfig.description")}</p>
          </div>
          <button
            type="button"
            className="settings-action-btn"
            onClick={() => void props.onOpenConfigToml()}
          >
            {t("settings.config.userConfig.action")}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <div className="settings-row-heading">{t("settings.config.licenses.label")}</div>
            <p className="settings-row-meta">{t("settings.config.licenses.description")}</p>
          </div>
          <button
            type="button"
            className="settings-action-btn"
            onClick={() => setLicensesOpen(true)}
          >
            {t("settings.config.licenses.action")}
          </button>
        </div>
      </section>
      <WindowsSandboxSettingsCard
        agentEnvironment={props.agentEnvironment}
        busy={props.busy}
        configSnapshot={props.configSnapshot}
        setupState={props.windowsSandboxSetup}
        onToggle={handleWindowsSandboxToggle}
      />
      <CodexAuthModeCard
        busy={props.busy}
        authLoading={authLoading}
        authModeState={authModeState}
        authActionPending={authActionPending}
        onActivateChatgpt={handleActivateChatgpt}
        onLogin={handleChatgptLogin}
      />
      <CodexProviderListCard
        busy={props.busy}
        loading={loading}
        providers={providers}
        authModeState={authModeState}
        currentProviderKey={currentProviderKey}
        pendingProviderId={pendingProviderId}
        noticeMessage={noticeMessage}
        errorMessage={errorMessage}
        onAdd={() => {
          setEditingDraft(createEmptyCodexProviderDraft());
          setSubmitError(null);
        }}
        onEdit={(provider) => {
          setEditingDraft(createDraftFromRecord(provider));
          setSubmitError(null);
        }}
        onDelete={setDeleteTarget}
        onApply={handleApply}
      />
      {licensesOpen ? (
        <Suspense fallback={null}>
          <LazyOpenSourceLicensesDialog
            open={licensesOpen}
            onClose={() => setLicensesOpen(false)}
          />
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
      <CodexProviderDeleteDialog
        deleteTarget={deleteTarget}
        pendingProviderId={pendingProviderId}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
