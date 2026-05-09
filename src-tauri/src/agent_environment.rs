use std::path::{Path, PathBuf};
use std::process::Command;

use crate::command_utils::command_failure_detail;
use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;
use crate::windows_child_process::configure_background_std_command;
use crate::wsl_support::{
    is_windows_path_like, linux_path_to_unc_path, resolve_default_wsl_context,
    resolve_wsl_command_path, WslContext,
};

pub(crate) const CODEX_HOME_ENV: &str = "CODEX_HOME";
const CODEX_HOME_DIR: &str = ".codex";

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
    match agent_environment {
        AgentEnvironment::WindowsNative => resolve_windows_home_relative_path(relative_path),
        AgentEnvironment::Wsl => resolve_windows_home_relative_path(relative_path),
    }
}

pub(crate) fn resolve_host_codex_home() -> AppResult<PathBuf> {
    Ok(resolve_windows_home()?.join(CODEX_HOME_DIR))
}

pub(crate) fn resolve_wsl_codex_home(context: &WslContext) -> AppResult<String> {
    windows_path_to_wsl_path(context, &resolve_host_codex_home()?)
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
    let home = resolve_windows_home()?;
    let host_path = home.join(relative_path);
    Ok(AgentFsPath {
        display_path: host_path.display().to_string(),
        host_path,
    })
}

fn resolve_windows_home() -> AppResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))
}

fn windows_path_to_wsl_path(context: &WslContext, path: &Path) -> AppResult<String> {
    match windows_path_to_wsl_path_with_wslpath(&resolve_wsl_command_path(), context, path) {
        Ok(converted) => Ok(converted),
        Err(wslpath_error) => windows_path_to_wsl_mount_path(path).map_err(|fallback_error| {
            AppError::InvalidInput(format!(
                "无法通过 WSL wslpath 转换 Windows CODEX_HOME 路径，且 /mnt 盘符回退也不可用: {wslpath_error}; {fallback_error}"
            ))
        }),
    }
}

fn windows_path_to_wsl_path_with_wslpath(
    wsl_command_path: &Path,
    context: &WslContext,
    path: &Path,
) -> AppResult<String> {
    let windows_path = path.to_string_lossy().to_string();
    let mut command = Command::new(wsl_command_path);
    configure_background_std_command(&mut command);
    let output = command
        .args([
            "--distribution",
            context.distro_name.as_str(),
            "--exec",
            "wslpath",
            "-u",
            windows_path.as_str(),
        ])
        .output()
        .map_err(|error| {
            AppError::Io(format!(
                "无法启动 WSL wslpath 转换 CODEX_HOME 路径 {}: {error}",
                windows_path
            ))
        })?;

    parse_wslpath_output(&windows_path, &output.stdout, &output.stderr, output.status)
}

fn parse_wslpath_output(
    windows_path: &str,
    stdout: &[u8],
    stderr: &[u8],
    status: std::process::ExitStatus,
) -> AppResult<String> {
    let converted = String::from_utf8_lossy(stdout).trim().to_string();
    if status.success() && converted.starts_with('/') {
        return Ok(converted);
    }

    Err(AppError::Protocol(format!(
        "WSL wslpath 无法转换 Windows CODEX_HOME 路径 {}: {}",
        windows_path,
        command_failure_detail(stderr, stdout, status.to_string())
    )))
}

fn windows_path_to_wsl_mount_path(path: &Path) -> AppResult<String> {
    let path_text = path.to_string_lossy().replace('\\', "/");
    let trimmed_path = path_text.trim();
    let mut chars = trimmed_path.chars();
    let Some(drive) = chars.next() else {
        return Err(invalid_windows_host_path(trimmed_path));
    };
    if !drive.is_ascii_alphabetic() || chars.next() != Some(':') {
        return Err(invalid_windows_host_path(trimmed_path));
    }

    let drive = drive.to_ascii_lowercase();
    let relative = chars.as_str().trim_start_matches('/');
    if relative.is_empty() {
        Ok(format!("/mnt/{drive}"))
    } else {
        Ok(format!("/mnt/{drive}/{relative}"))
    }
}

fn invalid_windows_host_path(path: &str) -> AppError {
    AppError::InvalidInput(format!(
        "无法将 Windows CODEX_HOME 路径转换为 WSL 路径: {path}"
    ))
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::ExitStatus;

    use crate::models::AgentEnvironment;

    use super::{
        parse_wslpath_output, resolve_codex_home_relative_path, windows_path_to_wsl_mount_path,
    };

    #[cfg(windows)]
    use std::os::windows::process::ExitStatusExt;

    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;

    fn success_status() -> ExitStatus {
        #[cfg(windows)]
        {
            ExitStatus::from_raw(0)
        }
        #[cfg(unix)]
        {
            ExitStatus::from_raw(0)
        }
    }

    fn failure_status() -> ExitStatus {
        #[cfg(windows)]
        {
            ExitStatus::from_raw(1)
        }
        #[cfg(unix)]
        {
            ExitStatus::from_raw(1 << 8)
        }
    }

    #[test]
    fn resolves_wsl_codex_paths_from_host_home() {
        let path = resolve_codex_home_relative_path(AgentEnvironment::Wsl, ".codex/config.toml")
            .expect("path");

        assert!(
            path.display_path.ends_with(".codex/config.toml")
                || path.display_path.ends_with(r".codex\config.toml")
        );
    }

    #[test]
    fn converts_windows_drive_path_to_wsl_mount_path() {
        assert_eq!(
            windows_path_to_wsl_mount_path(Path::new(r"C:\Users\me\.codex\config.toml"))
                .expect("wsl path"),
            "/mnt/c/Users/me/.codex/config.toml"
        );
    }

    #[test]
    fn rejects_unc_codex_home_for_wsl_mount_conversion() {
        let error = windows_path_to_wsl_mount_path(Path::new(r"\\server\share\.codex"))
            .expect_err("UNC path cannot be converted to /mnt drive path");

        assert!(error
            .to_string()
            .contains("无法将 Windows CODEX_HOME 路径转换为 WSL 路径"));
    }

    #[test]
    fn accepts_wslpath_output_for_custom_mount_roots() {
        let converted = parse_wslpath_output(
            r"C:\Users\me\.codex",
            b"/windows/c/Users/me/.codex\n",
            b"",
            success_status(),
        )
        .expect("wslpath conversion");

        assert_eq!(converted, "/windows/c/Users/me/.codex");
    }

    #[test]
    fn rejects_empty_wslpath_output() {
        let error = parse_wslpath_output(
            r"C:\Users\me\.codex",
            b"",
            b"wslpath failed",
            failure_status(),
        )
        .expect_err("empty wslpath output should fail");

        assert!(error.to_string().contains("WSL wslpath 无法转换"));
    }
}
