use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;

use serde_json::Value;

use crate::agent_environment::{
    resolve_agent_environment, resolve_codex_home_relative_path, resolve_host_path_for_agent_path,
};
use crate::codex_auth::clear_oauth_snapshot_auth_state_in_root;
use crate::command_utils::open_detached_target;
#[cfg(target_os = "macos")]
use crate::command_utils::spawn_hidden_background_command;
use crate::error::{AppError, AppResult};
use crate::global_agent_instructions::read_global_agent_instructions_at;
use crate::models::{
    ChatgptAuthTokensOutput, GlobalAgentInstructionsOutput, ImportOfficialDataInput,
    OpenCodexConfigTomlInput, ReadGlobalAgentInstructionsInput, RevealPathInFolderInput,
    UpdateChatgptAuthTokensInput, UpdateGlobalAgentInstructionsInput,
};

const CHATGPT_AUTH_DIR: &str = "auth";
const CHATGPT_AUTH_CACHE_FILE: &str = "chatgpt-auth.json";
const CHATGPT_AUTH_LOGOUT_MARKER: &str = "chatgpt-logged-out";

pub fn import_official_data(input: ImportOfficialDataInput) -> AppResult<()> {
    if input.source_path.trim().is_empty() {
        return Err(AppError::InvalidInput("sourcePath 不能为空".to_string()));
    }

    let source = PathBuf::from(input.source_path);
    if !source.exists() {
        return Err(AppError::InvalidInput("sourcePath 不存在".to_string()));
    }

    import_official_data_into_root(&source, &app_data_root()?)
}

pub fn read_chatgpt_auth_tokens() -> AppResult<ChatgptAuthTokensOutput> {
    read_chatgpt_auth_tokens_from_root(&app_data_root()?)
}

pub fn write_chatgpt_auth_tokens(
    input: UpdateChatgptAuthTokensInput,
) -> AppResult<ChatgptAuthTokensOutput> {
    write_chatgpt_auth_tokens_to_root(&app_data_root()?, input)
}

pub fn clear_chatgpt_auth_state() -> AppResult<()> {
    clear_chatgpt_auth_state_in_root(&app_data_root()?)
}

pub fn open_codex_config_toml(input: OpenCodexConfigTomlInput) -> AppResult<()> {
    let host_path = match input.file_path.as_deref() {
        Some(file_path) => resolve_host_path_for_agent_path(input.agent_environment, file_path)?,
        None => {
            resolve_codex_home_relative_path(input.agent_environment, ".codex/config.toml")?
                .host_path
        }
    };
    if !host_path.exists() {
        return Err(AppError::InvalidInput(format!(
            "config.toml 不存在: {}",
            host_path.display()
        )));
    }
    open_detached_target(host_path)
}

pub fn reveal_path_in_folder(input: RevealPathInFolderInput) -> AppResult<()> {
    let path_text = input.path.trim();
    if path_text.is_empty() {
        return Err(AppError::InvalidInput("path 不能为空".to_string()));
    }
    reveal_path_in_folder_at(PathBuf::from(path_text))
}

pub fn read_global_agent_instructions(
    input: ReadGlobalAgentInstructionsInput,
) -> AppResult<GlobalAgentInstructionsOutput> {
    let path = resolve_codex_home_relative_path(input.agent_environment, ".codex/AGENTS.md")?;
    read_global_agent_instructions_at(path.display_path, &path.host_path)
}

fn reveal_path_in_folder_at(path: PathBuf) -> AppResult<()> {
    if cfg!(target_os = "windows") {
        return reveal_path_in_folder_windows(path);
    }
    if cfg!(target_os = "macos") {
        return reveal_path_in_folder_macos(path);
    }
    reveal_path_in_folder_other(path)
}

#[cfg(target_os = "windows")]
fn reveal_path_in_folder_windows(path: PathBuf) -> AppResult<()> {
    let target = if path.exists() {
        path
    } else {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::InvalidInput("无法解析文件夹路径".to_string()))?
    };

    if target.is_file() {
        return shell_execute("explorer.exe", Some(&format!("/select,\"{}\"", target.display())));
    }
    shell_execute_path(&target)
}

#[cfg(not(target_os = "windows"))]
fn reveal_path_in_folder_windows(path: PathBuf) -> AppResult<()> {
    reveal_path_in_folder_other(path)
}

#[cfg(target_os = "windows")]
fn shell_execute_path(path: &Path) -> AppResult<()> {
    shell_execute(&path.to_string_lossy(), None)
}

#[cfg(target_os = "windows")]
fn shell_execute(file: &str, parameters: Option<&str>) -> AppResult<()> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
    }

    let operation = wide("open");
    let file = wide(file);
    let parameters = parameters.map(wide);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            parameters
                .as_ref()
                .map(|value| value.as_ptr())
                .unwrap_or(null()),
            null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        return Err(AppError::Io(format!("ShellExecuteW failed: {result:?}")));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn reveal_path_in_folder_macos(path: PathBuf) -> AppResult<()> {
    let mut command = Command::new("open");
    if path.exists() {
        command.arg("-R").arg(path);
        return spawn_hidden_background_command(&mut command);
    }
    reveal_path_in_folder_other(path)
}

#[cfg(not(target_os = "macos"))]
fn reveal_path_in_folder_macos(path: PathBuf) -> AppResult<()> {
    reveal_path_in_folder_other(path)
}

fn reveal_path_in_folder_other(path: PathBuf) -> AppResult<()> {
    let directory = if path.is_dir() {
        path
    } else {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::InvalidInput("无法解析文件夹路径".to_string()))?
    };
    open_detached_target(directory)
}

pub fn write_global_agent_instructions(
    input: UpdateGlobalAgentInstructionsInput,
) -> AppResult<GlobalAgentInstructionsOutput> {
    let agent_environment = resolve_agent_environment(input.agent_environment);
    let path = resolve_codex_home_relative_path(agent_environment, ".codex/AGENTS.md")?;
    if let Some(parent) = path.host_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path.host_path, &input.content)?;
    Ok(GlobalAgentInstructionsOutput {
        path: path.display_path,
        content: input.content,
    })
}

fn app_data_root() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join("CodexAppPlus"))
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
        return Err(AppError::InvalidInput("accessToken 不能为空".to_string()));
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
    clear_oauth_snapshot_auth_state_in_root(root)?;
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
mod tests;
