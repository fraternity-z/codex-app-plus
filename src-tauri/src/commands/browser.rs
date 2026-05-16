use tauri::AppHandle;

use crate::commands::{run_blocking, to_result};
use crate::domains::browser::models::{
    BrowserBrowsingDataKindInput, BrowserOpenInput, BrowserSidebarBoundsInput,
    BrowserSidebarOpenInput, BrowserUseApprovalModeInput, BrowserUseOriginInput,
    BrowserUseSettingsOutput,
};
use crate::domains::browser::service::{
    add_browser_use_origin, clear_browser_browsing_data, clear_browser_browsing_data_by_kind,
    hide_browser_sidebar, open_browser_sidebar, open_browser_window, read_browser_use_settings,
    remove_browser_use_origin, update_browser_sidebar_bounds, write_browser_use_approval_mode,
};

#[tauri::command]
pub fn app_browser_open(app: AppHandle, input: BrowserOpenInput) -> Result<(), String> {
    to_result(open_browser_window(app, input))
}

#[tauri::command]
pub async fn app_browser_sidebar_open(
    app: AppHandle,
    input: BrowserSidebarOpenInput,
) -> Result<(), String> {
    run_blocking(move || open_browser_sidebar(app, input)).await
}

#[tauri::command]
pub fn app_browser_sidebar_update_bounds(
    app: AppHandle,
    input: BrowserSidebarBoundsInput,
) -> Result<(), String> {
    to_result(update_browser_sidebar_bounds(app, input))
}

#[tauri::command]
pub fn app_browser_sidebar_hide(app: AppHandle) -> Result<(), String> {
    to_result(hide_browser_sidebar(app))
}

#[tauri::command]
pub fn app_browser_clear_browsing_data(app: AppHandle) -> Result<(), String> {
    to_result(clear_browser_browsing_data(app))
}

#[tauri::command]
pub fn app_browser_clear_browsing_data_by_kind(
    app: AppHandle,
    input: BrowserBrowsingDataKindInput,
) -> Result<(), String> {
    to_result(clear_browser_browsing_data_by_kind(app, input))
}

#[tauri::command]
pub async fn app_browser_use_settings_read() -> Result<BrowserUseSettingsOutput, String> {
    run_blocking(read_browser_use_settings).await
}

#[tauri::command]
pub async fn app_browser_use_approval_mode_write(
    input: BrowserUseApprovalModeInput,
) -> Result<BrowserUseSettingsOutput, String> {
    run_blocking(move || write_browser_use_approval_mode(input)).await
}

#[tauri::command]
pub async fn app_browser_use_origin_add(
    input: BrowserUseOriginInput,
) -> Result<BrowserUseSettingsOutput, String> {
    run_blocking(move || add_browser_use_origin(input)).await
}

#[tauri::command]
pub async fn app_browser_use_origin_remove(
    input: BrowserUseOriginInput,
) -> Result<BrowserUseSettingsOutput, String> {
    run_blocking(move || remove_browser_use_origin(input)).await
}
