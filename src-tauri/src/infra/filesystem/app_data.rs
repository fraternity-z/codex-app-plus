use std::path::PathBuf;

use crate::error::{AppError, AppResult};

const APP_DIRECTORY: &str = "CodexAppPlus";
const APP_DATA_OVERRIDE_ENV: &str = "CODEX_APP_PLUS_DATA_DIR";

pub(crate) fn app_data_dir() -> AppResult<PathBuf> {
    if let Some(path) = std::env::var_os(APP_DATA_OVERRIDE_ENV)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return Ok(path);
    }

    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY))
}
