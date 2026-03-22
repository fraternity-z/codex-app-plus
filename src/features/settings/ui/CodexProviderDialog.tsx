import { useEffect, useMemo, useState } from "react";
import type { CodexProviderDraft, CodexProviderRecord } from "../../../bridge/types";
import { useI18n } from "../../../i18n";
import {
  createAuthJsonText,
  createConfigTomlText,
  createEmptyCodexProviderDraft,
  extractApiKeyFromAuthJson,
  extractCodexConfigFields,
  normalizeConfigTomlText,
  parseAuthJsonText,
  parseConfigTomlText,
  updateAuthJsonWithApiKey,
  updateConfigTomlWithBasics,
  validateCodexProviderDraft,
} from "../config/codexProviderConfig";

interface CodexProviderDialogProps {
  readonly open: boolean;
  readonly initialDraft: CodexProviderDraft | null;
  readonly providers: ReadonlyArray<CodexProviderRecord>;
  readonly saving: boolean;
  readonly submitError: string | null;
  onClose: () => void;
  onSave: (draft: CodexProviderDraft, applyAfterSave: boolean) => Promise<void>;
}

interface DialogState {
  readonly draft: CodexProviderDraft;
  readonly lastValidAuth: Record<string, unknown>;
  readonly lastValidConfig: Record<string, unknown>;
}

function createDialogState(draft: CodexProviderDraft | null): DialogState {
  const nextDraft = draft ?? createEmptyCodexProviderDraft();
  return {
    draft: nextDraft,
    lastValidAuth: safeParseAuth(nextDraft),
    lastValidConfig: safeParseConfig(nextDraft),
  };
}

function safeParseAuth(draft: CodexProviderDraft): Record<string, unknown> {
  try {
    return parseAuthJsonText(draft.authJsonText);
  } catch {
    return parseAuthJsonText(createAuthJsonText(draft.apiKey));
  }
}

function safeParseConfig(draft: CodexProviderDraft): Record<string, unknown> {
  if (draft.configTomlText.trim().length === 0) {
    return {};
  }
  try {
    return parseConfigTomlText(draft.configTomlText);
  } catch {
    return parseConfigTomlText(
      createConfigTomlText({
        providerKey: draft.providerKey,
        providerName: draft.name.trim() || draft.providerKey,
        baseUrl: draft.baseUrl,
      }),
    );
  }
}

export function CodexProviderDialog(props: CodexProviderDialogProps): JSX.Element | null {
  const { t } = useI18n();
  const [state, setState] = useState<DialogState>(() => createDialogState(props.initialDraft));

  useEffect(() => {
    if (props.open) {
      setState(createDialogState(props.initialDraft));
    }
  }, [props.initialDraft, props.open]);

  const errors = useMemo(
    () => validateCodexProviderDraft(state.draft, props.providers),
    [props.providers, state.draft],
  );
  const canSubmit = useMemo(
    () => Object.values(errors).every((value) => value === undefined),
    [errors],
  );
  const dialogTitle = state.draft.id
    ? t("settings.config.providerDialog.editTitle")
    : t("settings.config.providerDialog.addTitle");

  if (!props.open) {
    return null;
  }

  const setDraft = (updater: (current: DialogState) => DialogState) => {
    setState((current) => updater(current));
  };

  const handleApiKeyChange = (apiKey: string) => {
    setDraft((current) => {
      const authJsonText = updateAuthJsonWithApiKey(current.lastValidAuth, apiKey);
      return {
        draft: { ...current.draft, apiKey, authJsonText },
        lastValidAuth: parseAuthJsonText(authJsonText),
        lastValidConfig: current.lastValidConfig,
      };
    });
  };

  const handleBasicFieldChange = (
    key: "name" | "providerKey" | "baseUrl",
    value: string,
  ) => {
    setDraft((current) => {
      const nextDraft = { ...current.draft, [key]: value };
      if (nextDraft.providerKey.trim().length === 0) {
        return {
          draft: nextDraft,
          lastValidAuth: current.lastValidAuth,
          lastValidConfig: current.lastValidConfig,
        };
      }
      const configTomlText = updateConfigTomlWithBasics(current.lastValidConfig, {
        providerKey: nextDraft.providerKey,
        providerName: nextDraft.name,
        baseUrl: nextDraft.baseUrl,
      });
      return {
        draft: { ...nextDraft, configTomlText },
        lastValidAuth: current.lastValidAuth,
        lastValidConfig: parseConfigTomlText(configTomlText),
      };
    });
  };

  const handleAuthTextChange = (authJsonText: string) => {
    setDraft((current) => {
      try {
        const auth = parseAuthJsonText(authJsonText);
        return {
          draft: { ...current.draft, authJsonText, apiKey: extractApiKeyFromAuthJson(authJsonText) },
          lastValidAuth: auth,
          lastValidConfig: current.lastValidConfig,
        };
      } catch {
        return { ...current, draft: { ...current.draft, authJsonText } };
      }
    });
  };

  const handleConfigTextChange = (configTomlText: string) => {
    setDraft((current) => {
      try {
        const config = parseConfigTomlText(configTomlText);
        const fields = extractCodexConfigFields(configTomlText);
        return {
          draft: {
            ...current.draft,
            configTomlText,
            name: fields.providerName,
            providerKey: fields.providerKey,
            baseUrl: fields.baseUrl,
          },
          lastValidAuth: current.lastValidAuth,
          lastValidConfig: config,
        };
      } catch {
        return { ...current, draft: { ...current.draft, configTomlText } };
      }
    });
  };

  const handleSave = async (applyAfterSave: boolean) => {
    if (!canSubmit || props.saving) {
      return;
    }
    await props.onSave(
      {
        ...state.draft,
        configTomlText: normalizeConfigTomlText(state.draft.configTomlText, {
          providerKey: state.draft.providerKey,
          providerName: state.draft.name,
          baseUrl: state.draft.baseUrl,
        }),
      },
      applyAfterSave,
    );
  };

  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={() => !props.saving && props.onClose()}>
      <section
        className="settings-dialog codex-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <strong>{dialogTitle}</strong>
          <button type="button" className="settings-dialog-close" onClick={props.onClose} aria-label={t("settings.config.providerDialog.closeAction")}>
            ×
          </button>
        </header>
        <div className="settings-dialog-body codex-provider-form">
          <div className="codex-provider-form-grid">
            <label className="mcp-form-field">
              <span className="mcp-form-label">{t("settings.config.providerDialog.nameLabel")}</span>
              <input aria-label={t("settings.config.providerDialog.nameLabel")} className="mcp-form-input" value={state.draft.name} onChange={(event) => handleBasicFieldChange("name", event.target.value)} />
              {errors.name ? <span className="mcp-form-error">{errors.name}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">{t("settings.config.providerDialog.providerKeyLabel")}</span>
              <input aria-label={t("settings.config.providerDialog.providerKeyLabel")} className="mcp-form-input" placeholder={t("settings.config.providerDialog.providerKeyPlaceholder")} value={state.draft.providerKey} onChange={(event) => handleBasicFieldChange("providerKey", event.target.value)} />
              {errors.providerKey ? <span className="mcp-form-error">{errors.providerKey}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">{t("settings.config.providerDialog.apiKeyLabel")}</span>
              <input aria-label={t("settings.config.providerDialog.apiKeyLabel")} className="mcp-form-input" value={state.draft.apiKey} onChange={(event) => handleApiKeyChange(event.target.value)} />
              {errors.apiKey ? <span className="mcp-form-error">{errors.apiKey}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">{t("settings.config.providerDialog.baseUrlLabel")}</span>
              <input aria-label={t("settings.config.providerDialog.baseUrlLabel")} className="mcp-form-input" value={state.draft.baseUrl} onChange={(event) => handleBasicFieldChange("baseUrl", event.target.value)} />
              {errors.baseUrl ? <span className="mcp-form-error">{errors.baseUrl}</span> : null}
            </label>
          </div>
          <label className="mcp-form-field codex-provider-form-full">
            <span className="mcp-form-label">{t("settings.config.providerDialog.authLabel")}</span>
            <textarea aria-label={t("settings.config.providerDialog.authLabel")} className="mcp-form-textarea codex-provider-textarea" value={state.draft.authJsonText} onChange={(event) => handleAuthTextChange(event.target.value)} />
            {errors.authJsonText ? <span className="mcp-form-error">{errors.authJsonText}</span> : null}
          </label>
          <label className="mcp-form-field codex-provider-form-full">
            <span className="mcp-form-label">{t("settings.config.providerDialog.configLabel")}</span>
            <textarea aria-label={t("settings.config.providerDialog.configLabel")} className="mcp-form-textarea codex-provider-textarea codex-provider-textarea-lg" value={state.draft.configTomlText} onChange={(event) => handleConfigTextChange(event.target.value)} />
            {errors.configTomlText ? <span className="mcp-form-error">{errors.configTomlText}</span> : null}
          </label>
          {props.submitError ? <div className="mcp-form-submit-error">{props.submitError}</div> : null}
          <div className="mcp-form-actions">
            <button type="button" className="settings-action-btn" onClick={props.onClose} disabled={props.saving}>{t("settings.config.providerDialog.cancelAction")}</button>
            <button type="button" className="settings-action-btn" onClick={() => void handleSave(false)} disabled={!canSubmit || props.saving}>{props.saving ? t("settings.config.providerDialog.saving") : t("settings.config.providerDialog.saveAction")}</button>
            <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={() => void handleSave(true)} disabled={!canSubmit || props.saving}>{props.saving ? t("settings.config.providerDialog.applying") : t("settings.config.providerDialog.saveAndApplyAction")}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
