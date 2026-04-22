use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::app_approval_rules::remember_command_approval_rule;
use crate::agents_config::{
    create_agent, delete_agent, get_agents_settings, read_agent_config, set_agents_core,
    update_agent, write_agent_config,
};
use crate::app_support::{
    clear_chatgpt_auth_state, import_official_data, open_codex_config_toml,
    read_chatgpt_auth_tokens, read_global_agent_instructions, reveal_path_in_folder,
    write_chatgpt_auth_tokens, write_global_agent_instructions,
};
use crate::custom_prompts::list_custom_prompts;
use crate::codex_auth::{
    activate_codex_chatgpt, capture_codex_oauth_snapshot,
    get_codex_auth_mode_state,
};
use crate::codex_data::{
    delete_codex_session, list_codex_sessions, read_codex_session, search_codex_sessions,
};
use crate::command_utils::open_detached_target;
use crate::error::{AppError, AppResult};
use crate::events::{EVENT_CONTEXT_MENU_REQUESTED, EVENT_NOTIFICATION_REQUESTED};
use crate::models::{
    ActivateCodexChatgptInput, AppServerStartInput,
    CaptureCodexOauthSnapshotInput, ChatgptAuthTokensOutput, CodexAuthModeStateOutput,
    CodexAuthSwitchResult,
    CodexSessionReadInput, CodexSessionReadOutput, CodexSessionSearchResult,
    CodexSessionSummary, CreateAgentInput, DeleteAgentInput,
    DeleteCodexSessionInput, GetAgentsSettingsInput, GetCodexAuthModeStateInput,
    GlobalAgentInstructionsOutput, ImportOfficialDataInput, ListCodexSessionsInput,
    SearchCodexSessionsInput,
    OpenCodexConfigTomlInput, OpenFileInEditorInput, OpenWorkspaceInput, ReadAgentConfigInput,
    ReadAgentConfigOutput, ReadGlobalAgentInstructionsInput, ReadProxySettingsInput,
    ReadProxySettingsOutput, RememberCommandApprovalRuleInput, RevealPathInFolderInput,
    RememberCommandApprovalRuleOutput, RpcCancelInput, RpcNotifyInput, RpcRequestInput,
    RpcRequestOutput, ServerRequestResolveInput, SetAgentsCoreInput, ShowContextMenuInput,
    ShowNotificationInput, UpdateAgentInput, UpdateChatgptAuthTokensInput,
    UpdateGlobalAgentInstructionsInput, UpdateProxySettingsInput,
    UpdateProxySettingsOutput, CustomPromptOutput, WorkspacePersistenceState,
    ListCustomPromptsInput, WriteAgentConfigInput, WriteAgentConfigOutput,
    WindowChromeAction,
};
use crate::process_manager::ProcessManager;
use crate::proxy_settings::{read_proxy_settings, write_proxy_settings};
use crate::window_theme::{apply_window_theme, WindowTheme};
use crate::workspace_launcher::{open_file_in_editor, open_workspace};
use crate::workspace_state::{read_workspace_state, write_workspace_state};

pub(crate) fn to_result<T>(result: AppResult<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

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

fn require_non_empty(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field_name} 不能为空"));
    }
    Ok(())
}

fn emit_app_event<T>(app: &AppHandle, event_name: &str, payload: T) -> Result<(), String>
where
    T: Clone + Serialize,
{
    app.emit(event_name, payload)
        .map_err(|error| error.to_string())
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
pub async fn app_get_agents_settings(
    input: GetAgentsSettingsInput,
) -> Result<crate::models::AgentsSettingsOutput, String> {
    run_blocking(move || get_agents_settings(input)).await
}

#[tauri::command]
pub async fn app_set_agents_core(
    input: SetAgentsCoreInput,
) -> Result<crate::models::AgentsSettingsOutput, String> {
    run_blocking(move || set_agents_core(input)).await
}

#[tauri::command]
pub async fn app_create_agent(
    input: CreateAgentInput,
) -> Result<crate::models::AgentsSettingsOutput, String> {
    run_blocking(move || create_agent(input)).await
}

#[tauri::command]
pub async fn app_update_agent(
    input: UpdateAgentInput,
) -> Result<crate::models::AgentsSettingsOutput, String> {
    run_blocking(move || update_agent(input)).await
}

#[tauri::command]
pub async fn app_delete_agent(
    input: DeleteAgentInput,
) -> Result<crate::models::AgentsSettingsOutput, String> {
    run_blocking(move || delete_agent(input)).await
}

#[tauri::command]
pub async fn app_read_agent_config(
    input: ReadAgentConfigInput,
) -> Result<ReadAgentConfigOutput, String> {
    run_blocking(move || read_agent_config(input)).await
}

#[tauri::command]
pub async fn app_write_agent_config(
    input: WriteAgentConfigInput,
) -> Result<WriteAgentConfigOutput, String> {
    run_blocking(move || write_agent_config(input)).await
}

#[tauri::command]
pub fn app_open_external(url: String) -> Result<(), String> {
    require_non_empty(&url, "url")?;
    to_result(open_detached_target(url))
}

#[tauri::command]
pub fn app_set_window_theme(window: tauri::WebviewWindow, theme: String) -> Result<(), String> {
    let parsed_theme = to_result(WindowTheme::parse(theme.trim()))?;
    to_result(apply_window_theme(&window, parsed_theme))
}

#[tauri::command]
pub fn app_start_window_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    to_result(window.start_dragging().map_err(AppError::from))
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
pub fn app_open_file_in_editor(input: OpenFileInEditorInput) -> Result<(), String> {
    to_result(open_file_in_editor(input))
}

#[tauri::command]
pub fn app_open_codex_config_toml(input: OpenCodexConfigTomlInput) -> Result<(), String> {
    to_result(open_codex_config_toml(input))
}

#[tauri::command]
pub fn app_reveal_path_in_folder(input: RevealPathInFolderInput) -> Result<(), String> {
    to_result(reveal_path_in_folder(input))
}

#[tauri::command]
pub async fn app_read_workspace_state() -> Result<Option<WorkspacePersistenceState>, String> {
    run_blocking(read_workspace_state).await
}

#[tauri::command]
pub async fn app_write_workspace_state(
    input: WorkspacePersistenceState,
) -> Result<(), String> {
    run_blocking(move || write_workspace_state(input)).await
}

#[tauri::command]
pub async fn app_read_global_agent_instructions(
    input: ReadGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    run_blocking(move || read_global_agent_instructions(input)).await
}

#[tauri::command]
pub async fn app_list_custom_prompts(
    input: ListCustomPromptsInput,
) -> Result<Vec<CustomPromptOutput>, String> {
    run_blocking(move || list_custom_prompts(input)).await
}

#[tauri::command]
pub async fn app_write_global_agent_instructions(
    input: UpdateGlobalAgentInstructionsInput,
) -> Result<GlobalAgentInstructionsOutput, String> {
    run_blocking(move || write_global_agent_instructions(input)).await
}

#[tauri::command]
pub async fn app_read_proxy_settings(
    input: ReadProxySettingsInput,
) -> Result<ReadProxySettingsOutput, String> {
    run_blocking(move || read_proxy_settings(input)).await
}

#[tauri::command]
pub async fn app_write_proxy_settings(
    input: UpdateProxySettingsInput,
) -> Result<UpdateProxySettingsOutput, String> {
    run_blocking(move || write_proxy_settings(input)).await
}

#[tauri::command]
pub async fn app_get_codex_auth_mode_state(
    input: GetCodexAuthModeStateInput,
) -> Result<CodexAuthModeStateOutput, String> {
    run_blocking(move || get_codex_auth_mode_state(input)).await
}

#[tauri::command]
pub async fn app_activate_codex_chatgpt(
    input: ActivateCodexChatgptInput,
) -> Result<CodexAuthSwitchResult, String> {
    run_blocking(move || activate_codex_chatgpt(input)).await
}

#[tauri::command]
pub async fn app_capture_codex_oauth_snapshot(
    input: CaptureCodexOauthSnapshotInput,
) -> Result<CodexAuthModeStateOutput, String> {
    run_blocking(move || capture_codex_oauth_snapshot(input)).await
}

#[tauri::command]
pub async fn app_read_chatgpt_auth_tokens() -> Result<ChatgptAuthTokensOutput, String> {
    run_blocking(move || read_chatgpt_auth_tokens()).await
}

#[tauri::command]
pub async fn app_write_chatgpt_auth_tokens(
    input: UpdateChatgptAuthTokensInput,
) -> Result<ChatgptAuthTokensOutput, String> {
    run_blocking(move || write_chatgpt_auth_tokens(input)).await
}

#[tauri::command]
pub async fn app_clear_chatgpt_auth_state() -> Result<(), String> {
    run_blocking(move || clear_chatgpt_auth_state()).await
}

#[tauri::command]
pub fn app_show_notification(app: AppHandle, input: ShowNotificationInput) -> Result<(), String> {
    require_non_empty(&input.title, "notification.title")?;
    emit_app_event(&app, EVENT_NOTIFICATION_REQUESTED, input)
}

#[tauri::command]
pub fn app_show_context_menu(app: AppHandle, input: ShowContextMenuInput) -> Result<(), String> {
    if input.items.is_empty() {
        return Err("context menu items 不能为空".to_string());
    }
    emit_app_event(&app, EVENT_CONTEXT_MENU_REQUESTED, input)
}

#[tauri::command]
pub async fn app_import_official_data(input: ImportOfficialDataInput) -> Result<(), String> {
    run_blocking(move || import_official_data(input)).await
}

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

#[tauri::command]
pub async fn app_remember_command_approval_rule(
    input: RememberCommandApprovalRuleInput,
) -> Result<RememberCommandApprovalRuleOutput, String> {
    run_blocking(move || remember_command_approval_rule(input)).await
}
