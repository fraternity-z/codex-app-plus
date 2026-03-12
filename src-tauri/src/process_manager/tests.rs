use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use serde_json::json;
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{timeout, Duration};

use super::*;

const IMMEDIATE_FAILURE_TIMEOUT_MS: u64 = 100;

#[tokio::test]
async fn rpc_request_cleans_up_pending_when_writer_is_closed() {
    let runtime = Arc::new(closed_writer_runtime());
    let manager = ProcessManager {
        runtime: Arc::new(Mutex::new(Some(runtime.clone()))),
    };

    let result = timeout(
        Duration::from_millis(IMMEDIATE_FAILURE_TIMEOUT_MS),
        manager.rpc_request(RpcRequestInput {
            method: "thread.start".to_string(),
            params: json!({}),
            timeout_ms: None,
        }),
    )
    .await
    .expect("rpc_request should fail immediately");
    let error = result.expect_err("rpc_request should surface writer failure");
    let pending = runtime.pending.lock().await;

    assert!(
        matches!(error, AppError::Protocol(message) if message == "写入 app-server stdin 失败")
    );
    assert!(pending.get("1").is_none());
    assert!(pending.is_empty());
}

fn closed_writer_runtime() -> AppServerRuntime {
    let (writer, writer_rx) = mpsc::unbounded_channel();
    drop(writer_rx);

    AppServerRuntime {
        writer,
        pending: Arc::new(Mutex::new(HashMap::new())),
        child: Arc::new(Mutex::new(spawn_completed_child())),
        supervisor: ProcessSupervisor::new("test-app-server").unwrap(),
        writer_task: tokio::spawn(async {}),
        reader_task: tokio::spawn(async {}),
        stderr_task: tokio::spawn(async {}),
        wait_task: tokio::spawn(async {}),
        next_id: AtomicU64::new(1),
    }
}

fn spawn_completed_child() -> Child {
    let mut command = if cfg!(windows) {
        let mut command = Command::new("cmd");
        command.args(["/C", "exit", "0"]);
        command
    } else {
        let mut command = Command::new("sh");
        command.args(["-c", "exit 0"]);
        command
    };

    command.spawn().unwrap()
}
