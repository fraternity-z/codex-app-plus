use crate::commands::run_blocking;
use crate::domains::computer_use::models::{ComputerUseAppInput, ComputerUseSettingsOutput};
use crate::domains::computer_use::service::{
    add_computer_use_app, read_computer_use_settings, remove_computer_use_app,
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
