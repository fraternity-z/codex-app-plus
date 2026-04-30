use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::proxy_environment::apply_std_proxy_environment;
use crate::proxy_settings::load_proxy_settings;
use crate::windows_child_process::configure_background_std_command;

const GIT_PROGRAM: &str = "git";
const GIT_QUOTEPATH_CONFIG: [&str; 2] = ["-c", "core.quotepath=false"];

pub(super) fn has_head(repo_root: &Path) -> AppResult<bool> {
    git_command()?
        .arg("-C")
        .arg(repo_root)
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .map(|output| output.status.success())
        .map_err(AppError::from)
}

pub(super) fn rev_parse(repo_root: &Path, arg: &str) -> AppResult<String> {
    run_git(repo_root, &[OsString::from("rev-parse"), OsString::from(arg)])
}

pub(super) fn run_git(repo_root: &Path, args: &[OsString]) -> AppResult<String> {
    run_git_with_exit_codes(repo_root, args, &[0])
}

pub(super) fn run_git_with_exit_codes(
    repo_root: &Path,
    args: &[OsString],
    allowed_exit_codes: &[i32],
) -> AppResult<String> {
    let output = git_command()?
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .map_err(AppError::from)?;
    let exit_code = output.status.code();
    let succeeded = output.status.success()
        || exit_code
            .map(|code| allowed_exit_codes.contains(&code))
            .unwrap_or(false);
    if succeeded {
        return Ok(String::from_utf8_lossy(&output.stdout)
            .trim_end()
            .to_string());
    }

    Err(AppError::Protocol(format_git_error(
        args,
        &output.stderr,
        &output.stdout,
    )))
}

fn git_command() -> AppResult<Command> {
    let mut command = Command::new(GIT_PROGRAM);
    command.args(GIT_QUOTEPATH_CONFIG);
    configure_background_std_command(&mut command);
    let settings = load_proxy_settings(crate::models::AgentEnvironment::WindowsNative)?;
    apply_std_proxy_environment(&mut command, &settings);
    Ok(command)
}

fn format_git_error(args: &[OsString], stderr: &[u8], stdout: &[u8]) -> String {
    let stderr_text = String::from_utf8_lossy(stderr).trim().to_string();
    let stdout_text = String::from_utf8_lossy(stdout).trim().to_string();
    let detail = if stderr_text.is_empty() {
        stdout_text
    } else {
        stderr_text
    };
    let command = args
        .iter()
        .map(|item| item.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(" ");
    format!("git {command} 执行失败: {detail}")
}

#[cfg(test)]
mod tests {
    use super::format_git_error;
    use std::ffi::OsString;

    #[test]
    fn formats_git_error_with_stderr_first() {
        let error = format_git_error(
            &[OsString::from("status")],
            b"fatal: not a git repository",
            b"",
        );

        assert_eq!(error, "git status 执行失败: fatal: not a git repository");
    }

    #[test]
    fn formats_git_error_with_stdout_fallback() {
        let error = format_git_error(&[OsString::from("status")], b"", b"fallback");

        assert_eq!(error, "git status 执行失败: fallback");
    }
}
