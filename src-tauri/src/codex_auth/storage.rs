use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::CodexAuthMode;

use super::types::CodexOauthSnapshot;

const APP_DIRECTORY: &str = "CodexAppPlus";
const MODE_STATE_FILE_NAME: &str = "codex-auth-mode.json";
const OAUTH_SNAPSHOT_FILE_NAME: &str = "codex-oauth-snapshot.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PersistedModeState {
    pub(crate) active_mode: CodexAuthMode,
    pub(crate) updated_at: i64,
}

pub(crate) fn persist_mode_state(mode: CodexAuthMode) -> AppResult<()> {
    let state = PersistedModeState {
        active_mode: mode,
        updated_at: now_unix_ms()?,
    };
    write_json_file(mode_state_path()?, &state)
}

pub(crate) fn read_oauth_snapshot() -> AppResult<Option<CodexOauthSnapshot>> {
    read_oauth_snapshot_at(&app_data_root()?)
}

pub(crate) fn write_oauth_snapshot(snapshot: &CodexOauthSnapshot) -> AppResult<()> {
    write_oauth_snapshot_at(&app_data_root()?, snapshot)
}

pub(crate) fn read_oauth_snapshot_at(root: &Path) -> AppResult<Option<CodexOauthSnapshot>> {
    read_json_file(root.join(OAUTH_SNAPSHOT_FILE_NAME))
}

pub(crate) fn write_oauth_snapshot_at(root: &Path, snapshot: &CodexOauthSnapshot) -> AppResult<()> {
    write_json_file(root.join(OAUTH_SNAPSHOT_FILE_NAME), snapshot)
}

pub(crate) fn app_data_root() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY))
}

pub(crate) fn now_unix_ms() -> AppResult<i64> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(duration.as_millis() as i64)
}

fn mode_state_path() -> AppResult<PathBuf> {
    app_data_root().map(|root| root.join(MODE_STATE_FILE_NAME))
}

fn read_json_file<T>(path: PathBuf) -> AppResult<Option<T>>
where
    T: for<'de> Deserialize<'de>,
{
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path)?;
    let parsed = serde_json::from_str::<T>(&text)?;
    Ok(Some(parsed))
}

fn write_json_file<T>(path: PathBuf, value: &T) -> AppResult<()>
where
    T: Serialize,
{
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    fs::write(path, serde_json::to_vec_pretty(value)?)?;
    Ok(())
}
