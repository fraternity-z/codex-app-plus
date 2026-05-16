use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppResult;

pub mod agents;
pub mod app_server;
pub mod browser;
pub mod dictation;
pub mod sessions;
pub mod settings;
pub mod terminal;
pub mod workspace;

pub use agents::*;
pub use app_server::*;
pub use browser::*;
pub use dictation::*;
pub use sessions::*;
pub use settings::*;
pub use terminal::*;
pub use workspace::*;

pub(crate) fn to_result<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

pub(crate) async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    let result = tokio::task::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?;
    result.map_err(|error| error.to_string())
}

pub(crate) fn require_non_empty(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field_name} 不能为空"));
    }
    Ok(())
}

pub(crate) fn emit_app_event<T>(app: &AppHandle, event_name: &str, payload: T) -> Result<(), String>
where
    T: Clone + Serialize,
{
    app.emit(event_name, payload)
        .map_err(|error| error.to_string())
}
