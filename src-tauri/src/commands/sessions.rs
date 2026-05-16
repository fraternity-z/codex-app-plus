use tauri::AppHandle;

use crate::domains::sessions::models::{
    CodexSessionReadInput, CodexSessionReadOutput, CodexSessionSearchResult, CodexSessionSummary,
    DeleteCodexSessionInput, ListCodexSessionsInput, SearchCodexSessionsInput,
};
use crate::domains::sessions::{
    delete_codex_session, list_codex_sessions, read_codex_session, search_codex_sessions,
};

use super::run_blocking;

#[tauri::command]
pub async fn app_list_codex_sessions(
    app: AppHandle,
    input: ListCodexSessionsInput,
) -> Result<Vec<CodexSessionSummary>, String> {
    run_blocking(move || list_codex_sessions(app, input.agent_environment)).await
}

#[tauri::command]
pub async fn app_read_codex_session(
    input: CodexSessionReadInput,
) -> Result<CodexSessionReadOutput, String> {
    run_blocking(move || read_codex_session(input)).await
}

#[tauri::command]
pub async fn app_search_codex_sessions(
    input: SearchCodexSessionsInput,
) -> Result<Vec<CodexSessionSearchResult>, String> {
    run_blocking(move || search_codex_sessions(input)).await
}

#[tauri::command]
pub async fn app_delete_codex_session(input: DeleteCodexSessionInput) -> Result<(), String> {
    run_blocking(move || delete_codex_session(input)).await
}
