use std::ffi::OsStr;
use std::fmt::Display;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::windows_child_process::configure_background_std_command;

pub(crate) fn command_failure_detail(
    stderr: &[u8],
    stdout: &[u8],
    fallback_status: impl Into<String>,
) -> String {
    let stderr_text = String::from_utf8_lossy(stderr).trim().to_string();
    if !stderr_text.is_empty() {
        return stderr_text;
    }

    let stdout_text = String::from_utf8_lossy(stdout).trim().to_string();
    if !stdout_text.is_empty() {
        return stdout_text;
    }

    fallback_status.into()
}

pub(crate) fn io_error(error: impl Display) -> AppError {
    AppError::Io(error.to_string())
}

pub(crate) fn open_detached_target(target: impl AsRef<OsStr>) -> AppResult<()> {
    open::that_detached(target).map_err(io_error)?;
    Ok(())
}

pub(crate) fn spawn_background_command(command: &mut Command) -> AppResult<()> {
    command.spawn().map(|_| ()).map_err(io_error)
}

pub(crate) fn spawn_hidden_background_command(command: &mut Command) -> AppResult<()> {
    configure_background_std_command(command);
    spawn_background_command(command)
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::{
        command_failure_detail, spawn_background_command, spawn_hidden_background_command,
    };

    #[test]
    fn prefers_stderr_output() {
        let detail = command_failure_detail(b"stderr", b"stdout", "status");
        assert_eq!(detail, "stderr");
    }

    #[test]
    fn falls_back_to_status_when_streams_are_empty() {
        let detail = command_failure_detail(b"   ", b"", "exit 1");
        assert_eq!(detail, "exit 1");
    }

    #[test]
    fn spawns_hidden_background_commands() {
        let mut command = quiet_command();
        let result = spawn_hidden_background_command(&mut command);
        assert!(result.is_ok());
    }

    #[test]
    fn spawns_background_commands() {
        let mut command = quiet_command();
        let result = spawn_background_command(&mut command);
        assert!(result.is_ok());
    }

    #[cfg(windows)]
    fn quiet_command() -> Command {
        let mut command = Command::new("cmd.exe");
        command.args(["/C", "exit", "0"]);
        command
    }

    #[cfg(not(windows))]
    fn quiet_command() -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", "exit 0"]);
        command
    }
}
