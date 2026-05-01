use tauri::{AppHandle, Emitter};

use crate::error::AppResult;
use crate::models::{
    BrowserSidebarOpenRequestedPayload, CodexSessionIndexUpdatedPayload, ConnectionChangedPayload,
    FatalErrorPayload, NotificationPayload, RequestId, ServerRequestPayload, TerminalExitPayload,
    TerminalOutputPayload,
};

pub const EVENT_CONNECTION_CHANGED: &str = "connection-changed";
pub const EVENT_CODEX_SESSION_INDEX_UPDATED: &str = "codex-session-index-updated";
pub const EVENT_NOTIFICATION_RECEIVED: &str = "notification-received";
pub const EVENT_SERVER_REQUEST_RECEIVED: &str = "server-request-received";
pub const EVENT_FATAL_ERROR: &str = "fatal-error";
pub const EVENT_TERMINAL_OUTPUT: &str = "terminal-output";
pub const EVENT_TERMINAL_EXIT: &str = "terminal-exit";
pub const EVENT_CONTEXT_MENU_REQUESTED: &str = "app-context-menu-requested";
pub const EVENT_NOTIFICATION_REQUESTED: &str = "app-notification-requested";
pub const EVENT_BROWSER_SIDEBAR_OPEN_REQUESTED: &str = "browser-sidebar-open-requested";

pub fn emit_connection_changed(app: &AppHandle, status: &str) -> AppResult<()> {
    let payload = ConnectionChangedPayload {
        status: status.to_string(),
    };
    app.emit(EVENT_CONNECTION_CHANGED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_notification(
    app: &AppHandle,
    method: String,
    params: serde_json::Value,
) -> AppResult<()> {
    let payload = NotificationPayload { method, params };
    app.emit(EVENT_NOTIFICATION_RECEIVED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_server_request(
    app: &AppHandle,
    id: RequestId,
    method: String,
    params: serde_json::Value,
) -> AppResult<()> {
    let payload = ServerRequestPayload { id, method, params };
    app.emit(EVENT_SERVER_REQUEST_RECEIVED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_fatal(app: &AppHandle, message: impl Into<String>) -> AppResult<()> {
    let payload = FatalErrorPayload {
        message: message.into(),
    };
    app.emit(EVENT_FATAL_ERROR, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_codex_session_index_updated(
    app: &AppHandle,
    payload: CodexSessionIndexUpdatedPayload,
) -> AppResult<()> {
    app.emit(EVENT_CODEX_SESSION_INDEX_UPDATED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_terminal_output(
    app: &AppHandle,
    session_id: impl Into<String>,
    data: impl Into<String>,
) -> AppResult<()> {
    let payload = TerminalOutputPayload {
        session_id: session_id.into(),
        data: data.into(),
    };
    app.emit(EVENT_TERMINAL_OUTPUT, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_terminal_exit(
    app: &AppHandle,
    session_id: impl Into<String>,
    exit_code: Option<u32>,
) -> AppResult<()> {
    let payload = TerminalExitPayload {
        session_id: session_id.into(),
        exit_code,
    };
    app.emit(EVENT_TERMINAL_EXIT, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_browser_sidebar_open_requested(app: &AppHandle, url: Option<String>) -> AppResult<()> {
    let payload = BrowserSidebarOpenRequestedPayload { url };
    app.emit(EVENT_BROWSER_SIDEBAR_OPEN_REQUESTED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}
