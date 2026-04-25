import type { JsonObject, McpConfigServerView, McpTransportType } from "../../settings/config/mcpConfig";

export interface McpServerFormState {
  readonly id: string;
  readonly name: string;
  readonly type: McpTransportType;
  readonly command: string;
  readonly argsText: string;
  readonly cwd: string;
  readonly envText: string;
  readonly envVarsText: string;
  readonly url: string;
  readonly bearerTokenEnvVar: string;
  readonly httpHeadersText: string;
  readonly envHttpHeadersText: string;
  readonly enabled: boolean;
}

export type McpServerFormErrors = Partial<Record<keyof McpServerFormState, string>>;
export interface McpServerFormMessages {
  readonly idRequired: string;
  readonly idNoDot: string;
  readonly commandRequired: string;
  readonly urlRequired: (type: Exclude<McpTransportType, "stdio">) => string;
  readonly urlInvalid: string;
  readonly envLabel: string;
  readonly headersLabel: string;
  readonly keyValueFormat: (label: string) => string;
  readonly keyValueEmptyKey: (label: string) => string;
}

const MANAGED_KEYS = new Set([
  "name",
  "type",
  "enabled",
  "command",
  "args",
  "cwd",
  "env",
  "env_vars",
  "url",
  "bearer_token_env_var",
  "headers",
  "http_headers",
  "env_http_headers",
]);

function splitNonEmptyLines(value: string): Array<string> {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseStringArray(value: unknown): Array<string> {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseKeyValueRecord(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "";
  }
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, item]) => `${key}=${item}`)
    .join("\n");
}

function parseEnvVars(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        return JSON.stringify(item);
      }
      return "";
    })
    .filter((item) => item.length > 0)
    .join("\n");
}

function parseEnvVarLines(value: string): Array<string | JsonObject> {
  return splitNonEmptyLines(value).map((line) => {
    if (line.startsWith("{")) {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return parsed as JsonObject;
        }
      } catch {
        return line;
      }
    }
    return line;
  });
}

function parseKeyValueLines(
  value: string,
  label: string,
  messages: Pick<McpServerFormMessages, "keyValueFormat" | "keyValueEmptyKey">
): { readonly data: Record<string, string>; readonly error: string | null } {
  const data: Record<string, string> = {};
  for (const line of splitNonEmptyLines(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      return { data: {}, error: messages.keyValueFormat(label) };
    }
    const key = line.slice(0, separatorIndex).trim();
    if (key.length === 0) {
      return { data: {}, error: messages.keyValueEmptyKey(label) };
    }
    data[key] = line.slice(separatorIndex + 1).trim();
  }
  return { data, error: null };
}

export function createMcpServerFormState(server: McpConfigServerView | null): McpServerFormState {
  if (server === null) {
    return {
      id: "",
      name: "",
      type: "stdio",
      command: "",
      argsText: "",
      cwd: "",
      envText: "",
      envVarsText: "",
      url: "",
      bearerTokenEnvVar: "",
      httpHeadersText: "",
      envHttpHeadersText: "",
      enabled: true
    };
  }

  return {
    id: server.id,
    name: typeof server.config.name === "string" ? server.config.name : server.name,
    type: server.type,
    command: typeof server.config.command === "string" ? server.config.command : "",
    argsText: parseStringArray(server.config.args).join("\n"),
    cwd: typeof server.config.cwd === "string" ? server.config.cwd : "",
    envText: parseKeyValueRecord(server.config.env),
    envVarsText: parseEnvVars(server.config.env_vars),
    url: typeof server.config.url === "string" ? server.config.url : "",
    bearerTokenEnvVar: typeof server.config.bearer_token_env_var === "string" ? server.config.bearer_token_env_var : "",
    httpHeadersText: parseKeyValueRecord(server.config.http_headers ?? server.config.headers),
    envHttpHeadersText: parseKeyValueRecord(server.config.env_http_headers),
    enabled: server.enabled
  };
}

export function validateMcpServerForm(
  state: McpServerFormState,
  messages: McpServerFormMessages
): McpServerFormErrors {
  const errors: McpServerFormErrors = {};
  if (state.id.trim().length === 0) {
    errors.id = messages.idRequired;
  } else if (state.id.includes(".")) {
    errors.id = messages.idNoDot;
  }
  if (state.type === "stdio" && state.command.trim().length === 0) {
    errors.command = messages.commandRequired;
  }
  if (state.type !== "stdio") {
    if (state.url.trim().length === 0) {
      errors.url = messages.urlRequired(state.type);
    } else {
      try {
        new URL(state.url.trim());
      } catch {
        errors.url = messages.urlInvalid;
      }
    }
  }
  const envError = parseKeyValueLines(state.envText, messages.envLabel, messages).error;
  const httpHeadersError = parseKeyValueLines(state.httpHeadersText, messages.headersLabel, messages).error;
  const envHttpHeadersError = parseKeyValueLines(state.envHttpHeadersText, messages.headersLabel, messages).error;
  if (envError !== null) errors.envText = envError;
  if (httpHeadersError !== null) errors.httpHeadersText = httpHeadersError;
  if (envHttpHeadersError !== null) errors.envHttpHeadersText = envHttpHeadersError;
  return errors;
}

function omitManagedFields(value: JsonObject | undefined): JsonObject {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !MANAGED_KEYS.has(key)));
}

export function buildMcpServerConfigValue(
  state: McpServerFormState,
  messages: Pick<McpServerFormMessages, "envLabel" | "headersLabel" | "keyValueFormat" | "keyValueEmptyKey">,
  previous?: JsonObject
): JsonObject {
  const next = omitManagedFields(previous);
  const name = state.name.trim();
  if (name.length > 0) next.name = name;
  next.enabled = state.enabled;
  if (state.type === "stdio") {
    next.type = "stdio";
    next.command = state.command.trim();
    const args = splitNonEmptyLines(state.argsText);
    if (args.length > 0) next.args = args;
    const cwd = state.cwd.trim();
    if (cwd.length > 0) next.cwd = cwd;
    const env = parseKeyValueLines(state.envText, messages.envLabel, messages).data;
    if (Object.keys(env).length > 0) next.env = env;
    const envVars = parseEnvVarLines(state.envVarsText);
    if (envVars.length > 0) next.env_vars = envVars;
    return next;
  }
  next.type = state.type;
  next.url = state.url.trim();
  const bearerTokenEnvVar = state.bearerTokenEnvVar.trim();
  if (bearerTokenEnvVar.length > 0) next.bearer_token_env_var = bearerTokenEnvVar;
  const httpHeaders = parseKeyValueLines(state.httpHeadersText, messages.headersLabel, messages).data;
  if (Object.keys(httpHeaders).length > 0) next.http_headers = httpHeaders;
  const envHttpHeaders = parseKeyValueLines(state.envHttpHeadersText, messages.headersLabel, messages).data;
  if (Object.keys(envHttpHeaders).length > 0) next.env_http_headers = envHttpHeaders;
  return next;
}
