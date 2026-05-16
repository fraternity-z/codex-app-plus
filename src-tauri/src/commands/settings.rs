use crate::domains::app::service::{
    clear_chatgpt_auth_state, import_official_data, read_chatgpt_auth_tokens,
    write_chatgpt_auth_tokens,
};
use crate::domains::auth::models::{
    ActivateCodexChatgptInput, CaptureCodexOauthSnapshotInput, ChatgptAuthTokensOutput,
    CodexAuthModeStateOutput, CodexAuthSwitchResult, GetCodexAuthModeStateInput,
    UpdateChatgptAuthTokensInput,
};
use crate::domains::auth::{
    activate_codex_chatgpt, capture_codex_oauth_snapshot, get_codex_auth_mode_state,
};
use crate::domains::settings::mcp_shared_pool::{
    read_mcp_shared_pool_settings, write_mcp_shared_pool_settings,
};
use crate::domains::settings::proxy::{read_proxy_settings, write_proxy_settings};
use crate::domains::workspace::approval_rules::remember_command_approval_rule;
use crate::domains::workspace::models::{
    RememberCommandApprovalRuleInput, RememberCommandApprovalRuleOutput,
};
use crate::models::{
    ImportOfficialDataInput, ReadMcpSharedPoolSettingsInput, ReadMcpSharedPoolSettingsOutput,
    ReadProxySettingsInput, ReadProxySettingsOutput, UpdateMcpSharedPoolSettingsInput,
    UpdateMcpSharedPoolSettingsOutput, UpdateProxySettingsInput, UpdateProxySettingsOutput,
};

use super::run_blocking;

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
pub async fn app_mcp_shared_pool_settings_read(
    input: ReadMcpSharedPoolSettingsInput,
) -> Result<ReadMcpSharedPoolSettingsOutput, String> {
    run_blocking(move || read_mcp_shared_pool_settings(input)).await
}

#[tauri::command]
pub async fn app_mcp_shared_pool_settings_write(
    input: UpdateMcpSharedPoolSettingsInput,
) -> Result<UpdateMcpSharedPoolSettingsOutput, String> {
    run_blocking(move || write_mcp_shared_pool_settings(input)).await
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
    run_blocking(read_chatgpt_auth_tokens).await
}

#[tauri::command]
pub async fn app_write_chatgpt_auth_tokens(
    input: UpdateChatgptAuthTokensInput,
) -> Result<ChatgptAuthTokensOutput, String> {
    run_blocking(move || write_chatgpt_auth_tokens(input)).await
}

#[tauri::command]
pub async fn app_clear_chatgpt_auth_state() -> Result<(), String> {
    run_blocking(clear_chatgpt_auth_state).await
}

#[tauri::command]
pub async fn app_import_official_data(input: ImportOfficialDataInput) -> Result<(), String> {
    run_blocking(move || import_official_data(input)).await
}

#[tauri::command]
pub async fn app_remember_command_approval_rule(
    input: RememberCommandApprovalRuleInput,
) -> Result<RememberCommandApprovalRuleOutput, String> {
    run_blocking(move || remember_command_approval_rule(input)).await
}
