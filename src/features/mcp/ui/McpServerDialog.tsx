import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { JsonObject, McpConfigServerView } from "../../settings/config/mcpConfig";
import {
  buildMcpServerConfigValue,
  createMcpServerFormState,
  type McpServerFormErrors,
  type McpServerFormState,
  validateMcpServerForm
} from "../model/mcpFormModel";

interface McpServerDialogProps {
  readonly open: boolean;
  readonly saving: boolean;
  readonly server: McpConfigServerView | null;
  readonly submitError: string | null;
  onClose: () => void;
  onSubmit: (serverId: string, value: JsonObject) => Promise<void>;
}

function FieldShell(props: { readonly label: string; readonly error?: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <label className="mcp-form-field">
      <span className="mcp-form-label">{props.label}</span>
      {props.children}
      {props.error ? <span className="mcp-form-error">{props.error}</span> : null}
    </label>
  );
}

function TextField(props: {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <FieldShell label={props.label} error={props.error}>
      <input className="mcp-form-input" type="text" value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} />
    </FieldShell>
  );
}

function TextAreaField(props: {
  readonly label: string;
  readonly value: string;
  readonly rows?: number;
  readonly error?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <FieldShell label={props.label} error={props.error}>
      <textarea className="mcp-form-textarea" rows={props.rows ?? 4} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </FieldShell>
  );
}

function TypeSpecificFields(props: {
  readonly form: McpServerFormState;
  readonly errors: McpServerFormErrors;
  readonly onChange: <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) => void;
}): JSX.Element {
  if (props.form.type === "stdio") {
    return (
      <>
        <TextField label="Command" value={props.form.command} error={props.errors.command} onChange={(value) => props.onChange("command", value)} />
        <TextAreaField label="Args（每行一个）" value={props.form.argsText} rows={4} onChange={(value) => props.onChange("argsText", value)} />
        <TextField label="工作目录" value={props.form.cwd} onChange={(value) => props.onChange("cwd", value)} />
        <TextAreaField label="环境变量（KEY=VALUE）" value={props.form.envText} rows={4} error={props.errors.envText} onChange={(value) => props.onChange("envText", value)} />
      </>
    );
  }
  return (
    <>
      <TextField label="URL" value={props.form.url} error={props.errors.url} onChange={(value) => props.onChange("url", value)} />
      <TextAreaField label="请求头（KEY=VALUE）" value={props.form.headersText} rows={4} error={props.errors.headersText} onChange={(value) => props.onChange("headersText", value)} />
    </>
  );
}

export function McpServerDialog(props: McpServerDialogProps): JSX.Element | null {
  const [form, setForm] = useState<McpServerFormState>(createMcpServerFormState(null));
  const [errors, setErrors] = useState<McpServerFormErrors>({});

  useEffect(() => {
    if (props.open) {
      setForm(createMcpServerFormState(props.server));
      setErrors({});
    }
  }, [props.open, props.server]);

  const title = useMemo(() => (props.server === null ? "添加 MCP 服务器" : `编辑服务器：${props.server.name}`), [props.server]);
  if (!props.open) {
    return null;
  }

  const updateForm = <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateMcpServerForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await props.onSubmit(form.id.trim(), buildMcpServerConfigValue(form, props.server?.config));
  };

  return (
    <div className="settings-dialog-backdrop" role="presentation" onClick={props.onClose}>
      <section className="settings-dialog mcp-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="settings-dialog-header">
          <strong>{title}</strong>
          <button type="button" className="settings-dialog-close" onClick={props.onClose} aria-label="关闭">×</button>
        </header>
        <form className="settings-dialog-body mcp-form" onSubmit={handleSubmit}>
          <div className="mcp-form-grid">
            <TextField label="服务器 ID" value={form.id} disabled={props.server !== null} error={errors.id} onChange={(value) => updateForm("id", value)} />
            <TextField label="显示名称" value={form.name} onChange={(value) => updateForm("name", value)} />
            <FieldShell label="传输类型">
              <select className="mcp-form-select" value={form.type} onChange={(event) => updateForm("type", event.target.value as McpServerFormState["type"])}>
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
            </FieldShell>
            <label className="mcp-form-toggle-row">
              <input type="checkbox" checked={form.enabled} onChange={(event) => updateForm("enabled", event.target.checked)} />
              <span>默认启用</span>
            </label>
            <TypeSpecificFields form={form} errors={errors} onChange={updateForm} />
          </div>
          {props.submitError ? <div className="mcp-form-submit-error">{props.submitError}</div> : null}
          <div className="mcp-form-actions">
            <button type="button" className="settings-action-btn" onClick={props.onClose} disabled={props.saving}>取消</button>
            <button type="submit" className="settings-action-btn settings-action-btn-primary" disabled={props.saving}>{props.saving ? "保存中…" : "保存"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
