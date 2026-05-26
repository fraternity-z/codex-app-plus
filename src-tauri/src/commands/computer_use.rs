use crate::commands::run_blocking;
use crate::domains::computer_use::models::{
    ComputerUseAppInput, ComputerUseApprovalModeInput, ComputerUseSettingsOutput,
};
use crate::domains::computer_use::service::{
    add_computer_use_app, read_computer_use_settings, remove_computer_use_app,
    write_computer_use_approval_mode,
};

#[tauri::command]
pub async fn app_computer_use_settings_read() -> Result<ComputerUseSettingsOutput, String> {
    run_blocking(read_computer_use_settings).await
}

#[tauri::command]
pub async fn app_computer_use_app_add(
    input: ComputerUseAppInput,
) -> Result<ComputerUseSettingsOutput, String> {
    run_blocking(move || add_computer_use_app(input)).await
}

#[tauri::command]
pub async fn app_computer_use_app_remove(
    input: ComputerUseAppInput,
) -> Result<ComputerUseSettingsOutput, String> {
    run_blocking(move || remove_computer_use_app(input)).await
}

#[tauri::command]
pub async fn app_computer_use_approval_mode_write(
    input: ComputerUseApprovalModeInput,
) -> Result<ComputerUseSettingsOutput, String> {
    run_blocking(move || write_computer_use_approval_mode(input)).await
}
