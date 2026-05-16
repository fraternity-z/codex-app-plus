use std::collections::HashMap;
use std::str::Utf8Error;
use std::sync::Arc;

use serde_json::Value;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStderr, ChildStdout};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use crate::events::{emit_notification, emit_server_request};
use crate::infra::rpc::stderr::{emit_app_server_fatal, AppServerStderrLog};
use crate::infra::rpc::transport::{parse_incoming_line, IncomingMessage};
use crate::models::JsonRpcErrorBody;

const STDOUT_INVALID_UTF8_CONTEXT_BYTES: usize = 24;
const STDOUT_PREVIEW_BYTES: usize = 160;

pub enum PendingOutcome {
    Result(Value),
    Error(JsonRpcErrorBody),
}

pub type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<PendingOutcome>>>>;

pub fn spawn_writer_task(
    app: AppHandle,
    mut rx: mpsc::UnboundedReceiver<String>,
    mut stdin: tokio::process::ChildStdin,
    stderr_log: AppServerStderrLog,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if write_line(&mut stdin, &line).await.is_err() {
                let _ = emit_app_server_fatal(&app, &stderr_log, "写入 app-server stdin 失败");
                break;
            }
        }
    })
}

pub fn spawn_reader_task(
    app: AppHandle,
    stdout: ChildStdout,
    pending: PendingMap,
    stderr_log: AppServerStderrLog,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer).await {
                Ok(0) => break,
                Ok(_) => {
                    strip_line_ending(&mut buffer);

                    if is_blank_stdout_line(&buffer) {
                        continue;
                    }

                    if !looks_like_protocol_stdout_line(&buffer) {
                        stderr_log.record_line(format_ignored_stdout_line(&buffer));
                        continue;
                    }

                    let line = match decode_protocol_stdout_line(&buffer) {
                        Ok(line) => line.to_string(),
                        Err(message) => {
                            let _ = emit_app_server_fatal(&app, &stderr_log, message);
                            break;
                        }
                    };

                    if let Err(error) = handle_incoming_line(&app, &pending, line).await {
                        let _ = emit_app_server_fatal(&app, &stderr_log, error.to_string());
                    }
                }
                Err(error) => {
                    let message = format!("读取 stdout 失败: {error}");
                    let _ = emit_app_server_fatal(&app, &stderr_log, message);
                    break;
                }
            }
        }
    })
}

pub fn spawn_stderr_task(stderr: ChildStderr, stderr_log: AppServerStderrLog) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => stderr_log.record_line(line),
                Ok(None) => break,
                Err(error) => {
                    stderr_log.record_line(format!("[stderr read failed] {error}"));
                    break;
                }
            }
        }
    })
}

async fn write_line(stdin: &mut tokio::process::ChildStdin, line: &str) -> AppResult<()> {
    stdin.write_all(line.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    stdin.flush().await?;
    Ok(())
}

fn strip_line_ending(bytes: &mut Vec<u8>) {
    if bytes.last() == Some(&b'\n') {
        bytes.pop();
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }
    }
}

fn is_blank_stdout_line(bytes: &[u8]) -> bool {
    trim_ascii_whitespace(bytes).is_empty()
}

fn looks_like_protocol_stdout_line(bytes: &[u8]) -> bool {
    trim_ascii_whitespace(bytes).first().copied() == Some(b'{')
}

fn decode_protocol_stdout_line(bytes: &[u8]) -> Result<&str, String> {
    std::str::from_utf8(bytes).map_err(|error| format_invalid_utf8_stdout(bytes, error))
}

fn format_invalid_utf8_stdout(bytes: &[u8], error: Utf8Error) -> String {
    let invalid_offset = error.valid_up_to();
    let invalid_len = error
        .error_len()
        .map(|len| len.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let context_start = invalid_offset.saturating_sub(STDOUT_INVALID_UTF8_CONTEXT_BYTES);
    let context_end = bytes
        .len()
        .min(invalid_offset + error.error_len().unwrap_or(1) + STDOUT_INVALID_UTF8_CONTEXT_BYTES);

    format!(
        "读取 stdout 失败: stream did not contain valid UTF-8\n\
         app-server stdout protocol line contains invalid UTF-8 bytes; \
         line_bytes={}, invalid_offset={}, error_len={}, hex_context_offset={}, \
         hex_context={}, lossy_preview=\"{}\"",
        bytes.len(),
        invalid_offset,
        invalid_len,
        context_start,
        format_hex_bytes(&bytes[context_start..context_end]),
        lossy_preview(bytes)
    )
}

fn format_ignored_stdout_line(bytes: &[u8]) -> String {
    format!(
        "[stdout ignored] non-protocol app-server stdout line: line_bytes={}, \
         hex_preview={}, lossy_preview=\"{}\"",
        bytes.len(),
        format_hex_bytes(take_preview_bytes(bytes)),
        lossy_preview(bytes)
    )
}

fn trim_ascii_whitespace(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|byte| !byte.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|byte| !byte.is_ascii_whitespace())
        .map(|index| index + 1)
        .unwrap_or(start);
    &bytes[start..end]
}

fn take_preview_bytes(bytes: &[u8]) -> &[u8] {
    let end = bytes.len().min(STDOUT_PREVIEW_BYTES);
    &bytes[..end]
}

fn format_hex_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return "<empty>".to_string();
    }

    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn lossy_preview(bytes: &[u8]) -> String {
    let preview = String::from_utf8_lossy(take_preview_bytes(bytes))
        .escape_debug()
        .to_string();
    if preview.is_empty() {
        return "<empty>".to_string();
    }

    if bytes.len() > STDOUT_PREVIEW_BYTES {
        format!("{preview}...")
    } else {
        preview
    }
}

#[cfg(test)]
mod tests {
    use super::{
        decode_protocol_stdout_line, format_ignored_stdout_line, looks_like_protocol_stdout_line,
        strip_line_ending,
    };

    #[test]
    fn strips_lf_and_crlf_line_endings() {
        let mut lf = b"{\"id\":1}\n".to_vec();
        strip_line_ending(&mut lf);
        assert_eq!(lf, b"{\"id\":1}");

        let mut crlf = b"{\"id\":1}\r\n".to_vec();
        strip_line_ending(&mut crlf);
        assert_eq!(crlf, b"{\"id\":1}");
    }

    #[test]
    fn detects_protocol_stdout_lines_after_whitespace() {
        assert!(looks_like_protocol_stdout_line(b"  {\"id\":1}"));
        assert!(!looks_like_protocol_stdout_line(b"startup message"));
    }

    #[test]
    fn reports_invalid_utf8_protocol_lines_with_byte_context() {
        let error = decode_protocol_stdout_line(b"{\"id\":1,\"result\":\"\xFF\"}").unwrap_err();

        assert!(error.contains("stream did not contain valid UTF-8"));
        assert!(error.contains("line_bytes="));
        assert!(error.contains("invalid_offset="));
        assert!(error.contains("hex_context="));
        assert!(error.contains("FF"));
        assert!(error.contains("lossy_preview="));
    }

    #[test]
    fn formats_ignored_non_protocol_stdout_with_raw_preview() {
        let message = format_ignored_stdout_line(b"\xFFstartup");

        assert!(message.contains("[stdout ignored]"));
        assert!(message.contains("line_bytes=8"));
        assert!(message.contains("FF"));
        assert!(message.contains("lossy_preview="));
    }
}

async fn handle_incoming_line(
    app: &AppHandle,
    pending: &PendingMap,
    line: String,
) -> AppResult<()> {
    match parse_incoming_line(&line)? {
        IncomingMessage::Notification { method, params } => emit_notification(app, method, params)?,
        IncomingMessage::ServerRequest { id, method, params } => {
            emit_server_request(app, id, method, params)?;
        }
        IncomingMessage::Response { id, result, error } => {
            resolve_pending_response(pending, id, result, error).await?;
        }
    }
    Ok(())
}

async fn resolve_pending_response(
    pending: &PendingMap,
    id: String,
    result: Option<Value>,
    error: Option<JsonRpcErrorBody>,
) -> AppResult<()> {
    let sender = pending.lock().await.remove(&id);
    let Some(sender) = sender else {
        return Err(AppError::Protocol(format!("未匹配的 response id: {id}")));
    };

    match (result, error) {
        (Some(value), None) => {
            let _ = sender.send(PendingOutcome::Result(value));
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
    Ok(())
}
