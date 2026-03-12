use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::codex_data::{delete_codex_session, list_codex_sessions, read_codex_session};
use crate::codex_provider::{
    apply_codex_provider, delete_codex_provider, list_codex_providers, upsert_codex_provider,
};
use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::models::{
    AppServerStartInput, ApplyCodexProviderInput, ChatgptAuthTokensOutput,
    CodexProviderApplyResult, CodexProviderRecord, CodexProviderStore, CodexSessionReadInput,
    CodexSessionReadOutput, CodexSessionSummary, DeleteCodexProviderInput, DeleteCodexSessionInput,
    GlobalAgentInstructionsOutput, ImportOfficialDataInput, OpenWorkspaceInput, RpcCancelInput,
    RpcNotifyInput, RpcRequestInput, RpcRequestOutput, ServerRequestResolveInput,
    ShowContextMenuInput, ShowNotificationInput, TerminalCloseInput, TerminalCreateInput,
    TerminalCreateOutput, TerminalResizeInput, TerminalWriteInput, UpdateChatgptAuthTokensInput,
    UpdateGlobalAgentInstructionsInput, UpsertCodexProviderInput, WorkspaceOpener,
};
use crate::process_manager::ProcessManager;
use crate::terminal_manager::TerminalManager;

const CHATGPT_AUTH_DIR: &str = "auth";
const CHATGPT_AUTH_CACHE_FILE: &str = "chatgpt-auth.json";
const CHATGPT_AUTH_LOGOUT_MARKER: &str = "chatgpt-logged-out";

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
pub async fn app_server_stop(
    app: AppHandle,
    state: State<'_, ProcessManager>,
) -> Result<(), String> {
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
pub async fn rpc_notify(
    state: State<'_, ProcessManager>,
    input: RpcNotifyInput,
) -> Result<(), String> {
    to_result(state.rpc_notify(input).await)
}

#[tauri::command]
pub async fn rpc_cancel(
    state: State<'_, ProcessManager>,
    input: RpcCancelInput,
) -> Result<(), String> {
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
pub fn app_open_workspace(input: OpenWorkspaceInput) -> Result<(), String> {
    to_result(open_workspace(input))
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
pub fn app_read_global_agent_instructions() -> Result<GlobalAgentInstructionsOutput, String> {
    to_result(read_global_agent_instructions())
}

#[tauri::command]
pub fn app_write_global_agent_instructions(
    input: UpdateGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    to_result(write_global_agent_instructions(input))
}

#[tauri::command]
pub fn app_list_codex_providers() -> Result<CodexProviderStore, String> {
    to_result(list_codex_providers())
}

#[tauri::command]
pub fn app_upsert_codex_provider(
    input: UpsertCodexProviderInput,
) -> Result<CodexProviderRecord, String> {
    to_result(upsert_codex_provider(input))
}

#[tauri::command]
pub fn app_delete_codex_provider(
    input: DeleteCodexProviderInput,
) -> Result<CodexProviderStore, String> {
    to_result(delete_codex_provider(input))
}

#[tauri::command]
pub fn app_apply_codex_provider(
    input: ApplyCodexProviderInput,
) -> Result<CodexProviderApplyResult, String> {
    to_result(apply_codex_provider(input))
}

#[tauri::command]
pub fn app_read_chatgpt_auth_tokens() -> Result<ChatgptAuthTokensOutput, String> {
    to_result(read_chatgpt_auth_tokens())
}

#[tauri::command]
pub fn app_write_chatgpt_auth_tokens(
    input: UpdateChatgptAuthTokensInput,
) -> Result<ChatgptAuthTokensOutput, String> {
    to_result(write_chatgpt_auth_tokens(input))
}

#[tauri::command]
pub fn app_clear_chatgpt_auth_state() -> Result<(), String> {
    to_result(clear_chatgpt_auth_state())
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

#[tauri::command]
pub fn app_list_codex_sessions() -> Result<Vec<CodexSessionSummary>, String> {
    to_result(list_codex_sessions())
}

#[tauri::command]
pub fn app_read_codex_session(
    input: CodexSessionReadInput,
) -> Result<CodexSessionReadOutput, String> {
    to_result(read_codex_session(input))
}

#[tauri::command]
pub fn app_delete_codex_session(input: DeleteCodexSessionInput) -> Result<(), String> {
    to_result(delete_codex_session(input))
}

#[tauri::command]
pub fn terminal_create_session(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    input: TerminalCreateInput,
) -> Result<TerminalCreateOutput, String> {
    to_result(state.create_session(app, input))
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalManager>,
    input: TerminalWriteInput,
) -> Result<(), String> {
    to_result(state.write(input))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalManager>,
    input: TerminalResizeInput,
) -> Result<(), String> {
    to_result(state.resize(input))
}

#[tauri::command]
pub fn terminal_close_session(
    state: State<'_, TerminalManager>,
    input: TerminalCloseInput,
) -> Result<(), String> {
    to_result(state.close(input))
}

fn import_official_data(input: ImportOfficialDataInput) -> AppResult<()> {
    if input.source_path.trim().is_empty() {
        return Err(AppError::InvalidInput("sourcePath 不能为空".to_string()));
    }

    let source = PathBuf::from(input.source_path);
    if !source.exists() {
        return Err(AppError::InvalidInput("sourcePath 不存在".to_string()));
    }

    import_official_data_into_root(&source, &app_data_root()?)
}

fn app_data_root() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join("CodexAppPlus"))
}

fn read_chatgpt_auth_tokens() -> AppResult<ChatgptAuthTokensOutput> {
    let root = app_data_root()?;
    read_chatgpt_auth_tokens_from_root(&root)
}

fn write_chatgpt_auth_tokens(
    input: UpdateChatgptAuthTokensInput,
) -> AppResult<ChatgptAuthTokensOutput> {
    write_chatgpt_auth_tokens_to_root(&app_data_root()?, input)
}

fn clear_chatgpt_auth_state() -> AppResult<()> {
    clear_chatgpt_auth_state_in_root(&app_data_root()?)
}

fn imported_official_path_for_root(root: &Path) -> PathBuf {
    root.join("imported-official")
}

fn chatgpt_auth_dir_for_root(root: &Path) -> PathBuf {
    root.join(CHATGPT_AUTH_DIR)
}

fn chatgpt_auth_cache_path_for_root(root: &Path) -> PathBuf {
    chatgpt_auth_dir_for_root(root).join(CHATGPT_AUTH_CACHE_FILE)
}

fn chatgpt_auth_logout_marker_path_for_root(root: &Path) -> PathBuf {
    chatgpt_auth_dir_for_root(root).join(CHATGPT_AUTH_LOGOUT_MARKER)
}

fn import_official_data_into_root(source: &Path, root: &Path) -> AppResult<()> {
    let destination = imported_official_path_for_root(root);
    copy_directory(source, &destination)?;
    clear_chatgpt_logout_marker_in_root(root)
}

fn read_chatgpt_auth_tokens_from_root(root: &Path) -> AppResult<ChatgptAuthTokensOutput> {
    let cache_path = chatgpt_auth_cache_path_for_root(root);
    read_chatgpt_auth_tokens_from_cache_at(&cache_path).or_else(|_| {
        if is_chatgpt_auth_logged_out(root) {
            return Err(AppError::InvalidInput(
                "chatgpt auth tokens were cleared on logout".to_string(),
            ));
        }
        read_chatgpt_auth_tokens_from_imported_at(&imported_official_path_for_root(root))
    })
}

fn read_chatgpt_auth_tokens_from_cache_at(path: &Path) -> AppResult<ChatgptAuthTokensOutput> {
    let text = std::fs::read_to_string(path)?;
    let value: Value = serde_json::from_str(&text).map_err(|error| {
        AppError::InvalidInput(format!("failed to parse cached auth tokens: {error}"))
    })?;
    extract_tokens_from_value(&value, "cache")
        .ok_or_else(|| AppError::InvalidInput("cached auth tokens are incomplete".to_string()))
}

fn read_chatgpt_auth_tokens_from_imported_at(root: &Path) -> AppResult<ChatgptAuthTokensOutput> {
    if !root.exists() {
        return Err(AppError::InvalidInput(
            "imported official data does not exist".to_string(),
        ));
    }
    let mut files = Vec::new();
    collect_candidate_files(root, &mut files)?;
    for file in files {
        let Ok(text) = std::fs::read_to_string(&file) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if let Some(tokens) = extract_tokens_from_value(&value, "imported") {
            return Ok(tokens);
        }
    }
    Err(AppError::InvalidInput(
        "unable to find ChatGPT auth tokens in imported official data".to_string(),
    ))
}

fn write_chatgpt_auth_tokens_to_root(
    root: &Path,
    input: UpdateChatgptAuthTokensInput,
) -> AppResult<ChatgptAuthTokensOutput> {
    if input.access_token.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "accessToken 不能为空".to_string(),
        ));
    }
    if input.chatgpt_account_id.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "chatgptAccountId 不能为空".to_string(),
        ));
    }
    let path = chatgpt_auth_cache_path_for_root(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let output = ChatgptAuthTokensOutput {
        access_token: input.access_token,
        chatgpt_account_id: input.chatgpt_account_id,
        chatgpt_plan_type: input.chatgpt_plan_type,
        source: "cache".to_string(),
    };
    std::fs::write(&path, serde_json::to_vec_pretty(&output)?)?;
    clear_chatgpt_logout_marker_in_root(root)?;
    Ok(output)
}

fn clear_chatgpt_auth_state_in_root(root: &Path) -> AppResult<()> {
    let auth_dir = chatgpt_auth_dir_for_root(root);
    std::fs::create_dir_all(&auth_dir)?;
    remove_file_if_exists(&chatgpt_auth_cache_path_for_root(root))?;
    std::fs::write(
        chatgpt_auth_logout_marker_path_for_root(root),
        b"logged-out",
    )?;
    Ok(())
}

fn clear_chatgpt_logout_marker_in_root(root: &Path) -> AppResult<()> {
    remove_file_if_exists(&chatgpt_auth_logout_marker_path_for_root(root))
}

fn is_chatgpt_auth_logged_out(root: &Path) -> bool {
    chatgpt_auth_logout_marker_path_for_root(root).is_file()
}

fn remove_file_if_exists(path: &Path) -> AppResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn collect_candidate_files(root: &Path, files: &mut Vec<PathBuf>) -> AppResult<()> {
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_candidate_files(&path, files)?;
            continue;
        }
        if entry.file_type()?.is_file() {
            let metadata = entry.metadata()?;
            if metadata.len() <= 5 * 1024 * 1024 {
                files.push(path);
            }
        }
    }
    Ok(())
}

fn extract_tokens_from_value(value: &Value, source: &str) -> Option<ChatgptAuthTokensOutput> {
    let mut access_token = None;
    let mut account_id = None;
    let mut plan_type = None;
    find_tokens(value, &mut access_token, &mut account_id, &mut plan_type);
    match (access_token, account_id) {
        (Some(access_token), Some(chatgpt_account_id)) => Some(ChatgptAuthTokensOutput {
            access_token,
            chatgpt_account_id,
            chatgpt_plan_type: plan_type,
            source: source.to_string(),
        }),
        _ => None,
    }
}

fn find_tokens(
    value: &Value,
    access_token: &mut Option<String>,
    account_id: &mut Option<String>,
    plan_type: &mut Option<String>,
) {
    match value {
        Value::Object(map) => {
            for (key, item) in map {
                match key.as_str() {
                    "accessToken" if access_token.is_none() => {
                        *access_token = item.as_str().map(ToString::to_string)
                    }
                    "chatgptAccountId" if account_id.is_none() => {
                        *account_id = item.as_str().map(ToString::to_string)
                    }
                    "chatgptPlanType" if plan_type.is_none() => {
                        *plan_type = item.as_str().map(ToString::to_string)
                    }
                    _ => find_tokens(item, access_token, account_id, plan_type),
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                find_tokens(item, access_token, account_id, plan_type);
            }
        }
        _ => {}
    }
}

fn global_agents_path() -> AppResult<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?;
    Ok(home.join(".codex").join("AGENTS.md"))
}

fn read_global_agent_instructions() -> AppResult<GlobalAgentInstructionsOutput> {
    let path = global_agents_path()?;
    let content = std::fs::read_to_string(&path)?;
    Ok(GlobalAgentInstructionsOutput {
        path: path.display().to_string(),
        content,
    })
}

fn write_global_agent_instructions(
    input: UpdateGlobalAgentInstructionsInput,
) -> AppResult<GlobalAgentInstructionsOutput> {
    let path = global_agents_path()?;
    std::fs::write(&path, &input.content)?;
    Ok(GlobalAgentInstructionsOutput {
        path: path.display().to_string(),
        content: input.content,
    })
}

fn open_workspace(input: OpenWorkspaceInput) -> AppResult<()> {
    if input.path.trim().is_empty() {
        return Err(AppError::InvalidInput("path 不能为空".to_string()));
    }

    let path = PathBuf::from(&input.path);
    if !path.exists() {
        return Err(AppError::InvalidInput(format!(
            "path 不存在: {}",
            path.display()
        )));
    }

    match input.opener {
        WorkspaceOpener::Explorer | WorkspaceOpener::Vscode => {
            open::that_detached(path).map_err(|error| AppError::Io(error.to_string()))?
        }
        WorkspaceOpener::Terminal => {
            std::process::Command::new("cmd.exe")
                .args(["/K", "cd", "/d", &input.path])
                .spawn()
                .map_err(|error| AppError::Io(error.to_string()))?;
        }
        WorkspaceOpener::VisualStudio => {
            std::process::Command::new("devenv.exe")
                .arg(&input.path)
                .spawn()
                .map_err(|error| AppError::Io(error.to_string()))?;
        }
        WorkspaceOpener::GithubDesktop => {
            let uri = format!(
                "github-desktop://openRepo/{}",
                input.path.replace('\\', "/")
            );
            open::that_detached(uri).map_err(|error| AppError::Io(error.to_string()))?;
        }
        WorkspaceOpener::GitBash => {
            std::process::Command::new("C:\\Program Files\\Git\\git-bash.exe")
                .arg(format!("--cd={}", input.path))
                .spawn()
                .map_err(|error| AppError::Io(error.to_string()))?;
        }
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("codex-app-plus-{name}-{timestamp}"))
    }

    fn sample_tokens() -> UpdateChatgptAuthTokensInput {
        UpdateChatgptAuthTokensInput {
            access_token: "token-123".to_string(),
            chatgpt_account_id: "account-123".to_string(),
            chatgpt_plan_type: Some("plus".to_string()),
        }
    }

    fn write_imported_tokens(root: &Path) {
        let imported = imported_official_path_for_root(root);
        fs::create_dir_all(&imported).unwrap();
        fs::write(
            imported.join("tokens.json"),
            r#"{"accessToken":"imported-token","chatgptAccountId":"imported-account","chatgptPlanType":"plus"}"#,
        )
        .unwrap();
    }

    #[test]
    fn clear_chatgpt_auth_state_removes_cache_and_sets_marker() {
        let root = unique_dir("clear-auth-state");
        let cache_path = chatgpt_auth_cache_path_for_root(&root);
        fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
        fs::write(&cache_path, b"{}").unwrap();

        clear_chatgpt_auth_state_in_root(&root).unwrap();

        assert!(!cache_path.exists());
        assert!(chatgpt_auth_logout_marker_path_for_root(&root).exists());
    }

    #[test]
    fn logged_out_marker_blocks_imported_token_fallback() {
        let root = unique_dir("logout-marker");
        write_imported_tokens(&root);
        clear_chatgpt_auth_state_in_root(&root).unwrap();

        let result = read_chatgpt_auth_tokens_from_root(&root);

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap()
            .to_string()
            .contains("cleared on logout"));
    }

    #[test]
    fn write_chatgpt_auth_tokens_clears_logout_marker() {
        let root = unique_dir("write-auth-state");
        clear_chatgpt_auth_state_in_root(&root).unwrap();

        let output = write_chatgpt_auth_tokens_to_root(&root, sample_tokens()).unwrap();

        assert_eq!(output.source, "cache");
        assert!(!chatgpt_auth_logout_marker_path_for_root(&root).exists());
        assert!(chatgpt_auth_cache_path_for_root(&root).exists());
    }

    #[test]
    fn import_official_data_clears_logout_marker() {
        let root = unique_dir("import-auth-state");
        let source = unique_dir("import-source");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("tokens.json"),
            r#"{"accessToken":"source-token","chatgptAccountId":"source-account"}"#,
        )
        .unwrap();
        clear_chatgpt_auth_state_in_root(&root).unwrap();

        import_official_data_into_root(&source, &root).unwrap();
        let output = read_chatgpt_auth_tokens_from_root(&root).unwrap();

        assert_eq!(output.source, "imported");
        assert_eq!(output.access_token, "source-token");
        assert!(!chatgpt_auth_logout_marker_path_for_root(&root).exists());
    }
}
