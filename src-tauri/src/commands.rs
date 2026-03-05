use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::models::{
    AppServerStartInput, ImportOfficialDataInput, RpcCancelInput, RpcRequestInput, RpcRequestOutput,
    ServerRequestResolveInput, ShowContextMenuInput, ShowNotificationInput,
};
use crate::process_manager::ProcessManager;

fn to_result<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn app_server_start(
    app: AppHandle,
    state: State<'_, ProcessManager>,
    input: AppServerStartInput,
) -> Result<(), String> {
    to_result(state.start(app, input).await)
}

#[tauri::command]
pub async fn app_server_stop(app: AppHandle, state: State<'_, ProcessManager>) -> Result<(), String> {
    to_result(state.stop(app).await)
}

#[tauri::command]
pub async fn app_server_restart(
    app: AppHandle,
    state: State<'_, ProcessManager>,
    input: AppServerStartInput,
) -> Result<(), String> {
    to_result(state.restart(app, input).await)
}

#[tauri::command]
pub async fn rpc_request(
    state: State<'_, ProcessManager>,
    input: RpcRequestInput,
) -> Result<RpcRequestOutput, String> {
    to_result(state.rpc_request(input).await)
}

#[tauri::command]
pub async fn rpc_cancel(state: State<'_, ProcessManager>, input: RpcCancelInput) -> Result<(), String> {
    to_result(state.rpc_cancel(input).await)
}

#[tauri::command]
pub async fn server_request_resolve(
    state: State<'_, ProcessManager>,
    input: ServerRequestResolveInput,
) -> Result<(), String> {
    to_result(state.resolve_server_request(input).await)
}

#[tauri::command]
pub fn app_open_external(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("url 不能为空".to_string());
    }
    to_result(open::that_detached(url).map_err(|e| AppError::Io(e.to_string())))
}

#[tauri::command]
pub fn app_open_codex_config_toml() -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "无法解析用户目录".to_string())?;
    let config_path = home.join(".codex").join("config.toml");
    if !config_path.exists() {
        return Err(format!("config.toml 不存在: {}", config_path.display()));
    }
    to_result(open::that_detached(config_path).map_err(|e| AppError::Io(e.to_string())))
}

#[tauri::command]
pub fn app_show_notification(app: AppHandle, input: ShowNotificationInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("notification.title 不能为空".to_string());
    }
    app.emit(EVENT_NOTIFICATION_REQUESTED, input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_show_context_menu(app: AppHandle, input: ShowContextMenuInput) -> Result<(), String> {
    if input.items.is_empty() {
        return Err("context menu items 不能为空".to_string());
    }
    app.emit(EVENT_CONTEXT_MENU_REQUESTED, input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_import_official_data(input: ImportOfficialDataInput) -> Result<(), String> {
    to_result(import_official_data(input))
}

fn import_official_data(input: ImportOfficialDataInput) -> AppResult<()> {
    if input.source_path.trim().is_empty() {
        return Err(AppError::InvalidInput("sourcePath 不能为空".to_string()));
    }
    let source = PathBuf::from(input.source_path);
    if !source.exists() {
        return Err(AppError::InvalidInput("sourcePath 不存在".to_string()));
    }
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    let destination = local_data.join("CodexAppPlus").join("imported-official");
    copy_directory(&source, &destination)
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
