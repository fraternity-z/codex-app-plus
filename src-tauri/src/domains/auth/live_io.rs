use std::fs;
use std::path::Path;

use fs2::FileExt;

use crate::error::{AppError, AppResult};

pub(crate) fn write_live_files(
    auth_path: &Path,
    auth_bytes: &[u8],
    config_path: &Path,
    config_bytes: &[u8],
) -> AppResult<()> {
    let lock_path = auth_path.with_extension("lock");
    let parent = lock_path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    let lock_file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&lock_path)
        .map_err(|e| AppError::Io(format!("无法创建锁文件: {e}")))?;
    lock_file
        .lock_exclusive()
        .map_err(|e| AppError::Io(format!("无法获取文件锁: {e}")))?;

    let result = write_live_files_inner(auth_path, auth_bytes, config_path, config_bytes);

    let _ = lock_file.unlock();
    result
}

fn write_live_files_inner(
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

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("temp");
    let temp_path = parent.join(format!("{file_name}.tmp"));
    fs::write(&temp_path, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp_path, path)?;
    Ok(())
}

fn restore_previous_file(path: &Path, bytes: Option<&[u8]>) -> AppResult<()> {
    if let Some(previous) = bytes {
        return write_bytes_atomic(path, previous);
    }
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn read_optional_bytes(path: &Path) -> AppResult<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read(path)?))
}
