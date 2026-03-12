use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;
use crate::windows_child_process::configure_background_std_command;

const WSL_COMMAND: &str = "wsl.exe";
const SYSTEM32_DIR: &str = "System32";
const WSL_ROOT_ENV_VARS: [&str; 2] = ["SystemRoot", "WINDIR"];
const WSL_INFO_SCRIPT: &str = "printf '%s\n%s' \"$WSL_DISTRO_NAME\" \"$HOME\"";

pub struct AgentFsPath {
    pub display_path: String,
    pub host_path: PathBuf,
}

struct WslContext {
    distro_name: String,
    home_path: String,
}

pub fn resolve_agent_environment(agent_environment: Option<AgentEnvironment>) -> AgentEnvironment {
    agent_environment.unwrap_or_default()
}

pub fn resolve_codex_home_relative_path(
    agent_environment: AgentEnvironment,
    relative_path: &str,
) -> AppResult<AgentFsPath> {
    match agent_environment {
        AgentEnvironment::WindowsNative => resolve_windows_home_relative_path(relative_path),
        AgentEnvironment::Wsl => resolve_wsl_home_relative_path(relative_path),
    }
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
            if looks_like_windows_path(agent_path) {
                return Ok(PathBuf::from(agent_path));
            }
            let context = resolve_wsl_context()?;
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
    let context = resolve_wsl_context()?;
    let display_path = join_linux_path(&context.home_path, relative_path);
    let host_path = linux_path_to_unc_path(&context.distro_name, &display_path)?;
    Ok(AgentFsPath {
        display_path,
        host_path,
    })
}

fn resolve_wsl_context() -> AppResult<WslContext> {
    let command_path = resolve_wsl_command_path();
    let mut command = Command::new(&command_path);
    configure_background_std_command(&mut command);
    let output = command
        .args(["sh", "-lc", WSL_INFO_SCRIPT])
        .output()
        .map_err(|error| {
            AppError::Io(format!(
                "无法启动 WSL 命令 {}: {error}",
                command_path.display()
            ))
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if stderr.is_empty() {
            format!("WSL 命令退出状态异常: {}", output.status)
        } else {
            stderr
        };
        return Err(AppError::Protocol(format!("查询 WSL 上下文失败: {detail}")));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| AppError::Protocol(format!("解析 WSL 上下文输出失败: {error}")))?;
    let mut lines = stdout.lines();
    let distro_name = lines.next().unwrap_or_default().trim().to_string();
    let home_path = lines.next().unwrap_or_default().trim().to_string();
    if distro_name.is_empty() || home_path.is_empty() {
        return Err(AppError::Protocol(
            "WSL 已启动，但无法解析默认发行版或 HOME 路径".to_string(),
        ));
    }

    Ok(WslContext {
        distro_name,
        home_path,
    })
}

fn resolve_wsl_command_path() -> PathBuf {
    let get_var = |name: &'static str| std::env::var_os(name);
    let path_exists = |path: &Path| path.exists();
    resolve_wsl_command_path_with(get_var, path_exists)
}

fn resolve_wsl_command_path_with<GetVar, PathExists>(
    mut get_var: GetVar,
    mut path_exists: PathExists,
) -> PathBuf
where
    GetVar: FnMut(&'static str) -> Option<OsString>,
    PathExists: FnMut(&Path) -> bool,
{
    WSL_ROOT_ENV_VARS
        .iter()
        .filter_map(|name| wsl_command_candidate(&mut get_var, name))
        .find(|path| path_exists(path))
        .unwrap_or_else(|| PathBuf::from(WSL_COMMAND))
}

fn wsl_command_candidate<GetVar>(get_var: &mut GetVar, var_name: &'static str) -> Option<PathBuf>
where
    GetVar: FnMut(&'static str) -> Option<OsString>,
{
    let root = get_var(var_name)?;
    if root.is_empty() {
        return None;
    }
    Some(PathBuf::from(root).join(SYSTEM32_DIR).join(WSL_COMMAND))
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

fn linux_path_to_unc_path(distro_name: &str, linux_path: &str) -> AppResult<PathBuf> {
    if !linux_path.starts_with('/') {
        return Err(AppError::InvalidInput(format!(
            "expected an absolute WSL path, got: {linux_path}"
        )));
    }
    let trimmed_path = linux_path.trim_start_matches('/').replace('/', "\\");
    let unc_path = if trimmed_path.is_empty() {
        format!(r"\\wsl.localhost\{}\", distro_name)
    } else {
        format!(r"\\wsl.localhost\{}\{}", distro_name, trimmed_path)
    };
    Ok(PathBuf::from(unc_path))
}

fn looks_like_windows_path(path: &str) -> bool {
    let trimmed_path = path.trim();
    trimmed_path.starts_with(r"\\")
        || Path::new(trimmed_path)
            .components()
            .next()
            .map(|component| matches!(component, std::path::Component::Prefix(_)))
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{linux_path_to_unc_path, resolve_wsl_command_path_with};
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};

    fn resolve_wsl_command_for_test(env_pairs: &[(&str, &str)], existing: &[PathBuf]) -> PathBuf {
        let get_var = |name: &'static str| {
            env_pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(value))
        };
        let path_exists = |path: &Path| existing.iter().any(|candidate| candidate == path);
        resolve_wsl_command_path_with(get_var, path_exists)
    }

    #[test]
    fn prefers_systemroot_system32_wsl_when_available() {
        let expected = PathBuf::from(r"C:\Windows")
            .join("System32")
            .join("wsl.exe");

        let resolved =
            resolve_wsl_command_for_test(&[("SystemRoot", r"C:\Windows")], &[expected.clone()]);

        assert_eq!(resolved, expected);
    }

    #[test]
    fn falls_back_to_wsl_command_when_env_candidates_are_missing() {
        let resolved = resolve_wsl_command_for_test(&[], &[]);

        assert_eq!(resolved, PathBuf::from("wsl.exe"));
    }

    #[test]
    fn preserves_linux_path_to_unc_translation() {
        let resolved = linux_path_to_unc_path("Ubuntu", "/home/me/.codex/AGENTS.md")
            .expect("linux path should convert to UNC");

        assert_eq!(
            resolved,
            PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\.codex\AGENTS.md")
        );
    }
}
