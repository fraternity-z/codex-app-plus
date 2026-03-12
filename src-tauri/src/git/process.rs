use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::windows_child_process::configure_background_std_command;

const GIT_PROGRAM: &str = "git";

pub(super) fn has_head(repo_root: &Path) -> bool {
    git_command()
        .arg("-C")
        .arg(repo_root)
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub(super) fn run_git(repo_root: &Path, args: &[OsString]) -> AppResult<String> {
    run_git_with_exit_codes(repo_root, args, &[0])
}

pub(super) fn run_git_with_exit_codes(
    repo_root: &Path,
    args: &[OsString],
    allowed_exit_codes: &[i32],
) -> AppResult<String> {
    let output = git_command()
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

fn git_command() -> Command {
    let mut command = Command::new(GIT_PROGRAM);
    configure_background_std_command(&mut command);
    command
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
