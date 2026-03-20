use tauri::{AppHandle, Emitter, State};

use crate::app_support::{
    clear_chatgpt_auth_state, import_official_data, open_codex_config_toml, open_workspace,
    read_chatgpt_auth_tokens, read_global_agent_instructions, write_chatgpt_auth_tokens,
    write_global_agent_instructions,
};
use crate::codex_auth::{
    activate_codex_chatgpt, activate_codex_provider, capture_codex_oauth_snapshot,
    get_codex_auth_mode_state,
};
use crate::codex_data::{delete_codex_session, list_codex_sessions, read_codex_session};
use crate::codex_provider::{delete_codex_provider, list_codex_providers, upsert_codex_provider};
use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::models::{
    ActivateCodexChatgptInput, AppServerStartInput, ApplyCodexProviderInput,
    CaptureCodexOauthSnapshotInput, ChatgptAuthTokensOutput, CodexAuthModeStateOutput,
    CodexAuthSwitchResult, CodexProviderApplyResult, CodexProviderRecord, CodexProviderStore,
    CodexSessionReadInput, CodexSessionReadOutput, CodexSessionSummary,
    DeleteCodexProviderInput, DeleteCodexSessionInput, GetCodexAuthModeStateInput,
    GlobalAgentInstructionsOutput, ImportOfficialDataInput, ListCodexSessionsInput,
    OpenCodexConfigTomlInput, OpenWorkspaceInput, ReadGlobalAgentInstructionsInput,
    RpcCancelInput, RpcNotifyInput, RpcRequestInput, RpcRequestOutput,
    ServerRequestResolveInput, ShowContextMenuInput, ShowNotificationInput,
    TerminalCloseInput, TerminalCreateInput, TerminalCreateOutput, TerminalResizeInput,
    TerminalWriteInput, UpdateChatgptAuthTokensInput, UpdateGlobalAgentInstructionsInput,
    UpsertCodexProviderInput, WindowChromeAction,
};
use crate::process_manager::ProcessManager;
use crate::terminal_manager::TerminalManager;
use crate::window_theme::{apply_window_theme, WindowTheme};

fn to_result<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

fn toggle_window_maximize(window: &tauri::WebviewWindow) -> AppResult<()> {
    if window.is_maximized().map_err(AppError::from)? {
        return window.unmaximize().map_err(AppError::from);
    }

    window.maximize().map_err(AppError::from)
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
pub fn app_set_window_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let parsed_theme = to_result(WindowTheme::parse(theme.trim()))?;
    to_result(apply_window_theme(&window, parsed_theme))
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
pub fn app_open_codex_config_toml(input: OpenCodexConfigTomlInput) -> Result<(), String> {
    to_result(open_codex_config_toml(input))
}

#[tauri::command]
pub fn app_read_global_agent_instructions(
    input: ReadGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    to_result(read_global_agent_instructions(input))
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
    to_result(activate_codex_provider(input))
}

#[tauri::command]
pub fn app_get_codex_auth_mode_state(
    input: GetCodexAuthModeStateInput,
) -> Result<CodexAuthModeStateOutput, String> {
    to_result(get_codex_auth_mode_state(input))
}

#[tauri::command]
pub fn app_activate_codex_chatgpt(
    input: ActivateCodexChatgptInput,
) -> Result<CodexAuthSwitchResult, String> {
    to_result(activate_codex_chatgpt(input))
}

#[tauri::command]
pub fn app_capture_codex_oauth_snapshot(
    input: CaptureCodexOauthSnapshotInput,
) -> Result<CodexAuthModeStateOutput, String> {
    to_result(capture_codex_oauth_snapshot(input))
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
pub fn app_list_codex_sessions(
    app: AppHandle,
    input: ListCodexSessionsInput,
) -> Result<Vec<CodexSessionSummary>, String> {
    to_result(list_codex_sessions(app, input.agent_environment))
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
