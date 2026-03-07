import { useEffect, useMemo, useState } from "react";
import type { CodexProviderDraft, CodexProviderRecord } from "../../../bridge/types";
import {
  createAuthJsonText,
  createConfigTomlText,
  createEmptyCodexProviderDraft,
  extractApiKeyFromAuthJson,
  extractCodexConfigFields,
  parseAuthJsonText,
  parseConfigTomlText,
  updateAuthJsonWithApiKey,
  updateConfigTomlWithBasics,
  validateCodexProviderDraft,
} from "../../../app/codexProviderConfig";

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
  try {
    return parseConfigTomlText(draft.configTomlText);
  } catch {
    return parseConfigTomlText(
      createConfigTomlText({
        providerKey: draft.providerKey,
        baseUrl: draft.baseUrl,
        model: draft.model,
        providerName: draft.name.trim() || draft.providerKey,
      })
    );
  }
}

export function CodexProviderDialog(props: CodexProviderDialogProps): JSX.Element | null {
  const [state, setState] = useState<DialogState>(() => createDialogState(props.initialDraft));

  useEffect(() => {
    if (props.open) {
      setState(createDialogState(props.initialDraft));
    }
  }, [props.initialDraft, props.open]);

  const errors = useMemo(
    () => validateCodexProviderDraft(state.draft, props.providers),
    [props.providers, state.draft]
  );
  const canSubmit = useMemo(
    () => Object.values(errors).every((value) => value === undefined),
    [errors]
  );

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

  const handleConfigFieldChange = (
    key: "providerKey" | "baseUrl" | "model",
    value: string
  ) => {
    setDraft((current) => {
      const nextDraft = { ...current.draft, [key]: value };
      const configTomlText = updateConfigTomlWithBasics(current.lastValidConfig, {
        providerKey: nextDraft.providerKey,
        baseUrl: nextDraft.baseUrl,
        model: nextDraft.model,
        providerName: nextDraft.name,
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
            providerKey: fields.providerKey,
            baseUrl: fields.baseUrl,
            model: fields.model,
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
    await props.onSave({ ...state.draft }, applyAfterSave);
  };

  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={() => !props.saving && props.onClose()}>
      <section
        className="settings-dialog codex-provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={state.draft.id ? "编辑提供商" : "新增提供商"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <strong>{state.draft.id ? "编辑提供商" : "新增提供商"}</strong>
          <button type="button" className="settings-dialog-close" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="settings-dialog-body codex-provider-form">
          <div className="codex-provider-form-grid">
            <label className="mcp-form-field">
              <span className="mcp-form-label">名称</span>
              <input aria-label="名称" className="mcp-form-input" value={state.draft.name} onChange={(event) => setDraft((current) => ({ ...current, draft: { ...current.draft, name: event.target.value } }))} />
              {errors.name ? <span className="mcp-form-error">{errors.name}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">providerKey</span>
              <input aria-label="providerKey" className="mcp-form-input" value={state.draft.providerKey} onChange={(event) => handleConfigFieldChange("providerKey", event.target.value)} />
              {errors.providerKey ? <span className="mcp-form-error">{errors.providerKey}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">API Key</span>
              <input aria-label="API Key" className="mcp-form-input" value={state.draft.apiKey} onChange={(event) => handleApiKeyChange(event.target.value)} />
              {errors.apiKey ? <span className="mcp-form-error">{errors.apiKey}</span> : null}
            </label>
            <label className="mcp-form-field">
              <span className="mcp-form-label">Base URL</span>
              <input aria-label="Base URL" className="mcp-form-input" value={state.draft.baseUrl} onChange={(event) => handleConfigFieldChange("baseUrl", event.target.value)} />
              {errors.baseUrl ? <span className="mcp-form-error">{errors.baseUrl}</span> : null}
            </label>
            <label className="mcp-form-field codex-provider-form-full">
              <span className="mcp-form-label">模型</span>
              <input aria-label="模型" className="mcp-form-input" value={state.draft.model} onChange={(event) => handleConfigFieldChange("model", event.target.value)} />
              {errors.model ? <span className="mcp-form-error">{errors.model}</span> : null}
            </label>
          </div>
          <label className="mcp-form-field codex-provider-form-full">
            <span className="mcp-form-label">auth.json</span>
            <textarea aria-label="auth.json" className="mcp-form-textarea codex-provider-textarea" value={state.draft.authJsonText} onChange={(event) => handleAuthTextChange(event.target.value)} />
            {errors.authJsonText ? <span className="mcp-form-error">{errors.authJsonText}</span> : null}
          </label>
          <label className="mcp-form-field codex-provider-form-full">
            <span className="mcp-form-label">config.toml</span>
            <textarea aria-label="config.toml" className="mcp-form-textarea codex-provider-textarea codex-provider-textarea-lg" value={state.draft.configTomlText} onChange={(event) => handleConfigTextChange(event.target.value)} />
            {errors.configTomlText ? <span className="mcp-form-error">{errors.configTomlText}</span> : null}
          </label>
          {props.submitError ? <div className="mcp-form-submit-error">{props.submitError}</div> : null}
          <div className="mcp-form-actions">
            <button type="button" className="settings-action-btn" onClick={props.onClose} disabled={props.saving}>取消</button>
            <button type="button" className="settings-action-btn" onClick={() => void handleSave(false)} disabled={!canSubmit || props.saving}>{props.saving ? "保存中…" : "保存"}</button>
            <button type="button" className="settings-action-btn settings-action-btn-primary" onClick={() => void handleSave(true)} disabled={!canSubmit || props.saving}>{props.saving ? "应用中…" : "保存并应用"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
