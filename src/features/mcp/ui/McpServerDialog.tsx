import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import type { JsonObject, McpConfigServerView } from "../../settings/config/mcpConfig";
import { useI18n, type MessageKey } from "../../../i18n";
import {
  buildMcpServerConfigValue,
  createMcpServerFormState,
  type McpServerFormMessages,
  type McpServerFormErrors,
  type McpServerFormState,
  validateMcpServerForm
} from "../model/mcpFormModel";

const MCP_DOCS_URL = "https://developers.openai.com/codex/mcp";

const TRANSPORT_LABEL_KEYS: Record<McpServerFormState["type"], MessageKey> = {
  stdio: "settings.mcp.transport.stdio",
  http: "settings.mcp.transport.http",
  sse: "settings.mcp.transport.http"
};

interface McpServerDialogProps {
  readonly open: boolean;
  readonly saving: boolean;
  readonly server: McpConfigServerView | null;
  readonly submitError: string | null;
  onClose: () => void;
  onOpenDocs?: () => Promise<void>;
  onSubmit: (serverId: string, value: JsonObject) => Promise<void>;
}

function ExternalLinkIcon(): JSX.Element {
  return (
    <svg className="mcp-external-link-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.4 3.4H3.8a1.4 1.4 0 0 0-1.4 1.4v7.4a1.4 1.4 0 0 0 1.4 1.4h7.4a1.4 1.4 0 0 0 1.4-1.4V9.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 2.4h4.6V7M8.8 7.2l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon(): JSX.Element {
  return (
    <svg className="mcp-back-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.8 3.4 5.2 8l4.6 4.6M5.6 8h7.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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

function TrashIcon(): JSX.Element {
  return (
    <svg className="mcp-trash-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 2.8h5M3.3 5h9.4M6.2 5v7.2M9.8 5v7.2M4.8 5l.5 8.2h5.4l.5-8.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <FieldShell label={props.label} error={props.error}>
      <input
        className="mcp-form-input"
        type="text"
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function createRows(value: string): Array<string> {
  const rows = value.split(/\r?\n/u);
  return rows.length === 0 ? [""] : rows;
}

function updateRows(rows: ReadonlyArray<string>, index: number, value: string): Array<string> {
  return rows.map((item, rowIndex) => (rowIndex === index ? value : item));
}

function removeRow(rows: ReadonlyArray<string>, index: number): Array<string> {
  if (rows.length <= 1) {
    return [""];
  }
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function TextListField(props: {
  readonly label: string;
  readonly value: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const rows = createRows(props.value);
  return (
    <div className="mcp-repeat-field">
      <span className="mcp-form-label">{props.label}</span>
      <div className="mcp-repeat-list">
        {rows.map((row, index) => (
          <div className="mcp-repeat-row" key={index}>
            <input
              className="mcp-form-input"
              type="text"
              value={row}
              placeholder={props.placeholder}
              onChange={(event) => props.onChange(updateRows(rows, index, event.target.value).join("\n"))}
            />
            <button
              type="button"
              className="mcp-icon-button mcp-delete-row-button"
              aria-label={props.removeLabel}
              onClick={() => props.onChange(removeRow(rows, index).join("\n"))}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mcp-add-row-button" onClick={() => props.onChange([...rows, ""].join("\n"))}>
        <PlusIcon />
        <span>{props.addLabel}</span>
      </button>
    </div>
  );
}

function splitKeyValueRow(line: string): { readonly key: string; readonly value: string } {
  const separatorIndex = line.indexOf("=");
  if (separatorIndex === -1) {
    return { key: line, value: "" };
  }
  return {
    key: line.slice(0, separatorIndex),
    value: line.slice(separatorIndex + 1)
  };
}

function serializeKeyValueRow(key: string, value: string): string {
  return key.length === 0 && value.length === 0 ? "" : `${key}=${value}`;
}

function KeyValueListField(props: {
  readonly label: string;
  readonly value: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly keyPlaceholder: string;
  readonly valuePlaceholder: string;
  readonly error?: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const rows = createRows(props.value);
  const entries = rows.map(splitKeyValueRow);
  const updateEntry = (index: number, key: string, value: string) => {
    props.onChange(updateRows(rows, index, serializeKeyValueRow(key, value)).join("\n"));
  };

  return (
    <div className="mcp-repeat-field">
      <span className="mcp-form-label">{props.label}</span>
      <div className="mcp-repeat-list">
        {entries.map((entry, index) => (
          <div className="mcp-repeat-row mcp-repeat-row-key-value" key={index}>
            <input
              className="mcp-form-input"
              type="text"
              value={entry.key}
              placeholder={props.keyPlaceholder}
              onChange={(event) => updateEntry(index, event.target.value, entry.value)}
            />
            <input
              className="mcp-form-input"
              type="text"
              value={entry.value}
              placeholder={props.valuePlaceholder}
              onChange={(event) => updateEntry(index, entry.key, event.target.value)}
            />
            <button
              type="button"
              className="mcp-icon-button mcp-delete-row-button"
              aria-label={props.removeLabel}
              onClick={() => props.onChange(removeRow(rows, index).join("\n"))}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      {props.error ? <span className="mcp-form-error">{props.error}</span> : null}
      <button type="button" className="mcp-add-row-button" onClick={() => props.onChange([...rows, ""].join("\n"))}>
        <PlusIcon />
        <span>{props.addLabel}</span>
      </button>
    </div>
  );
}

function TransportSegmentedControl(props: {
  readonly value: McpServerFormState["type"];
  readonly label: string;
  readonly stdioLabel: string;
  readonly httpLabel: string;
  readonly onChange: (value: McpServerFormState["type"]) => void;
}): JSX.Element {
  const isStdio = props.value === "stdio";
  return (
    <div className="mcp-transport-toggle" role="group" aria-label={props.label}>
      <button
        type="button"
        className={isStdio ? "mcp-transport-option mcp-transport-option-active" : "mcp-transport-option"}
        aria-pressed={isStdio}
        onClick={() => props.onChange("stdio")}
      >
        {props.stdioLabel}
      </button>
      <button
        type="button"
        className={!isStdio ? "mcp-transport-option mcp-transport-option-active" : "mcp-transport-option"}
        aria-pressed={!isStdio}
        onClick={() => props.onChange("http")}
      >
        {props.httpLabel}
      </button>
    </div>
  );
}

function TypeSpecificFields(props: {
  readonly form: McpServerFormState;
  readonly errors: McpServerFormErrors;
  readonly labels: {
    readonly command: string;
    readonly commandPlaceholder: string;
    readonly args: string;
    readonly addArg: string;
    readonly cwd: string;
    readonly cwdPlaceholder: string;
    readonly env: string;
    readonly addEnv: string;
    readonly envVars: string;
    readonly addEnvVar: string;
    readonly url: string;
    readonly urlPlaceholder: string;
    readonly bearerTokenEnvVar: string;
    readonly bearerTokenEnvVarPlaceholder: string;
    readonly httpHeaders: string;
    readonly addHeader: string;
    readonly envHttpHeaders: string;
    readonly addVariable: string;
    readonly removeRow: string;
    readonly keyPlaceholder: string;
    readonly valuePlaceholder: string;
  };
  readonly onChange: <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) => void;
}): JSX.Element {
  if (props.form.type === "stdio") {
    return (
      <div className="mcp-editor-card">
        <TextField
          label={props.labels.command}
          value={props.form.command}
          error={props.errors.command}
          placeholder={props.labels.commandPlaceholder}
          onChange={(value) => props.onChange("command", value)}
        />
        <TextListField
          label={props.labels.args}
          value={props.form.argsText}
          addLabel={props.labels.addArg}
          removeLabel={props.labels.removeRow}
          onChange={(value) => props.onChange("argsText", value)}
        />
        <KeyValueListField
          label={props.labels.env}
          value={props.form.envText}
          addLabel={props.labels.addEnv}
          removeLabel={props.labels.removeRow}
          keyPlaceholder={props.labels.keyPlaceholder}
          valuePlaceholder={props.labels.valuePlaceholder}
          error={props.errors.envText}
          onChange={(value) => props.onChange("envText", value)}
        />
        <TextListField
          label={props.labels.envVars}
          value={props.form.envVarsText}
          addLabel={props.labels.addEnvVar}
          removeLabel={props.labels.removeRow}
          onChange={(value) => props.onChange("envVarsText", value)}
        />
        <TextField
          label={props.labels.cwd}
          value={props.form.cwd}
          placeholder={props.labels.cwdPlaceholder}
          onChange={(value) => props.onChange("cwd", value)}
        />
      </div>
    );
  }
  return (
    <div className="mcp-editor-card">
      <TextField
        label={props.labels.url}
        value={props.form.url}
        error={props.errors.url}
        placeholder={props.labels.urlPlaceholder}
        onChange={(value) => props.onChange("url", value)}
      />
      <TextField
        label={props.labels.bearerTokenEnvVar}
        value={props.form.bearerTokenEnvVar}
        placeholder={props.labels.bearerTokenEnvVarPlaceholder}
        onChange={(value) => props.onChange("bearerTokenEnvVar", value)}
      />
      <KeyValueListField
        label={props.labels.httpHeaders}
        value={props.form.httpHeadersText}
        addLabel={props.labels.addHeader}
        removeLabel={props.labels.removeRow}
        keyPlaceholder={props.labels.keyPlaceholder}
        valuePlaceholder={props.labels.valuePlaceholder}
        error={props.errors.httpHeadersText}
        onChange={(value) => props.onChange("httpHeadersText", value)}
      />
      <KeyValueListField
        label={props.labels.envHttpHeaders}
        value={props.form.envHttpHeadersText}
        addLabel={props.labels.addVariable}
        removeLabel={props.labels.removeRow}
        keyPlaceholder={props.labels.keyPlaceholder}
        valuePlaceholder={props.labels.valuePlaceholder}
        error={props.errors.envHttpHeadersText}
        onChange={(value) => props.onChange("envHttpHeadersText", value)}
      />
    </div>
  );
}

function createFormMessages(t: ReturnType<typeof useI18n>["t"]): McpServerFormMessages {
  return {
    idRequired: t("settings.mcp.validation.idRequired"),
    idNoDot: t("settings.mcp.validation.idNoDot"),
    commandRequired: t("settings.mcp.validation.commandRequired"),
    urlRequired: (type) => t("settings.mcp.validation.urlRequired", {
      type: t(TRANSPORT_LABEL_KEYS[type])
    }),
    urlInvalid: t("settings.mcp.validation.urlInvalid"),
    envLabel: t("settings.mcp.dialog.envLabel"),
    headersLabel: t("settings.mcp.dialog.headersLabel"),
    keyValueFormat: (label) => t("settings.mcp.validation.keyValueFormat", { label }),
    keyValueEmptyKey: (label) => t("settings.mcp.validation.keyValueEmptyKey", { label })
  };
}

export function McpServerDialog(props: McpServerDialogProps): JSX.Element | null {
  const { t } = useI18n();
  const [form, setForm] = useState<McpServerFormState>(createMcpServerFormState(null));
  const [errors, setErrors] = useState<McpServerFormErrors>({});
  const messages = useMemo(() => createFormMessages(t), [t]);

  useEffect(() => {
    if (props.open) {
      setForm(createMcpServerFormState(props.server));
      setErrors({});
    }
  }, [props.open, props.server]);

  const title = useMemo(
    () => (props.server === null
      ? t("settings.mcp.dialog.addTitle")
      : t("settings.mcp.dialog.editTitle", { name: props.server.name })),
    [props.server, t]
  );
  if (!props.open) {
    return null;
  }

  const updateForm = <K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateMcpServerForm(form, messages);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await props.onSubmit(form.id.trim(), buildMcpServerConfigValue(form, messages, props.server?.config));
  };

  const handleDocsClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.onOpenDocs === undefined) {
      return;
    }
    event.preventDefault();
    void props.onOpenDocs();
  };

  return (
    <section className="mcp-editor-page" aria-label={title}>
      <button type="button" className="mcp-return-button" onClick={props.onClose}>
        <BackIcon />
        <span>{t("settings.mcp.dialog.returnAction")}</span>
      </button>
      <div className="mcp-editor-dialog">
        <header className="mcp-editor-header">
          <h2>{title}</h2>
          <a className="mcp-doc-link" href={MCP_DOCS_URL} onClick={handleDocsClick} rel="noreferrer" target="_blank">
            {t("settings.mcp.dialog.docsLink")}
            <ExternalLinkIcon />
          </a>
        </header>
        <form className="mcp-editor-form" onSubmit={handleSubmit}>
          <div className="mcp-editor-card mcp-editor-card-name">
            <TextField
              label={t("settings.mcp.dialog.nameLabel")}
              value={form.id}
              disabled={props.server !== null}
              placeholder={t("settings.mcp.dialog.namePlaceholder")}
              error={errors.id}
              onChange={(value) => updateForm("id", value)}
            />
            <TransportSegmentedControl
              value={form.type}
              label={t("settings.mcp.dialog.transportLabel")}
              stdioLabel={t("settings.mcp.transport.stdio")}
              httpLabel={t("settings.mcp.transport.http")}
              onChange={(value) => updateForm("type", value)}
            />
          </div>
          <TypeSpecificFields
            form={form}
            errors={errors}
            labels={{
              command: t("settings.mcp.dialog.commandLabel"),
              commandPlaceholder: t("settings.mcp.dialog.commandPlaceholder"),
              args: t("settings.mcp.dialog.argsLabel"),
              addArg: t("settings.mcp.dialog.addArgAction"),
              cwd: t("settings.mcp.dialog.cwdLabel"),
              cwdPlaceholder: t("settings.mcp.dialog.cwdPlaceholder"),
              env: t("settings.mcp.dialog.envLabel"),
              addEnv: t("settings.mcp.dialog.addEnvAction"),
              envVars: t("settings.mcp.dialog.envVarsLabel"),
              addEnvVar: t("settings.mcp.dialog.addEnvVarAction"),
              url: t("settings.mcp.dialog.urlLabel"),
              urlPlaceholder: t("settings.mcp.dialog.urlPlaceholder"),
              bearerTokenEnvVar: t("settings.mcp.dialog.bearerTokenEnvVarLabel"),
              bearerTokenEnvVarPlaceholder: t("settings.mcp.dialog.bearerTokenEnvVarPlaceholder"),
              httpHeaders: t("settings.mcp.dialog.httpHeadersLabel"),
              addHeader: t("settings.mcp.dialog.addHeaderAction"),
              envHttpHeaders: t("settings.mcp.dialog.envHttpHeadersLabel"),
              addVariable: t("settings.mcp.dialog.addVariableAction"),
              removeRow: t("settings.mcp.dialog.removeRowAction"),
              keyPlaceholder: t("settings.mcp.dialog.keyPlaceholder"),
              valuePlaceholder: t("settings.mcp.dialog.valuePlaceholder")
            }}
            onChange={updateForm}
          />
          {props.submitError ? <div className="mcp-form-submit-error">{props.submitError}</div> : null}
          <div className="mcp-form-actions">
            <button type="submit" className="mcp-save-button" disabled={props.saving}>
              {props.saving ? t("settings.mcp.dialog.saving") : t("settings.mcp.dialog.saveAction")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
