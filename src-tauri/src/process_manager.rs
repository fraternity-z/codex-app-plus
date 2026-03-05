use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

use crate::error::{AppError, AppResult};
use crate::events::{
    emit_connection_changed, emit_fatal, emit_notification, emit_server_request,
};
use crate::models::{
    AppServerStartInput, JsonRpcErrorBody, RpcCancelInput, RpcRequestInput, RpcRequestOutput,
    ServerRequestResolveInput,
};
use crate::rpc_transport::{
    build_cancel_line, build_request_line, build_server_response_line, parse_incoming_line,
    IncomingMessage,
};

enum PendingOutcome {
    Result(Value),
    Error(JsonRpcErrorBody),
}

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<PendingOutcome>>>>;

struct AppServerRuntime {
    writer: mpsc::UnboundedSender<String>,
    pending: PendingMap,
    child: Arc<Mutex<Child>>,
    writer_task: JoinHandle<()>,
    reader_task: JoinHandle<()>,
    stderr_task: JoinHandle<()>,
    wait_task: JoinHandle<()>,
    next_id: AtomicU64,
}

impl AppServerRuntime {
    async fn shutdown(&self, app: &AppHandle) {
        self.wait_task.abort();
        self.writer_task.abort();
        self.reader_task.abort();
        self.stderr_task.abort();
        self.fail_all_pending().await;
        let mut child = self.child.lock().await;
        if child.id().is_some() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        let _ = emit_connection_changed(app, "disconnected");
    }

    async fn fail_all_pending(&self) {
        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(PendingOutcome::Error(JsonRpcErrorBody {
                code: -32800,
                message: "app-server 已停止".to_string(),
                data: None,
            }));
        }
    }
}

#[derive(Clone, Default)]
pub struct ProcessManager {
    runtime: Arc<Mutex<Option<Arc<AppServerRuntime>>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(&self, app: AppHandle, input: AppServerStartInput) -> AppResult<()> {
        let mut guard = self.runtime.lock().await;
        if guard.is_some() {
            return Err(AppError::AlreadyRunning);
        }
        emit_connection_changed(&app, "connecting")?;
        let runtime = spawn_runtime(app.clone(), self.runtime.clone(), input).await?;
        *guard = Some(runtime);
        emit_connection_changed(&app, "connected")?;
        Ok(())
    }

    pub async fn stop(&self, app: AppHandle) -> AppResult<()> {
        let runtime = {
            let mut guard = self.runtime.lock().await;
            guard.take().ok_or(AppError::NotRunning)?
        };
        runtime.shutdown(&app).await;
        Ok(())
    }

    pub async fn restart(&self, app: AppHandle, input: AppServerStartInput) -> AppResult<()> {
        let has_runtime = self.runtime.lock().await.is_some();
        if has_runtime {
            self.stop(app.clone()).await?;
        }
        self.start(app, input).await
    }

    pub async fn rpc_request(&self, input: RpcRequestInput) -> AppResult<RpcRequestOutput> {
        if input.method.trim().is_empty() {
            return Err(AppError::InvalidInput("method 不能为空".to_string()));
        }
        let runtime = self.get_runtime().await?;
        let request_id = runtime.next_id.fetch_add(1, Ordering::SeqCst).to_string();
        let line = build_request_line(&request_id, &input.method, input.params)?;
        let (sender, receiver) = oneshot::channel();
        runtime.pending.lock().await.insert(request_id.clone(), sender);
        runtime
            .writer
            .send(line)
            .map_err(|_| AppError::Protocol("写入 app-server stdin 失败".to_string()))?;

        let timeout_ms = input.timeout_ms.unwrap_or(60_000);
        let outcome = timeout(Duration::from_millis(timeout_ms), receiver).await;
        match outcome {
            Ok(Ok(PendingOutcome::Result(result))) => Ok(RpcRequestOutput { request_id, result }),
            Ok(Ok(PendingOutcome::Error(error))) => Err(AppError::Protocol(format!(
                "[{}] {}",
                error.code, error.message
            ))),
            Ok(Err(_)) => Err(AppError::Protocol("RPC 响应通道已关闭".to_string())),
            Err(_) => {
                runtime.pending.lock().await.remove(&request_id);
                Err(AppError::Timeout(format!("请求 {} 超时", request_id)))
            }
        }
    }

    pub async fn rpc_cancel(&self, input: RpcCancelInput) -> AppResult<()> {
        if input.request_id.trim().is_empty() {
            return Err(AppError::InvalidInput("request_id 不能为空".to_string()));
        }
        let runtime = self.get_runtime().await?;
        let sender = runtime.pending.lock().await.remove(&input.request_id);
        let request = sender.ok_or_else(|| {
            AppError::InvalidInput(format!("请求 {} 不存在或已完成", input.request_id))
        })?;
        let _ = request.send(PendingOutcome::Error(JsonRpcErrorBody {
            code: -32800,
            message: "请求已取消".to_string(),
            data: None,
        }));
        let cancel_line = build_cancel_line(&input.request_id)?;
        runtime
            .writer
            .send(cancel_line)
            .map_err(|_| AppError::Protocol("发送取消请求失败".to_string()))?;
        Ok(())
    }

    pub async fn resolve_server_request(&self, input: ServerRequestResolveInput) -> AppResult<()> {
        let runtime = self.get_runtime().await?;
        let line = build_server_response_line(&input)?;
        runtime
            .writer
            .send(line)
            .map_err(|_| AppError::Protocol("发送 serverRequest response 失败".to_string()))?;
        Ok(())
    }

    async fn get_runtime(&self) -> AppResult<Arc<AppServerRuntime>> {
        self.runtime.lock().await.clone().ok_or(AppError::NotRunning)
    }
}

async fn spawn_runtime(
    app: AppHandle,
    runtime_store: Arc<Mutex<Option<Arc<AppServerRuntime>>>>,
    input: AppServerStartInput,
) -> AppResult<Arc<AppServerRuntime>> {
    let codex_path = resolve_codex_path(input);
    let codex_home = ensure_codex_home()?;
    let mut command = Command::new(codex_path);
    command
        .arg("app-server")
        .arg("--analytics-default-enabled")
        .arg("--listen")
        .arg("stdio://")
        .env("CODEX_HOME", codex_home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Protocol("无法获取 stdin".to_string()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Protocol("无法获取 stdout".to_string()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Protocol("无法获取 stderr".to_string()))?;

    let (writer, writer_rx) = mpsc::unbounded_channel();
    let pending = Arc::new(Mutex::new(HashMap::new()));
    let child = Arc::new(Mutex::new(child));
    let writer_task = spawn_writer_task(app.clone(), writer_rx, stdin);
    let reader_task = spawn_reader_task(app.clone(), stdout, pending.clone());
    let stderr_task = spawn_stderr_task(app.clone(), stderr);
    let wait_task = spawn_wait_task(app, child.clone(), runtime_store);

    Ok(Arc::new(AppServerRuntime {
        writer,
        pending,
        child,
        writer_task,
        reader_task,
        stderr_task,
        wait_task,
        next_id: AtomicU64::new(1),
    }))
}

fn spawn_writer_task(
    app: AppHandle,
    mut rx: mpsc::UnboundedReceiver<String>,
    mut stdin: tokio::process::ChildStdin,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            let write_result = stdin.write_all(line.as_bytes()).await;
            if write_result.is_err() {
                let _ = emit_fatal(&app, "写入 app-server 失败");
                break;
            }
            if stdin.write_all(b"\n").await.is_err() {
                let _ = emit_fatal(&app, "写入换行符失败");
                break;
            }
            if stdin.flush().await.is_err() {
                let _ = emit_fatal(&app, "刷新 app-server stdin 失败");
                break;
            }
        }
    })
}

fn spawn_reader_task(app: AppHandle, stdout: ChildStdout, pending: PendingMap) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    if let Err(error) = handle_incoming_line(&app, &pending, line).await {
                        let _ = emit_fatal(&app, error.to_string());
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    let _ = emit_fatal(&app, format!("读取 stdout 失败: {}", error));
                    break;
                }
            }
        }
    })
}

fn spawn_stderr_task(app: AppHandle, stderr: ChildStderr) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let _ = emit_fatal(&app, format!("app-server stderr: {}", line));
                }
                Ok(None) => break,
                Err(error) => {
                    let _ = emit_fatal(&app, format!("读取 stderr 失败: {}", error));
                    break;
                }
            }
        }
    })
}

fn spawn_wait_task(
    app: AppHandle,
    child: Arc<Mutex<Child>>,
    runtime_store: Arc<Mutex<Option<Arc<AppServerRuntime>>>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let wait_result = child.lock().await.wait().await;
        runtime_store.lock().await.take();
        match wait_result {
            Ok(status) if status.success() => {
                let _ = emit_connection_changed(&app, "disconnected");
            }
            Ok(status) => {
                let _ = emit_connection_changed(&app, "error");
                let _ = emit_fatal(&app, format!("app-server 非零退出: {}", status));
            }
            Err(error) => {
                let _ = emit_connection_changed(&app, "error");
                let _ = emit_fatal(&app, format!("等待 app-server 退出失败: {}", error));
            }
        }
    })
}

async fn handle_incoming_line(app: &AppHandle, pending: &PendingMap, line: String) -> AppResult<()> {
    let message = parse_incoming_line(&line)?;
    match message {
        IncomingMessage::Notification { method, params } => emit_notification(app, method, params)?,
        IncomingMessage::ServerRequest { id, method, params } => {
            emit_server_request(app, id, method, params)?
        }
        IncomingMessage::Response { id, result, error } => {
            let sender = pending.lock().await.remove(&id);
            let Some(sender) = sender else {
                return Err(AppError::Protocol(format!("未匹配的 response id: {}", id)));
            };
            match (result, error) {
                (Some(result), None) => {
                    let _ = sender.send(PendingOutcome::Result(result));
                }
                (_, Some(error)) => {
                    let _ = sender.send(PendingOutcome::Error(error));
                }
                _ => {
                    let _ = sender.send(PendingOutcome::Error(JsonRpcErrorBody {
                        code: -32603,
                        message: "response 缺少 result/error".to_string(),
                        data: None,
                    }));
                }
            }
        }
    }
    Ok(())
}

fn resolve_codex_path(input: AppServerStartInput) -> String {
    if let Some(path) = input.codex_path {
        return path;
    }
    if let Ok(path) = std::env::var("CODEX_BINARY_PATH") {
        return path;
    }
    "codex.exe".to_string()
}

fn ensure_codex_home() -> AppResult<PathBuf> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法获取 LOCALAPPDATA 目录".to_string()))?;
    let codex_home = base.join("CodexAppPlus").join("codex-home");
    std::fs::create_dir_all(&codex_home)?;
    Ok(codex_home)
}
