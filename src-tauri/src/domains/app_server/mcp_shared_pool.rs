use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value as JsonValue};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use toml::Value as TomlValue;

use crate::domains::settings::mcp_shared_pool::load_mcp_shared_pool_settings;
use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::{resolve_codex_home_relative_path, AgentFsPath};
use crate::infra::process::windows_child::configure_child_tree_root_tokio_command;
use crate::models::AgentEnvironment;

const USER_CONFIG_PATH: &str = ".codex/config.toml";
const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_HTTP_HEADER_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
struct StdioMcpServerConfig {
    id: String,
    pool_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_vars: Vec<String>,
    cwd: Option<PathBuf>,
    startup_timeout: Option<Duration>,
    tool_timeout: Option<Duration>,
    override_value: TomlValue,
}

pub(crate) struct McpSharedPoolRuntime {
    config_overrides: Vec<String>,
    entries: Arc<HashMap<String, Arc<PoolEntry>>>,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    server_task: Mutex<Option<JoinHandle<()>>>,
}

impl McpSharedPoolRuntime {
    pub(crate) fn config_overrides(&self) -> &[String] {
        &self.config_overrides
    }

    pub(crate) async fn shutdown(&self) {
        if let Some(sender) = self.shutdown_tx.lock().await.take() {
            let _ = sender.send(());
        }
        if let Some(task) = self.server_task.lock().await.take() {
            task.abort();
        }
        for entry in self.entries.values() {
            entry.shutdown().await;
        }
    }
}

pub(crate) async fn prepare(
    agent_environment: AgentEnvironment,
) -> AppResult<Option<McpSharedPoolRuntime>> {
    let settings = load_mcp_shared_pool_settings(agent_environment)?;
    if !settings.enabled {
        return Ok(None);
    }

    if agent_environment != AgentEnvironment::WindowsNative {
        return Ok(None);
    }

    let config_path = resolve_codex_home_relative_path(agent_environment, USER_CONFIG_PATH)?;
    let servers = load_poolable_stdio_servers(&config_path)?;
    if servers.is_empty() {
        return Ok(None);
    }

    start_runtime(servers).await.map(Some)
}

async fn start_runtime(servers: Vec<StdioMcpServerConfig>) -> AppResult<McpSharedPoolRuntime> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let addr = listener.local_addr()?;
    let base_url = format!("http://{addr}/mcp");
    let entries: Arc<HashMap<String, Arc<PoolEntry>>> = Arc::new(
        servers
            .into_iter()
            .map(|server| (server.id.clone(), Arc::new(PoolEntry::new(server))))
            .collect(),
    );

    let mut config_overrides = Vec::new();
    for entry in entries.values() {
        config_overrides.push(format!("mcp_servers.{}.enabled=false", entry.config.id));
        let url = format!("{}/{}", base_url, percent_encode(&entry.config.id));
        config_overrides.push(build_config_override(&entry.config, &url)?);
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let task_entries = Arc::clone(&entries);
    let server_task = tokio::spawn(async move {
        run_http_server(listener, task_entries, shutdown_rx).await;
    });

    Ok(McpSharedPoolRuntime {
        config_overrides,
        entries,
        shutdown_tx: Mutex::new(Some(shutdown_tx)),
        server_task: Mutex::new(Some(server_task)),
    })
}

fn load_poolable_stdio_servers(config_path: &AgentFsPath) -> AppResult<Vec<StdioMcpServerConfig>> {
    if !config_path.host_path.exists() {
        return Ok(Vec::new());
    }

    let text = std::fs::read_to_string(&config_path.host_path)?;
    let value: TomlValue = toml::from_str(&text)
        .map_err(|error| AppError::InvalidInput(format!("config.toml 解析失败: {error}")))?;
    let Some(root) = value.as_table() else {
        return Ok(Vec::new());
    };
    let Some(servers) = root.get("mcp_servers").and_then(TomlValue::as_table) else {
        return Ok(Vec::new());
    };

    let mut result = Vec::new();
    let mut used_ids = servers.keys().cloned().collect::<HashSet<_>>();
    for (id, value) in servers {
        if !is_cli_override_safe_key(id) {
            continue;
        }
        let Some(table) = value.as_table() else {
            continue;
        };
        if table
            .get("enabled")
            .and_then(TomlValue::as_bool)
            .is_some_and(|enabled| !enabled)
        {
            continue;
        }
        if table.get("url").is_some() {
            continue;
        }
        let Some(command) = table.get("command").and_then(TomlValue::as_str) else {
            continue;
        };
        let command = command.trim().to_string();
        if command.is_empty() {
            continue;
        }
        let pool_id = allocate_pool_id(id, &mut used_ids);

        result.push(StdioMcpServerConfig {
            id: id.to_string(),
            pool_id,
            command,
            args: read_string_array(table.get("args")),
            env: read_string_map(table.get("env")),
            env_vars: read_env_vars(table.get("env_vars")),
            cwd: table
                .get("cwd")
                .and_then(TomlValue::as_str)
                .map(|value| PathBuf::from(value.trim())),
            startup_timeout: read_timeout(table),
            tool_timeout: table
                .get("tool_timeout_sec")
                .and_then(toml_number_as_f64)
                .and_then(duration_from_secs),
            override_value: build_streamable_override_value(id, value)?,
        });
    }

    Ok(result)
}

fn allocate_pool_id(id: &str, used_ids: &mut HashSet<String>) -> String {
    let base = format!("{id}__shared_pool");
    if used_ids.insert(base.clone()) {
        return base;
    }
    for index in 2.. {
        let candidate = format!("{base}_{index}");
        if used_ids.insert(candidate.clone()) {
            return candidate;
        }
    }
    unreachable!("unbounded pool id allocation loop should always return")
}

fn read_string_array(value: Option<&TomlValue>) -> Vec<String> {
    value
        .and_then(TomlValue::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(TomlValue::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn read_string_map(value: Option<&TomlValue>) -> HashMap<String, String> {
    value
        .and_then(TomlValue::as_table)
        .map(|table| {
            table
                .iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

fn read_env_vars(value: Option<&TomlValue>) -> Vec<String> {
    let Some(items) = value.and_then(TomlValue::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| match item {
            TomlValue::String(name) => Some(name.clone()),
            TomlValue::Table(table) => table
                .get("name")
                .and_then(TomlValue::as_str)
                .map(ToString::to_string),
            _ => None,
        })
        .collect()
}

fn read_timeout(table: &toml::map::Map<String, TomlValue>) -> Option<Duration> {
    if let Some(seconds) = table
        .get("startup_timeout_sec")
        .and_then(toml_number_as_f64)
    {
        return duration_from_secs(seconds);
    }
    table
        .get("startup_timeout_ms")
        .and_then(TomlValue::as_integer)
        .and_then(|ms| u64::try_from(ms).ok())
        .map(Duration::from_millis)
}

fn toml_number_as_f64(value: &TomlValue) -> Option<f64> {
    match value {
        TomlValue::Integer(value) => Some(*value as f64),
        TomlValue::Float(value) => Some(*value),
        _ => None,
    }
}

fn duration_from_secs(seconds: f64) -> Option<Duration> {
    Duration::try_from_secs_f64(seconds).ok()
}

fn build_streamable_override_value(id: &str, value: &TomlValue) -> AppResult<TomlValue> {
    let Some(table) = value.as_table() else {
        return Err(AppError::InvalidInput(
            "MCP server config must be a table".to_string(),
        ));
    };
    let mut next = toml::map::Map::new();
    for key in [
        "enabled",
        "required",
        "supports_parallel_tool_calls",
        "startup_timeout_sec",
        "startup_timeout_ms",
        "tool_timeout_sec",
        "default_tools_approval_mode",
        "enabled_tools",
        "disabled_tools",
        "scopes",
        "oauth_resource",
        "tools",
        "name",
    ] {
        if let Some(value) = table.get(key) {
            next.insert(key.to_string(), value.clone());
        }
    }
    if !next.contains_key("name") {
        next.insert("name".to_string(), TomlValue::String(id.to_string()));
    }
    next.insert(
        "url".to_string(),
        TomlValue::String("__CODEX_APP_PLUS_MCP_POOL_URL__".to_string()),
    );
    Ok(TomlValue::Table(next))
}

fn build_streamable_server_value(config: &StdioMcpServerConfig, url: &str) -> AppResult<TomlValue> {
    let mut value = config.override_value.clone();
    let Some(table) = value.as_table_mut() else {
        return Err(AppError::InvalidInput(
            "MCP shared pool override must be a table".to_string(),
        ));
    };
    table.insert("url".to_string(), TomlValue::String(url.to_string()));
    Ok(value)
}

fn build_config_override(config: &StdioMcpServerConfig, url: &str) -> AppResult<String> {
    Ok(format!(
        "mcp_servers.{}={}",
        config.pool_id,
        toml_value_to_inline(&build_streamable_server_value(config, url)?)
    ))
}

fn is_cli_override_safe_key(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

async fn run_http_server(
    listener: TcpListener,
    entries: Arc<HashMap<String, Arc<PoolEntry>>>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            _ = &mut shutdown_rx => break,
            accepted = listener.accept() => {
                let Ok((stream, _)) = accepted else {
                    continue;
                };
                let entries = Arc::clone(&entries);
                tokio::spawn(async move {
                    let _ = handle_http_connection(stream, entries).await;
                });
            }
        }
    }
}

async fn handle_http_connection(
    stream: TcpStream,
    entries: Arc<HashMap<String, Arc<PoolEntry>>>,
) -> AppResult<()> {
    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await? == 0 {
        return Ok(());
    }

    let mut headers = HashMap::<String, String>::new();
    let mut header_bytes = request_line.len();
    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line).await?;
        if bytes == 0 {
            return Ok(());
        }
        header_bytes += bytes;
        if header_bytes > MAX_HTTP_HEADER_BYTES {
            let mut stream = reader.into_inner();
            return write_http_response(
                &mut stream,
                http_text(431, "Request Header Fields Too Large", "headers too large"),
            )
            .await;
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or_default();
    let mut body = vec![0; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).await?;
    }
    let mut stream = reader.into_inner();

    let response = route_http_request(&request_line, &body, entries).await;
    write_http_response(&mut stream, response).await
}

async fn route_http_request(
    request_line: &str,
    body: &[u8],
    entries: Arc<HashMap<String, Arc<PoolEntry>>>,
) -> HttpResponse {
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    let path = raw_path.split('?').next().unwrap_or(raw_path);

    if method == "OPTIONS" {
        return http_empty(204, "No Content");
    }
    if method == "GET" || method == "DELETE" {
        return http_text(405, "Method Not Allowed", "method not supported");
    }
    if method != "POST" {
        return http_text(405, "Method Not Allowed", "method not supported");
    }
    let Some(server_id) = path.strip_prefix("/mcp/").and_then(percent_decode) else {
        return http_text(404, "Not Found", "unknown MCP shared pool endpoint");
    };
    let Some(entry) = entries.get(&server_id) else {
        return http_text(404, "Not Found", "unknown MCP shared pool server");
    };

    let message = match serde_json::from_slice::<JsonValue>(body) {
        Ok(message) => message,
        Err(error) => {
            return http_json(
                400,
                "Bad Request",
                json_rpc_error(None, -32700, format!("invalid JSON: {error}")),
            );
        }
    };

    match entry.handle_message(message).await {
        Ok(PoolMessageResult::Json(value)) => http_json(200, "OK", value),
        Ok(PoolMessageResult::Accepted) => http_empty(202, "Accepted"),
        Err(error) => http_json(
            500,
            "Internal Server Error",
            json_rpc_error(None, -32603, error),
        ),
    }
}

struct PoolEntry {
    config: StdioMcpServerConfig,
    state: Mutex<PoolEntryState>,
}

struct PoolEntryState {
    worker: Option<StdioWorker>,
    initialize_request: Option<JsonValue>,
    initialize_result: Option<JsonValue>,
    initialized_notification: Option<JsonValue>,
    upstream_initialized: bool,
    initialized_notification_sent: bool,
}

enum PoolMessageResult {
    Json(JsonValue),
    Accepted,
}

impl PoolEntry {
    fn new(config: StdioMcpServerConfig) -> Self {
        Self {
            config,
            state: Mutex::new(PoolEntryState {
                worker: None,
                initialize_request: None,
                initialize_result: None,
                initialized_notification: None,
                upstream_initialized: false,
                initialized_notification_sent: false,
            }),
        }
    }

    async fn shutdown(&self) {
        let mut state = self.state.lock().await;
        if let Some(worker) = state.worker.as_mut() {
            worker.terminate().await;
        }
        state.worker = None;
    }

    async fn handle_message(&self, message: JsonValue) -> Result<PoolMessageResult, String> {
        let Some(object) = message.as_object() else {
            return Ok(PoolMessageResult::Json(json_rpc_error(
                None,
                -32600,
                "JSON-RPC message must be an object",
            )));
        };
        let id = object.get("id").cloned();
        let method = object.get("method").and_then(JsonValue::as_str);

        let mut state = self.state.lock().await;
        match (method, id.clone()) {
            (Some("initialize"), Some(request_id)) => {
                state.initialize_request = Some(message.clone());
                if let Some(result) = state.initialize_result.clone() {
                    return Ok(PoolMessageResult::Json(json!({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": result,
                    })));
                }

                let response = self.forward_request(&mut state, message, true).await?;
                if let Some(result) = response.get("result").cloned() {
                    state.initialize_result = Some(result);
                    state.upstream_initialized = true;
                }
                Ok(PoolMessageResult::Json(response))
            }
            (Some("notifications/initialized"), None) => {
                state.initialized_notification = Some(message.clone());
                if state.upstream_initialized && !state.initialized_notification_sent {
                    self.forward_notification(&mut state, message).await?;
                    state.initialized_notification_sent = true;
                }
                Ok(PoolMessageResult::Accepted)
            }
            (_, None) => {
                if state.worker.is_some() {
                    self.forward_notification(&mut state, message).await?;
                }
                Ok(PoolMessageResult::Accepted)
            }
            (_, Some(_)) => {
                self.ensure_upstream_initialized(&mut state).await?;
                let response = self.forward_request(&mut state, message, false).await?;
                Ok(PoolMessageResult::Json(response))
            }
        }
    }

    async fn ensure_upstream_initialized(&self, state: &mut PoolEntryState) -> Result<(), String> {
        if state.upstream_initialized {
            return Ok(());
        }
        let request = state
            .initialize_request
            .clone()
            .ok_or_else(|| "MCP shared pool has not received initialize".to_string())?;
        let response = self.forward_request(state, request, true).await?;
        let Some(result) = response.get("result").cloned() else {
            return Err(format!("upstream initialize failed: {response}"));
        };
        state.initialize_result = Some(result);
        state.upstream_initialized = true;
        if let Some(notification) = state.initialized_notification.clone() {
            self.forward_notification(state, notification).await?;
            state.initialized_notification_sent = true;
        }
        Ok(())
    }

    async fn forward_notification(
        &self,
        state: &mut PoolEntryState,
        message: JsonValue,
    ) -> Result<(), String> {
        let worker = self
            .ensure_worker(state)
            .await
            .map_err(|error| error.to_string())?;
        match worker.send_notification(message).await {
            Ok(()) => Ok(()),
            Err(error) => {
                state.worker = None;
                state.upstream_initialized = false;
                state.initialized_notification_sent = false;
                Err(error.to_string())
            }
        }
    }

    async fn forward_request(
        &self,
        state: &mut PoolEntryState,
        message: JsonValue,
        initializing: bool,
    ) -> Result<JsonValue, String> {
        let timeout_duration = if initializing {
            self.config
                .startup_timeout
                .unwrap_or(DEFAULT_STARTUP_TIMEOUT)
        } else {
            self.config.tool_timeout.unwrap_or(DEFAULT_REQUEST_TIMEOUT)
        };
        let worker = self
            .ensure_worker(state)
            .await
            .map_err(|error| error.to_string())?;
        match worker.send_request(message, timeout_duration).await {
            Ok(response) => Ok(response),
            Err(error) => {
                state.worker = None;
                state.upstream_initialized = false;
                state.initialized_notification_sent = false;
                Err(error.to_string())
            }
        }
    }

    async fn ensure_worker<'a>(
        &'a self,
        state: &'a mut PoolEntryState,
    ) -> AppResult<&'a mut StdioWorker> {
        if state.worker.is_none() {
            state.worker = Some(StdioWorker::spawn(&self.config).await?);
        }
        Ok(state.worker.as_mut().expect("worker was just initialized"))
    }
}

struct StdioWorker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr_task: JoinHandle<()>,
}

impl StdioWorker {
    async fn spawn(config: &StdioMcpServerConfig) -> AppResult<Self> {
        let mut command = Command::new(&config.command);
        command.args(&config.args);
        if let Some(cwd) = &config.cwd {
            command.current_dir(cwd);
        }
        for (key, value) in &config.env {
            command.env(key, value);
        }
        for key in &config.env_vars {
            if let Ok(value) = std::env::var(key) {
                command.env(key, value);
            }
        }
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        configure_child_tree_root_tokio_command(&mut command);

        let mut child = command.spawn().map_err(|error| {
            AppError::Protocol(format!("failed to spawn MCP shared pool server: {error}"))
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire MCP stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire MCP stdout".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire MCP stderr".to_string()))?;
        let stderr_task = tokio::spawn(drain_stderr(stderr));

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            stderr_task,
        })
    }

    async fn send_notification(&mut self, message: JsonValue) -> AppResult<()> {
        self.write_message(message).await
    }

    async fn send_request(
        &mut self,
        message: JsonValue,
        timeout_duration: Duration,
    ) -> AppResult<JsonValue> {
        let request_id = message.get("id").cloned();
        self.write_message(message).await?;
        let Some(request_id) = request_id else {
            return Ok(json!({}));
        };

        timeout(timeout_duration, self.read_response(request_id))
            .await
            .map_err(|_| AppError::Timeout("等待 MCP 共享池响应超时".to_string()))?
    }

    async fn write_message(&mut self, message: JsonValue) -> AppResult<()> {
        let mut line = serde_json::to_vec(&message)?;
        line.push(b'\n');
        self.stdin.write_all(&line).await?;
        self.stdin.flush().await?;
        Ok(())
    }

    async fn read_response(&mut self, request_id: JsonValue) -> AppResult<JsonValue> {
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = self.stdout.read_line(&mut line).await?;
            if bytes == 0 {
                return Err(AppError::Protocol(
                    "MCP shared pool server closed stdout".to_string(),
                ));
            }
            let message: JsonValue = match serde_json::from_str(line.trim()) {
                Ok(message) => message,
                Err(_) => continue,
            };
            if is_server_request(&message) {
                self.reject_server_request(&message).await?;
                continue;
            }
            if message.get("id") == Some(&request_id) {
                return Ok(message);
            }
        }
    }

    async fn reject_server_request(&mut self, message: &JsonValue) -> AppResult<()> {
        let Some(id) = message.get("id").cloned() else {
            return Ok(());
        };
        self.write_message(json_rpc_error(
            Some(id),
            -32601,
            "MCP shared pool proxy does not support server-initiated requests",
        ))
        .await
    }

    async fn terminate(&mut self) {
        if self.child.id().is_some() {
            let _ = self.child.kill().await;
            let _ = self.child.wait().await;
        }
        self.stderr_task.abort();
    }
}

async fn drain_stderr(stderr: ChildStderr) {
    let mut reader = BufReader::new(stderr);
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
    }
}

fn is_server_request(message: &JsonValue) -> bool {
    message.get("id").is_some() && message.get("method").is_some()
}

struct HttpResponse {
    status: u16,
    reason: &'static str,
    content_type: Option<&'static str>,
    body: Vec<u8>,
}

fn http_empty(status: u16, reason: &'static str) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: None,
        body: Vec::new(),
    }
}

fn http_text(status: u16, reason: &'static str, body: impl Into<String>) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: Some("text/plain; charset=utf-8"),
        body: body.into().into_bytes(),
    }
}

fn http_json(status: u16, reason: &'static str, body: JsonValue) -> HttpResponse {
    HttpResponse {
        status,
        reason,
        content_type: Some("application/json"),
        body: serde_json::to_vec(&body).unwrap_or_else(|_| b"{}".to_vec()),
    }
}

async fn write_http_response(stream: &mut TcpStream, response: HttpResponse) -> AppResult<()> {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type,mcp-session-id,mcp-protocol-version,last-event-id,authorization\r\nAccess-Control-Expose-Headers: Mcp-Session-Id,Mcp-Protocol-Version,WWW-Authenticate\r\n",
        response.status,
        response.reason,
        response.body.len()
    );
    if let Some(content_type) = response.content_type {
        head.push_str(&format!("Content-Type: {content_type}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await?;
    if !response.body.is_empty() {
        stream.write_all(&response.body).await?;
    }
    Ok(())
}

fn json_rpc_error(id: Option<JsonValue>, code: i64, message: impl Into<String>) -> JsonValue {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(JsonValue::Null),
        "error": {
            "code": code,
            "message": message.into(),
        },
    })
}

fn toml_value_to_inline(value: &TomlValue) -> String {
    match value {
        TomlValue::String(value) => quote_toml_string(value),
        TomlValue::Integer(value) => value.to_string(),
        TomlValue::Float(value) => value.to_string(),
        TomlValue::Boolean(value) => value.to_string(),
        TomlValue::Datetime(value) => value.to_string(),
        TomlValue::Array(items) => {
            let values = items.iter().map(toml_value_to_inline).collect::<Vec<_>>();
            format!("[{}]", values.join(", "))
        }
        TomlValue::Table(table) => {
            let values = table
                .iter()
                .map(|(key, value)| {
                    format!("{} = {}", quote_toml_key(key), toml_value_to_inline(value))
                })
                .collect::<Vec<_>>();
            format!("{{ {} }}", values.join(", "))
        }
    }
}

fn quote_toml_key(value: &str) -> String {
    if is_cli_override_safe_key(value) {
        value.to_string()
    } else {
        quote_toml_string(value)
    }
}

fn quote_toml_string(value: &str) -> String {
    if !value.contains('\'') && !value.contains('\n') && !value.contains('\r') {
        return format!("'{value}'");
    }
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 2 >= bytes.len() {
            return None;
        }
        let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
        decoded.push(u8::from_str_radix(hex, 16).ok()?);
        index += 3;
    }
    String::from_utf8(decoded).ok()
}

#[cfg(test)]
mod tests {
    use crate::infra::filesystem::agent_environment::AgentFsPath;
    use crate::test_support::unique_temp_dir;

    use super::{
        build_config_override, load_poolable_stdio_servers, percent_decode, percent_encode,
    };

    #[test]
    fn loads_stdio_servers_and_skips_http_servers() {
        let root = unique_temp_dir("codex-app-plus", "mcp-pool-config");
        std::fs::create_dir_all(&root).expect("create temp root");
        let config_path = root.join("config.toml");
        std::fs::write(
            &config_path,
            r#"
[mcp_servers.fetch]
command = "uvx"
args = ["mcp-server-fetch"]
enabled = true
startup_timeout_sec = 2.5

[mcp_servers.remote]
url = "https://example.test/mcp"
"#,
        )
        .expect("seed config");

        let servers = load_poolable_stdio_servers(&AgentFsPath {
            display_path: config_path.display().to_string(),
            host_path: config_path,
        })
        .expect("servers");

        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].id, "fetch");
        assert_eq!(servers[0].pool_id, "fetch__shared_pool");
        assert_eq!(servers[0].command, "uvx");
        assert_eq!(servers[0].args, vec!["mcp-server-fetch"]);
        assert_eq!(
            build_config_override(&servers[0], "http://127.0.0.1:1/mcp/fetch")
                .expect("override"),
            "mcp_servers.fetch__shared_pool={ enabled = true, name = 'fetch', startup_timeout_sec = 2.5, url = 'http://127.0.0.1:1/mcp/fetch' }",
        );
    }

    #[test]
    fn round_trips_percent_encoded_paths() {
        let encoded = percent_encode("server one");
        assert_eq!(encoded, "server%20one");
        assert_eq!(percent_decode(&encoded), Some("server one".to_string()));
    }
}
