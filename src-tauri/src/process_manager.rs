use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tauri::AppHandle;
use tokio::process::Child;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

use crate::agent_environment::resolve_agent_environment;
use crate::app_server_io::{
    spawn_reader_task, spawn_stderr_task, spawn_writer_task, PendingMap, PendingOutcome,
};
use crate::app_server_stderr::{emit_app_server_fatal, AppServerStderrLog};
use crate::bundled_computer_use;
use crate::codex_cli::CodexCli;
use crate::error::{AppError, AppResult};
use crate::events::emit_connection_changed;
use crate::models::{
    AppServerStartInput, JsonRpcErrorBody, RpcCancelInput, RpcNotifyInput, RpcRequestInput,
    RpcRequestOutput, ServerRequestResolveInput,
};
use crate::process_supervisor::ProcessSupervisor;
use crate::rpc_transport::{
    build_cancel_line, build_notification_line, build_request_line, build_server_response_line,
};

struct AppServerRuntime {
    writer: mpsc::UnboundedSender<String>,
    pending: PendingMap,
    child: Arc<Mutex<Child>>,
    supervisor: ProcessSupervisor,
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
        let _ = self.supervisor.terminate();

        let mut child = self.child.lock().await;
        terminate_tokio_child(&mut child).await;
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
        emit_connection_changed(&app, "connected")
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
        if self.runtime.lock().await.is_some() {
            self.stop(app.clone()).await?;
        }
        self.start(app, input).await
    }

    pub async fn shutdown_all(&self, app: AppHandle) {
        let runtime = {
            let mut guard = self.runtime.lock().await;
            guard.take()
        };
        if let Some(runtime) = runtime {
            runtime.shutdown(&app).await;
        }
    }

    pub async fn rpc_request(&self, input: RpcRequestInput) -> AppResult<RpcRequestOutput> {
        if input.method.trim().is_empty() {
            return Err(AppError::InvalidInput("method 不能为空".to_string()));
        }

        let runtime = self.get_runtime().await?;
        let request_id = runtime.next_id.fetch_add(1, Ordering::SeqCst).to_string();
        let line = build_request_line(&request_id, &input.method, input.params)?;
        let (sender, receiver) = oneshot::channel();
        register_pending_request(&runtime, &request_id, sender, line).await?;

        await_request_response(&runtime, request_id, receiver, input.timeout_ms).await
    }

    pub async fn rpc_notify(&self, input: RpcNotifyInput) -> AppResult<()> {
        if input.method.trim().is_empty() {
            return Err(AppError::InvalidInput("method 不能为空".to_string()));
        }

        let runtime = self.get_runtime().await?;
        let line = build_notification_line(&input.method, input.params)?;
        send_line(&runtime.writer, line, "发送 app-server notification 失败")
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
        send_line(&runtime.writer, cancel_line, "发送取消请求失败")
    }

    pub async fn resolve_server_request(&self, input: ServerRequestResolveInput) -> AppResult<()> {
        let runtime = self.get_runtime().await?;
        let line = build_server_response_line(&input)?;
        send_line(&runtime.writer, line, "写入 serverRequest.resolve 失败")
    }

    async fn get_runtime(&self) -> AppResult<Arc<AppServerRuntime>> {
        let guard = self.runtime.lock().await;
        guard.clone().ok_or(AppError::NotRunning)
    }
}

async fn await_request_response(
    runtime: &AppServerRuntime,
    request_id: String,
    receiver: oneshot::Receiver<PendingOutcome>,
    timeout_ms: Option<u64>,
) -> AppResult<RpcRequestOutput> {
    let outcome = timeout(
        Duration::from_millis(timeout_ms.unwrap_or(60_000)),
        receiver,
    )
    .await;

    match outcome {
        Ok(Ok(PendingOutcome::Result(result))) => Ok(RpcRequestOutput { request_id, result }),
        Ok(Ok(PendingOutcome::Error(error))) => Err(AppError::Protocol(format!(
            "[{}] {}",
            error.code, error.message
        ))),
        Ok(Err(_)) => Err(AppError::Protocol("RPC 响应通道已关闭".to_string())),
        Err(_) => {
            runtime.pending.lock().await.remove(&request_id);
            Err(AppError::Timeout(format!("请求 {request_id} 超时")))
        }
    }
}

async fn register_pending_request(
    runtime: &AppServerRuntime,
    request_id: &str,
    sender: oneshot::Sender<PendingOutcome>,
    line: String,
) -> AppResult<()> {
    runtime
        .pending
        .lock()
        .await
        .insert(request_id.to_string(), sender);
    if let Err(error) = send_line(&runtime.writer, line, "写入 app-server stdin 失败") {
        runtime.pending.lock().await.remove(request_id);
        return Err(error);
    }
    Ok(())
}

async fn spawn_runtime(
    app: AppHandle,
    runtime_store: Arc<Mutex<Option<Arc<AppServerRuntime>>>>,
    input: AppServerStartInput,
) -> AppResult<Arc<AppServerRuntime>> {
    let agent_environment = resolve_agent_environment(input.agent_environment);
    bundled_computer_use::ensure_registered(&app, agent_environment)?;

    let cli = CodexCli::resolve(&input)?;
    let _version = cli.detect_version().await?;
    let supervisor = ProcessSupervisor::new("app-server")?;
    let stderr_log = AppServerStderrLog::new();
    let mut spawned = cli.spawn_app_server()?;
    if let Err(error) = supervisor.assign_tokio_child(&spawned.child) {
        terminate_tokio_child(&mut spawned.child).await;
        return Err(error);
    }

    let (writer, writer_rx) = mpsc::unbounded_channel();
    let pending = Arc::new(Mutex::new(std::collections::HashMap::<
        String,
        oneshot::Sender<PendingOutcome>,
    >::new()));
    let child = Arc::new(Mutex::new(spawned.child));
    let writer_task = spawn_writer_task(app.clone(), writer_rx, spawned.stdin, stderr_log.clone());
    let reader_task = spawn_reader_task(
        app.clone(),
        spawned.stdout,
        pending.clone(),
        stderr_log.clone(),
    );
    let stderr_task = spawn_stderr_task(spawned.stderr, stderr_log.clone());
    let wait_task = spawn_wait_task(app, child.clone(), runtime_store, stderr_log);

    Ok(Arc::new(AppServerRuntime {
        writer,
        pending,
        child,
        supervisor,
        writer_task,
        reader_task,
        stderr_task,
        wait_task,
        next_id: AtomicU64::new(1),
    }))
}

async fn terminate_tokio_child(child: &mut Child) {
    if child.id().is_none() {
        return;
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

fn spawn_wait_task(
    app: AppHandle,
    child: Arc<Mutex<Child>>,
    runtime_store: Arc<Mutex<Option<Arc<AppServerRuntime>>>>,
    stderr_log: AppServerStderrLog,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let wait_result = child.lock().await.wait().await;
        let runtime = runtime_store.lock().await.take();
        if let Some(runtime) = runtime {
            runtime.fail_all_pending().await;
        }

        match wait_result {
            Ok(status) if status.success() => {
                let _ = emit_connection_changed(&app, "disconnected");
            }
            Ok(status) => {
                let _ = emit_connection_changed(&app, "error");
                let message = format!("app-server 非零退出: {status}");
                let _ = emit_app_server_fatal(&app, &stderr_log, message);
            }
            Err(error) => {
                let _ = emit_connection_changed(&app, "error");
                let message = format!("等待 app-server 退出失败: {error}");
                let _ = emit_app_server_fatal(&app, &stderr_log, message);
            }
        }
    })
}

fn send_line(writer: &mpsc::UnboundedSender<String>, line: String, message: &str) -> AppResult<()> {
    writer
        .send(line)
        .map_err(|_| AppError::Protocol(message.to_string()))
}

#[cfg(test)]
mod tests;
