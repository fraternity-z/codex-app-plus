use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;
use crate::wsl_support::{
    is_windows_path_like, linux_path_to_unc_path, resolve_default_wsl_context,
};

const APP_PLUS_CODEX_HOME_DIR: &str = ".codex-app-plus";

#[derive(Debug, Clone)]
pub struct AgentFsPath {
    pub display_path: String,
    pub host_path: PathBuf,
}

pub fn resolve_agent_environment(agent_environment: Option<AgentEnvironment>) -> AgentEnvironment {
    agent_environment.unwrap_or_default()
}

pub fn resolve_codex_home_relative_path(
    agent_environment: AgentEnvironment,
    relative_path: &str,
) -> AppResult<AgentFsPath> {
    let mapped_relative = map_to_app_plus_codex_home(relative_path);
    match agent_environment {
        AgentEnvironment::WindowsNative => resolve_windows_home_relative_path(&mapped_relative),
        AgentEnvironment::Wsl => resolve_wsl_home_relative_path(&mapped_relative),
    }
}

pub fn codex_home_dir_name() -> &'static str {
    APP_PLUS_CODEX_HOME_DIR
}

pub fn resolve_host_path_for_agent_path(
    agent_environment: AgentEnvironment,
    agent_path: &str,
) -> AppResult<PathBuf> {
    if agent_path.trim().is_empty() {
        return Err(AppError::InvalidInput("path 不能为空".to_string()));
    }

    match agent_environment {
        AgentEnvironment::WindowsNative => Ok(PathBuf::from(agent_path)),
        AgentEnvironment::Wsl => {
            if is_windows_path_like(agent_path) {
                return Ok(PathBuf::from(agent_path));
            }
            let context = resolve_default_wsl_context()?;
            linux_path_to_unc_path(&context.distro_name, agent_path)
        }
    }
}

fn resolve_windows_home_relative_path(relative_path: &str) -> AppResult<AgentFsPath> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?;
    let host_path = home.join(relative_path);
    Ok(AgentFsPath {
        display_path: host_path.display().to_string(),
        host_path,
    })
}

fn resolve_wsl_home_relative_path(relative_path: &str) -> AppResult<AgentFsPath> {
    let context = resolve_default_wsl_context()?;
    let display_path = join_linux_path(&context.home_path, relative_path);
    let host_path = linux_path_to_unc_path(&context.distro_name, &display_path)?;
    Ok(AgentFsPath {
        display_path,
        host_path,
    })
}

fn join_linux_path(base_path: &str, relative_path: &str) -> String {
    let trimmed_base = base_path.trim_end_matches('/');
    let trimmed_relative = relative_path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if trimmed_relative.is_empty() {
        trimmed_base.to_string()
    } else {
        format!("{trimmed_base}/{trimmed_relative}")
    }
}

fn map_to_app_plus_codex_home(relative_path: &str) -> String {
    let normalized = relative_path.trim().replace('\\', "/");
    let stripped = if normalized == ".codex" {
        ""
    } else if let Some(value) = normalized.strip_prefix(".codex/") {
        value
    } else {
        normalized.as_str()
    };
    if stripped.is_empty() {
        APP_PLUS_CODEX_HOME_DIR.to_string()
    } else {
        format!("{APP_PLUS_CODEX_HOME_DIR}/{stripped}")
    }
}

#[cfg(test)]
mod tests {
    use super::{join_linux_path, map_to_app_plus_codex_home};

    #[test]
    fn joins_linux_paths_without_duplicate_separators() {
        assert_eq!(
            join_linux_path("/home/me/", "/.codex/AGENTS.md"),
            "/home/me/.codex/AGENTS.md"
        );
    }

    #[test]
    fn remaps_legacy_codex_home_to_app_plus_home() {
        assert_eq!(
            map_to_app_plus_codex_home(".codex/config.toml"),
            ".codex-app-plus/config.toml"
        );
    }
}
