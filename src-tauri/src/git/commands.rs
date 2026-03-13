use tauri::State;

use crate::error::AppResult;

use super::models::{
    GitBranchRef, GitCheckoutInput, GitCommitInput, GitDiffInput, GitDiffOutput,
    GitDiscardInput, GitPathsInput, GitPushInput, GitRemoteInput, GitRepoInput, GitStatusSnapshotOutput,
    GitWorkspaceDiffOutput, GitWorkspaceDiffsInput,
};
use super::repository::resolve_workspace;
use super::runtime::GitRuntimeState;
use super::service;

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    let result = tokio::task::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?;
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn git_get_status_snapshot(
    state: State<'_, GitRuntimeState>,
    input: GitRepoInput,
) -> Result<GitStatusSnapshotOutput, String> {
    let runtime = state.inner().clone();
    let repo_path = input.repo_path;
    let cache = runtime.repository_cache();
    let resolved = run_blocking(move || resolve_workspace(&repo_path, &cache)).await?;
    let Some(repo_root) = resolved.repo_root else {
        return Ok(GitStatusSnapshotOutput::not_repository());
    };

    let repo_key = repo_root.to_string_lossy().to_string();
    runtime
        .run_status_snapshot(repo_key, async move {
            run_blocking(move || service::get_status_snapshot_for_repo_root(&repo_root)).await
        })
        .await
}

#[tauri::command]
pub async fn git_get_branch_refs(
    state: State<'_, GitRuntimeState>,
    input: GitRepoInput,
) -> Result<Vec<GitBranchRef>, String> {
    let cache = state.repository_cache();
    run_blocking(move || service::get_branch_refs(input, &cache)).await
}

#[tauri::command]
pub async fn git_get_remote_url(
    state: State<'_, GitRuntimeState>,
    input: GitRemoteInput,
) -> Result<Option<String>, String> {
    let cache = state.repository_cache();
    run_blocking(move || service::get_remote_url(input, &cache)).await
}

#[tauri::command]
pub async fn git_get_diff(
    state: State<'_, GitRuntimeState>,
    input: GitDiffInput,
) -> Result<GitDiffOutput, String> {
    let cache = state.repository_cache();
    run_blocking(move || service::get_diff(input, &cache)).await
}

#[tauri::command]
pub async fn git_get_workspace_diffs(
    state: State<'_, GitRuntimeState>,
    input: GitWorkspaceDiffsInput,
) -> Result<Vec<GitWorkspaceDiffOutput>, String> {
    let cache = state.repository_cache();
    run_blocking(move || service::get_workspace_diffs(input, &cache)).await
}

#[tauri::command]
pub async fn git_init_repository(
    state: State<'_, GitRuntimeState>,
    input: GitRepoInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::init_repository(input, &cache)).await
}

#[tauri::command]
pub async fn git_stage_paths(
    state: State<'_, GitRuntimeState>,
    input: GitPathsInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::stage_paths(input, &cache)).await
}

#[tauri::command]
pub async fn git_unstage_paths(
    state: State<'_, GitRuntimeState>,
    input: GitPathsInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::unstage_paths(input, &cache)).await
}

#[tauri::command]
pub async fn git_discard_paths(
    state: State<'_, GitRuntimeState>,
    input: GitDiscardInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::discard_paths(input, &cache)).await
}

#[tauri::command]
pub async fn git_commit(
    state: State<'_, GitRuntimeState>,
    input: GitCommitInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::commit(input, &cache)).await
}

#[tauri::command]
pub async fn git_fetch(
    state: State<'_, GitRuntimeState>,
    input: GitRepoInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::fetch(input, &cache)).await
}

#[tauri::command]
pub async fn git_pull(
    state: State<'_, GitRuntimeState>,
    input: GitRepoInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::pull(input, &cache)).await
}

#[tauri::command]
pub async fn git_push(
    state: State<'_, GitRuntimeState>,
    input: GitPushInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::push(input, &cache)).await
}

#[tauri::command]
pub async fn git_checkout(
    state: State<'_, GitRuntimeState>,
    input: GitCheckoutInput,
) -> Result<(), String> {
    let cache = state.repository_cache();
    run_blocking(move || service::checkout(input, &cache)).await
}
