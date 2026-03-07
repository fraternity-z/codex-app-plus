use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::codex_data::{list_codex_sessions, read_codex_session};
use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::models::{
    AppServerStartInput, CodexSessionReadInput, CodexSessionReadOutput, CodexSessionSummary,
    GlobalAgentInstructionsOutput, ImportOfficialDataInput, OpenWorkspaceInput, RpcCancelInput,
    RpcNotifyInput, RpcRequestInput, RpcRequestOutput, ServerRequestResolveInput,
    ShowContextMenuInput, ShowNotificationInput, TerminalCloseInput, TerminalCreateInput,
    TerminalCreateOutput, TerminalResizeInput, TerminalWriteInput,
    UpdateGlobalAgentInstructionsInput, WorkspaceOpener,
};
use crate::process_manager::ProcessManager;
use crate::terminal_manager::TerminalManager;

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

    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    let destination = local_data.join("CodexAppPlus").join("imported-official");
    copy_directory(&source, &destination)
}

fn global_agents_path() -> AppResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?;
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
