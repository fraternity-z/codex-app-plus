use std::env;
use std::path::{Path, PathBuf};

use crate::agent_environment::codex_home_dir_name;
use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;
use crate::proxy_environment::proxy_environment_assignments;
use crate::proxy_settings::load_proxy_settings;

use super::CodexCli;

const WINDOWS_CANDIDATES: [&str; 4] = ["codex.cmd", "codex.exe", "codex.ps1", "codex"];

pub(super) fn resolve_windows_cli(input: &AppServerStartInput) -> AppResult<CodexCli> {
    let path = resolve_windows_codex_path(input)?;
    build_windows_cli(path)
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

fn build_windows_cli(path: PathBuf) -> AppResult<CodexCli> {
    let display_path = path.to_string_lossy().to_string();
    let extension = file_extension(&path);
    let path_text = display_path.clone();
    let proxy_settings = load_proxy_settings(crate::models::AgentEnvironment::WindowsNative)?;
    let mut environment = proxy_environment_assignments(&proxy_settings)
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect::<Vec<_>>();
    environment.push(("CODEX_HOME".to_string(), windows_codex_home_path()?));

    if extension == "cmd" || extension == "bat" {
        return Ok(CodexCli {
            program: "cmd.exe".to_string(),
            prefix_args: vec!["/C".to_string(), path_text],
            display_path,
            environment,
        });
    }

    if extension == "ps1" {
        return Ok(CodexCli {
            program: "powershell.exe".to_string(),
            prefix_args: vec!["-File".to_string(), path_text],
            display_path,
            environment,
        });
    }

    Ok(CodexCli {
        program: path_text,
        prefix_args: Vec::new(),
        display_path,
        environment,
    })
}

fn windows_codex_home_path() -> AppResult<String> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?;
    Ok(home.join(codex_home_dir_name()).display().to_string())
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}
