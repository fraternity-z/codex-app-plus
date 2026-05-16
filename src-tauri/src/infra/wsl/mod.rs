use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::infra::process::command::command_failure_detail;
use crate::infra::process::windows_child::configure_background_std_command;

const WSL_COMMAND: &str = "wsl.exe";
const SYSTEM32_DIR: &str = "System32";
const WSL_ROOT_ENV_VARS: [&str; 2] = ["SystemRoot", "WINDIR"];
const WSL_INFO_SCRIPT: &str = "printf '%s\n%s\n' \"$WSL_DISTRO_NAME\" \"$HOME\"";
const WSL_COMMAND_RESOLVE_SCRIPT: &str = "command -v -- \"$1\"";
const WSL_BASH_SHELL: &str = "bash";
const WSL_BASH_INTERACTIVE_FLAG: &str = "-ic";
const WSL_SHELL_ARG0: &str = "codex-app-plus";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WslContext {
    pub(crate) distro_name: String,
    pub(crate) home_path: String,
}

pub(crate) fn resolve_default_wsl_context() -> AppResult<WslContext> {
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
        return Err(AppError::Protocol(format!(
            "查询 WSL 默认环境失败: {}",
            command_failure_detail(&output.stderr, &output.stdout, output.status.to_string())
        )));
    }

    parse_wsl_context_output(&output.stdout)
}

pub(crate) fn resolve_wsl_command_path() -> PathBuf {
    let get_var = |name: &'static str| std::env::var_os(name);
    let path_exists = |path: &Path| path.exists();
    resolve_wsl_command_path_with(get_var, path_exists)
}

pub(crate) fn ensure_wsl_command_available(
    context: &WslContext,
    program: &str,
) -> AppResult<String> {
    let command_path = resolve_wsl_command_path();
    ensure_wsl_command_available_with(&command_path, context, program)
}

pub(crate) fn linux_path_to_unc_path(distro_name: &str, linux_path: &str) -> AppResult<PathBuf> {
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

pub(crate) fn is_windows_path_like(path: &str) -> bool {
    let trimmed_path = path.trim();
    trimmed_path.starts_with(r"\\")
        || Path::new(trimmed_path)
            .components()
            .next()
            .map(|component| matches!(component, std::path::Component::Prefix(_)))
            .unwrap_or(false)
}

fn parse_wsl_context_output(stdout: &[u8]) -> AppResult<WslContext> {
    let stdout = String::from_utf8(stdout.to_vec())
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

fn ensure_wsl_command_available_with(
    command_path: &Path,
    context: &WslContext,
    program: &str,
) -> AppResult<String> {
    let mut command = Command::new(command_path);
    configure_background_std_command(&mut command);
    let output = command
        .args([
            "--distribution",
            context.distro_name.as_str(),
            "--exec",
            WSL_BASH_SHELL,
            WSL_BASH_INTERACTIVE_FLAG,
            WSL_COMMAND_RESOLVE_SCRIPT,
            WSL_SHELL_ARG0,
            program,
        ])
        .output()
        .map_err(|error| {
            AppError::Io(format!(
                "无法在 WSL 发行版 {} 中探测命令 {}: {error}",
                context.distro_name, program
            ))
        })?;

    parse_wsl_command_probe_output(
        context,
        program,
        &output.stdout,
        &output.stderr,
        output.status,
    )
}

fn parse_wsl_command_probe_output(
    context: &WslContext,
    program: &str,
    stdout: &[u8],
    stderr: &[u8],
    status: std::process::ExitStatus,
) -> AppResult<String> {
    let resolved = String::from_utf8_lossy(stdout).trim().to_string();
    if status.success() && !resolved.is_empty() {
        return Ok(resolved);
    }

    let detail = if resolved.is_empty() {
        command_failure_detail(stderr, stdout, status.to_string())
    } else {
        resolved
    };
    Err(AppError::Protocol(format_wsl_command_probe_error(
        context, program, &detail,
    )))
}

fn format_wsl_command_probe_error(context: &WslContext, program: &str, detail: &str) -> String {
    let program = program.trim();
    let guidance = if program.starts_with('/') {
        format!("请确认该 Linux 路径存在且可执行：`{program}`。")
    } else {
        format!(
            "请确认在该发行版中运行 `command -v {program}` 可以返回可执行路径，或在 codexPath 中填写 Linux 绝对路径。"
        )
    };
    format!(
        "WSL 发行版 {} 中无法解析 Codex 命令 `{}`（HOME={}）。{} 详情: {}",
        context.distro_name, program, context.home_path, guidance, detail
    )
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

#[cfg(test)]
mod tests {
    use super::{
        ensure_wsl_command_available_with, format_wsl_command_probe_error, is_windows_path_like,
        linux_path_to_unc_path, parse_wsl_context_output, resolve_wsl_command_path_with,
        WslContext,
    };
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};
    use std::process::ExitStatus;

    #[cfg(windows)]
    use std::os::windows::process::ExitStatusExt;

    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;

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

    fn wsl_context() -> WslContext {
        WslContext {
            distro_name: "Ubuntu".to_string(),
            home_path: "/root".to_string(),
        }
    }

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
    fn parses_default_wsl_context_output() {
        let context =
            parse_wsl_context_output("Ubuntu\n/home/me\n".as_bytes()).expect("wsl context");

        assert_eq!(context.distro_name, "Ubuntu");
        assert_eq!(context.home_path, "/home/me");
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

    #[test]
    fn detects_windows_like_paths() {
        assert!(is_windows_path_like(r"C:\Users\dev\codex.exe"));
        assert!(is_windows_path_like(r"\\wsl$\Ubuntu\home\me\repo"));
        assert!(!is_windows_path_like("/home/me/.local/bin/codex"));
    }

    #[test]
    fn probes_wsl_command_with_login_shell() {
        let script = std::env::temp_dir().join("wsl-probe-test.cmd");
        std::fs::write(&script, "@echo off\r\necho /home/me/.local/bin/codex\r\n").unwrap();

        let resolved =
            ensure_wsl_command_available_with(&script, &wsl_context(), "codex").expect("resolved");

        assert_eq!(resolved, "/home/me/.local/bin/codex");
        let _ = std::fs::remove_file(script);
    }

    #[test]
    fn reports_distro_home_and_command_when_probe_fails() {
        let message = format_wsl_command_probe_error(&wsl_context(), "codex", "command not found");

        assert!(message.contains("Ubuntu"));
        assert!(message.contains("HOME=/root"));
        assert!(message.contains("command -v codex"));
        assert!(message.contains("command not found"));
    }

    #[test]
    fn fails_when_probe_output_is_empty() {
        let error = super::parse_wsl_command_probe_output(
            &wsl_context(),
            "codex",
            b"",
            b"",
            failure_status(),
        )
        .expect_err("probe should fail");

        assert!(error.to_string().contains("无法解析 Codex 命令"));
    }

    #[test]
    fn accepts_non_empty_probe_output() {
        let resolved = super::parse_wsl_command_probe_output(
            &wsl_context(),
            "codex",
            b"/usr/local/bin/codex\n",
            b"",
            success_status(),
        )
        .expect("probe succeeds");

        assert_eq!(resolved, "/usr/local/bin/codex");
    }
}
