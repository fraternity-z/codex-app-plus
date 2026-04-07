use tauri::{AppHandle, State};

use crate::commands::to_result;
use crate::models::{
    TerminalCloseInput, TerminalCreateInput, TerminalCreateOutput, TerminalResizeInput,
    TerminalWriteInput,
};
use crate::terminal_manager::TerminalManager;

#[tauri::command]
pub async fn terminal_create_session(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    input: TerminalCreateInput,
) -> Result<TerminalCreateOutput, String> {
    to_result(state.create_session(app, input).await)
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalManager>,
    input: TerminalWriteInput,
) -> Result<(), String> {
    to_result(state.write(input).await)
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, TerminalManager>,
    input: TerminalResizeInput,
) -> Result<(), String> {
    to_result(state.resize(input).await)
}

#[tauri::command]
pub async fn terminal_close_session(
    state: State<'_, TerminalManager>,
    input: TerminalCloseInput,
) -> Result<(), String> {
    to_result(state.close(input).await)
}
