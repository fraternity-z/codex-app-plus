mod live;
mod live_io;
mod storage;
mod types;

#[cfg(test)]
mod tests;

use std::path::Path;

use crate::agent_environment::resolve_agent_environment;
use crate::error::AppResult;
use crate::models::{
    ActivateCodexChatgptInput, CaptureCodexOauthSnapshotInput,
    CodexAuthMode, CodexAuthModeStateOutput, CodexAuthSwitchResult, GetCodexAuthModeStateInput,
};

use live::{
    auth_contains_api_key, auth_contains_chatgpt_markers, build_oauth_snapshot_from_api_key_live,
    build_snapshot_from_live, clear_oauth_snapshot_auth, read_live_files, read_model_provider_key,
    write_snapshot_to_live, LiveFiles,
};
use storage::{
    persist_mode_state, read_oauth_snapshot, read_oauth_snapshot_at,
    write_oauth_snapshot, write_oauth_snapshot_at,
};
use types::CodexOauthSnapshot;

pub fn get_codex_auth_mode_state(
    input: GetCodexAuthModeStateInput,
) -> AppResult<CodexAuthModeStateOutput> {
    let live = read_live_files(resolve_agent_environment(input.agent_environment))?;
    let snapshot = read_oauth_snapshot()?;

    // 直接从 config.toml 读取 providerKey
    let active_provider_key = read_model_provider_key(&live.config_table);

    // 根据配置文件判断模式
    let active_mode = if active_provider_key.is_some() && auth_contains_api_key(&live.auth_map) {
        CodexAuthMode::Apikey
    } else if auth_contains_chatgpt_markers(&live.auth_map) {
        CodexAuthMode::Chatgpt
    } else {
        // 默认为 ChatGPT 模式
        CodexAuthMode::Chatgpt
    };

    Ok(CodexAuthModeStateOutput {
        active_mode,
        active_provider_key,
        oauth_snapshot_available: snapshot.is_some(),
    })
}

pub fn capture_codex_oauth_snapshot(
    input: CaptureCodexOauthSnapshotInput,
) -> AppResult<CodexAuthModeStateOutput> {
    let live = read_live_files(resolve_agent_environment(input.agent_environment))?;
    write_oauth_snapshot(&build_snapshot_from_live(&live))?;
    persist_mode_state(CodexAuthMode::Chatgpt)?;
    get_codex_auth_mode_state(GetCodexAuthModeStateInput {
        agent_environment: input.agent_environment,
    })
}

pub fn activate_codex_chatgpt(
    input: ActivateCodexChatgptInput,
) -> AppResult<CodexAuthSwitchResult> {
    let live = read_live_files(resolve_agent_environment(input.agent_environment))?;

    // 如果当前是 ChatGPT 模式，先捕获快照
    if auth_contains_chatgpt_markers(&live.auth_map) {
        write_oauth_snapshot(&build_snapshot_from_live(&live))?;
    }

    // 恢复或创建 OAuth 快照
    let snapshot = resolve_target_oauth_snapshot(&live)?;
    write_snapshot_to_live(&live, &snapshot)?;
    persist_mode_state(CodexAuthMode::Chatgpt)?;

    Ok(CodexAuthSwitchResult {
        mode: CodexAuthMode::Chatgpt,
        provider_id: None,
        provider_key: None,
        auth_path: live.auth_path.display_path,
        config_path: live.config_path.display_path,
        restored_from_snapshot: read_oauth_snapshot()?.is_some(),
    })
}

pub(crate) fn clear_oauth_snapshot_auth_state_in_root(root: &Path) -> AppResult<()> {
    let Some(snapshot) = read_oauth_snapshot_at(root)? else {
        return Ok(());
    };
    write_oauth_snapshot_at(root, &clear_oauth_snapshot_auth(&snapshot)?)
}

fn resolve_target_oauth_snapshot(live: &LiveFiles) -> AppResult<CodexOauthSnapshot> {
    if let Some(snapshot) = read_oauth_snapshot()? {
        return Ok(snapshot);
    }
    let snapshot = build_oauth_snapshot_from_api_key_live(live)?;
    write_oauth_snapshot(&snapshot)?;
    Ok(snapshot)
}
