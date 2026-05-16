use tauri::AppHandle;

use crate::domains::app::service::{open_codex_config_toml, reveal_path_in_folder};
use crate::domains::app::window_theme::{apply_window_theme, WindowTheme};
use crate::domains::workspace::launcher::{open_file_in_editor, open_workspace};
use crate::domains::workspace::models::{
    OpenCodexConfigTomlInput, OpenFileInEditorInput, OpenWorkspaceInput, RevealPathInFolderInput,
    ShowContextMenuInput, ShowNotificationInput, WindowChromeAction, WorkspacePersistenceState,
    WriteProjectPermissionConfigInput, WriteProjectPermissionConfigOutput,
};
use crate::domains::workspace::permission_config::write_project_permission_config;
use crate::domains::workspace::storage::{read_workspace_state, write_workspace_state};
use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::infra::process::command::open_detached_target;

use super::{emit_app_event, require_non_empty, run_blocking, to_result};

#[tauri::command]
pub fn app_open_external(url: String) -> Result<(), String> {
    require_non_empty(&url, "url")?;
    to_result(open_detached_target(url))
}

#[tauri::command]
pub fn app_set_window_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let parsed_theme = to_result(WindowTheme::parse(theme.trim()))?;
    to_result(apply_window_theme(&window, parsed_theme))
}

#[tauri::command]
pub fn app_start_window_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    to_result(window.start_dragging().map_err(AppError::from))
}

#[tauri::command]
pub fn app_control_window(
    window: tauri::WebviewWindow,
    action: WindowChromeAction,
) -> Result<(), String> {
    let result = match action {
        WindowChromeAction::Minimize => window.minimize().map_err(AppError::from),
        WindowChromeAction::ToggleMaximize => toggle_window_maximize(&window),
        WindowChromeAction::Close => window.close().map_err(AppError::from),
    };
    to_result(result)
}

#[tauri::command]
pub fn app_open_workspace(input: OpenWorkspaceInput) -> Result<(), String> {
    to_result(open_workspace(input))
}

#[tauri::command]
pub fn app_open_file_in_editor(input: OpenFileInEditorInput) -> Result<(), String> {
    to_result(open_file_in_editor(input))
}

#[tauri::command]
pub fn app_open_codex_config_toml(input: OpenCodexConfigTomlInput) -> Result<(), String> {
    to_result(open_codex_config_toml(input))
}

#[tauri::command]
pub async fn app_write_project_permission_config(
    input: WriteProjectPermissionConfigInput,
) -> Result<WriteProjectPermissionConfigOutput, String> {
    run_blocking(move || write_project_permission_config(input)).await
}

#[tauri::command]
pub fn app_reveal_path_in_folder(input: RevealPathInFolderInput) -> Result<(), String> {
    to_result(reveal_path_in_folder(input))
}

#[tauri::command]
pub async fn app_read_workspace_state() -> Result<Option<WorkspacePersistenceState>, String> {
    run_blocking(read_workspace_state).await
}

#[tauri::command]
pub async fn app_write_workspace_state(input: WorkspacePersistenceState) -> Result<(), String> {
    run_blocking(move || write_workspace_state(input)).await
}

#[tauri::command]
pub fn app_show_notification(app: AppHandle, input: ShowNotificationInput) -> Result<(), String> {
    require_non_empty(&input.title, "notification.title")?;
    emit_app_event(&app, EVENT_NOTIFICATION_REQUESTED, input)
}

#[tauri::command]
pub fn app_show_context_menu(app: AppHandle, input: ShowContextMenuInput) -> Result<(), String> {
    if input.items.is_empty() {
        return Err("context menu items 不能为空".to_string());
    }
    emit_app_event(&app, EVENT_CONTEXT_MENU_REQUESTED, input)
}

fn toggle_window_maximize(window: &tauri::WebviewWindow) -> AppResult<()> {
    if window.is_maximized().map_err(AppError::from)? {
        return window.unmaximize().map_err(AppError::from);
    }

    window.maximize().map_err(AppError::from)
}
