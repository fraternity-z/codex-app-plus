use std::process::Stdio;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::agent_environment::resolve_agent_environment;
use crate::error::{AppError, AppResult};
use crate::models::{AgentEnvironment, AppServerStartInput};

mod windows;
mod wsl;

const WSL_PROGRAM: &str = "wsl.exe";

pub struct SpawnedAppServer {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    pub stderr: ChildStderr,
}

#[derive(Debug, Clone)]
pub struct CodexCli {
    pub(crate) program: String,
    pub(crate) prefix_args: Vec<String>,
    pub(crate) display_path: String,
    is_wsl: bool,
}

impl CodexCli {
    pub fn resolve(input: &AppServerStartInput) -> AppResult<Self> {
        match resolve_agent_environment(input.agent_environment) {
            AgentEnvironment::WindowsNative => windows::resolve_windows_cli(input),
            AgentEnvironment::Wsl => wsl::resolve_wsl_cli(input),
        }
    }

    pub async fn detect_version(&self) -> AppResult<String> {
        let output = self.command_for_args(&["--version"]).output().await?;
        if output.status.success() {
            return parse_version_output(&output.stdout);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(AppError::Protocol(self.format_launch_error(
            "version check failed",
            &stderr,
            output.status.to_string(),
        )))
    }

    pub fn spawn_app_server(&self) -> AppResult<SpawnedAppServer> {
        let mut command = self.command_for_args(&[
            "app-server",
            "--analytics-default-enabled",
            "--listen",
            "stdio://",
        ]);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().map_err(|error| {
            AppError::Protocol(self.format_launch_error(
                "failed to spawn app-server",
                &error.to_string(),
                String::new(),
            ))
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire app-server stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire app-server stdout".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Protocol("failed to acquire app-server stderr".to_string()))?;

        Ok(SpawnedAppServer {
            child,
            stdin,
            stdout,
            stderr,
        })
    }

    fn command_for_args(&self, args: &[&str]) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.prefix_args);
        command.args(args);
        configure_windows_command(&mut command);
        command
    }

    fn format_launch_error(&self, action: &str, detail: &str, fallback_status: String) -> String {
        let suffix = if detail.is_empty() {
            fallback_status
        } else {
            detail.to_string()
        };
        if self.is_wsl {
            return format!(
                "{} {}. The interactive WSL shell and `wsl.exe --exec` do not share the same environment. {}",
                self.display_path, action, suffix
            );
        }
        if suffix.is_empty() {
            format!("{} {}", self.display_path, action)
        } else {
            format!("{} {}: {}", self.display_path, action, suffix)
        }
    }
}

#[cfg(windows)]
fn configure_windows_command(command: &mut Command) {
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn configure_windows_command(_command: &mut Command) {}

fn parse_version_output(stdout: &[u8]) -> AppResult<String> {
    let version = String::from_utf8_lossy(stdout).trim().to_string();
    if version.is_empty() {
        return Err(AppError::Protocol(
            "Codex version check returned empty output".to_string(),
        ));
    }
    Ok(version)
}

#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::CodexCli;
    use crate::models::AppServerStartInput;

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn unique_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("codex-app-plus-{name}-{timestamp}"))
    }

    #[test]
    fn resolves_explicit_cmd_path() {
        let _guard = env_lock();
        let directory = unique_dir("explicit");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("codex.cmd");
        fs::write(&path, "@echo off").unwrap();

        let input = AppServerStartInput {
            codex_path: Some(path.to_string_lossy().to_string()),
            ..AppServerStartInput::default()
        };
        let cli = CodexCli::resolve(&input).unwrap();

        assert_eq!(cli.program, "cmd.exe");
        assert_eq!(
            cli.prefix_args,
            vec!["/C".to_string(), path.to_string_lossy().to_string()]
        );
        assert_eq!(cli.display_path, path.to_string_lossy());
    }

    #[test]
    fn finds_codex_on_path() {
        let _guard = env_lock();
        let original_path = env::var_os("PATH");
        let directory = unique_dir("path");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("codex.cmd"), "@echo off").unwrap();
        env::set_var("PATH", &directory);

        let cli = CodexCli::resolve(&AppServerStartInput::default()).unwrap();

        if let Some(path) = original_path {
            env::set_var("PATH", path);
        } else {
            env::remove_var("PATH");
        }

        assert_eq!(cli.program, "cmd.exe");
        assert!(cli.display_path.ends_with("codex.cmd"));
    }

    #[test]
    fn returns_error_when_codex_missing() {
        let _guard = env_lock();
        let original_path = env::var_os("PATH");
        env::set_var("PATH", unique_dir("missing"));

        let result = CodexCli::resolve(&AppServerStartInput::default());

        if let Some(path) = original_path {
            env::set_var("PATH", path);
        } else {
            env::remove_var("PATH");
        }

        assert!(result.is_err());
    }
}
