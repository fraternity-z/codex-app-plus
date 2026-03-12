use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};
use crate::models::CodexProviderRecord;

pub(super) struct ValidatedProvider {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) provider_key: String,
    pub(super) api_key: String,
    pub(super) base_url: String,
    pub(super) auth_json_text: String,
    pub(super) config_toml_text: String,
}

impl ValidatedProvider {
    pub(super) fn as_record(&self, created_at: i64, updated_at: i64) -> CodexProviderRecord {
        CodexProviderRecord {
            id: self.id.clone(),
            name: self.name.clone(),
            provider_key: self.provider_key.clone(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            auth_json_text: self.auth_json_text.clone(),
            config_toml_text: self.config_toml_text.clone(),
            created_at,
            updated_at,
        }
    }

    pub(super) fn into_record(self, created_at: i64, updated_at: i64) -> CodexProviderRecord {
        CodexProviderRecord {
            id: self.id,
            name: self.name,
            provider_key: self.provider_key,
            api_key: self.api_key,
            base_url: self.base_url,
            auth_json_text: self.auth_json_text,
            config_toml_text: self.config_toml_text,
            created_at,
            updated_at,
        }
    }
}

pub(super) fn write_live_files(
    auth_path: &Path,
    auth_bytes: &[u8],
    config_path: &Path,
    config_bytes: &[u8],
) -> AppResult<()> {
    let old_auth = read_optional_bytes(auth_path)?;
    write_bytes_atomic(auth_path, auth_bytes)?;
    if let Err(error) = write_bytes_atomic(config_path, config_bytes) {
        restore_previous_file(auth_path, old_auth.as_deref())?;
        return Err(error);
    }
    Ok(())
}

pub(super) fn require_text(value: String, field: &str) -> AppResult<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(format!("{field} 不能为空")));
    }
    Ok(trimmed)
}

pub(super) fn store_path(app_directory: &str, store_file_name: &str) -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(app_directory).join(store_file_name))
}

pub(super) fn generate_provider_id() -> AppResult<String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(format!(
        "provider-{}-{}",
        std::process::id(),
        duration.as_nanos()
    ))
}

pub(super) fn now_unix_ms() -> AppResult<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(duration.as_millis() as i64)
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    let temp_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("temp");
    let temp_path = parent.join(format!("{temp_name}.tmp"));
    fs::write(&temp_path, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(&temp_path, path)?;
    Ok(())
}

fn restore_previous_file(path: &Path, bytes: Option<&[u8]>) -> AppResult<()> {
    match bytes {
        Some(previous) => write_bytes_atomic(path, previous),
        None if path.exists() => fs::remove_file(path).map_err(Into::into),
        None => Ok(()),
    }
}

fn read_optional_bytes(path: &Path) -> AppResult<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read(path)?))
}
