use std::env;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::domains::settings::proxy::load_proxy_settings;
use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::{resolve_host_codex_home, CODEX_HOME_ENV};
use crate::infra::process::bundled_codex_cli::{
    allow_system_codex_fallback, resolve_windows_cli as resolve_bundled_windows_cli,
    windows_environment,
};
use crate::infra::process::proxy_environment::proxy_environment_assignments;
use crate::models::AppServerStartInput;

use super::CodexCli;

const WINDOWS_CANDIDATES: [&str; 4] = ["codex.cmd", "codex.exe", "codex.ps1", "codex"];

struct ResolvedWindowsCliPath {
    path: PathBuf,
    environment: Vec<(String, Option<String>)>,
}

pub(super) fn resolve_windows_cli(
    app: Option<&AppHandle>,
    input: &AppServerStartInput,
) -> AppResult<CodexCli> {
    let resolved = resolve_windows_codex_path(app, input)?;
    build_windows_cli(resolved)
}

fn resolve_windows_codex_path(
    app: Option<&AppHandle>,
    input: &AppServerStartInput,
) -> AppResult<ResolvedWindowsCliPath> {
    if let Some(path) = resolve_windows_custom_path(input)? {
        return Ok(ResolvedWindowsCliPath {
            path,
            environment: Vec::new(),
        });
    }

    let allow_system_fallback = allow_system_codex_fallback();
    let mut bundled_error = None;
    match resolve_bundled_windows_cli(app) {
        Ok(Some(bundled)) => {
            let environment = windows_environment(&bundled);
            return Ok(ResolvedWindowsCliPath {
                path: bundled.path,
                environment,
            });
        }
        Ok(None) => {}
        Err(error) if allow_system_fallback => {
            bundled_error = Some(error);
        }
        Err(error) => return Err(error),
    }

    if allow_system_fallback {
        if let Some(path) = search_path_candidates() {
            return Ok(ResolvedWindowsCliPath {
                path,
                environment: Vec::new(),
            });
        }
    }

    if let Some(error) = bundled_error {
        return Err(error);
    }

    Err(AppError::InvalidInput(
        "未找到软件内置的 Codex CLI。请先运行 `pnpm sync:codex-cli -- --source E:/code/codex` 或 `pnpm sync:codex-cli -- --npm @openai/codex@latest` 生成内置官方 npm CLI。"
            .to_string(),
    ))
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

fn build_windows_cli(resolved: ResolvedWindowsCliPath) -> AppResult<CodexCli> {
    let display_path = resolved.path.to_string_lossy().to_string();
    let extension = file_extension(&resolved.path);
    let path_text = display_path.clone();
    let proxy_settings = load_proxy_settings(crate::models::AgentEnvironment::WindowsNative)?;
    let codex_home = resolve_host_codex_home()?.to_string_lossy().to_string();
    let mut environment = proxy_environment_assignments(&proxy_settings)
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect::<Vec<_>>();
    environment.extend(resolved.environment);
    environment.push((CODEX_HOME_ENV.to_string(), Some(codex_home)));

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

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}
