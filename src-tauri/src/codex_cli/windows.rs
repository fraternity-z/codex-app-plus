use std::env;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;

use super::CodexCli;

const WINDOWS_CANDIDATES: [&str; 4] = ["codex.cmd", "codex.exe", "codex.ps1", "codex"];

pub(super) fn resolve_windows_cli(input: &AppServerStartInput) -> AppResult<CodexCli> {
    let path = resolve_windows_codex_path(input)?;
    Ok(build_windows_cli(path))
}

fn resolve_windows_codex_path(input: &AppServerStartInput) -> AppResult<PathBuf> {
    if let Some(path) = resolve_windows_custom_path(input)? {
        return Ok(path);
    }

    search_path_candidates().ok_or_else(|| {
        AppError::InvalidInput(
            "未检测到已安装的 Codex，请先确认 `codex` 已加入 Windows PATH。".to_string(),
        )
    })
}

fn resolve_windows_custom_path(input: &AppServerStartInput) -> AppResult<Option<PathBuf>> {
    let Some(path) = input.codex_path.as_ref() else {
        return Ok(None);
    };

    let candidate = PathBuf::from(path);
    if candidate.is_file() {
        return Ok(Some(candidate));
    }
    Err(AppError::InvalidInput(format!(
        "codexPath 不存在或不是文件: {}",
        candidate.display()
    )))
}

fn search_path_candidates() -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for directory in env::split_paths(&path_var) {
        for candidate in WINDOWS_CANDIDATES {
            let path = directory.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn build_windows_cli(path: PathBuf) -> CodexCli {
    let display_path = path.to_string_lossy().to_string();
    let extension = file_extension(&path);
    let path_text = display_path.clone();

    if extension == "cmd" || extension == "bat" {
        return CodexCli {
            program: "cmd.exe".to_string(),
            prefix_args: vec!["/C".to_string(), path_text],
            display_path,
            is_wsl: false,
        };
    }

    if extension == "ps1" {
        return CodexCli {
            program: "powershell.exe".to_string(),
            prefix_args: vec!["-File".to_string(), path_text],
            display_path,
            is_wsl: false,
        };
    }

    CodexCli {
        program: path_text,
        prefix_args: Vec::new(),
        display_path,
        is_wsl: false,
    }
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}
