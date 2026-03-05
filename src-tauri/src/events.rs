use tauri::{AppHandle, Emitter};

use crate::error::AppResult;
use crate::models::{
    ConnectionChangedPayload, FatalErrorPayload, NotificationPayload, ServerRequestPayload,
};

pub const EVENT_CONNECTION_CHANGED: &str = "connection.changed";
pub const EVENT_NOTIFICATION_RECEIVED: &str = "notification.received";
pub const EVENT_SERVER_REQUEST_RECEIVED: &str = "serverRequest.received";
pub const EVENT_FATAL_ERROR: &str = "fatal.error";
pub const EVENT_CONTEXT_MENU_REQUESTED: &str = "app.context-menu.requested";
pub const EVENT_NOTIFICATION_REQUESTED: &str = "app.notification.requested";

pub fn emit_connection_changed(app: &AppHandle, status: &str) -> AppResult<()> {
    let payload = ConnectionChangedPayload {
        status: status.to_string(),
    };
    app.emit(EVENT_CONNECTION_CHANGED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_notification(app: &AppHandle, method: String, params: serde_json::Value) -> AppResult<()> {
    let payload = NotificationPayload { method, params };
    app.emit(EVENT_NOTIFICATION_RECEIVED, payload)
        .map_err(|e| crate::error::AppError::Protocol(e.to_string()))
}

pub fn emit_server_request(
    app: &AppHandle,
    id: String,
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
