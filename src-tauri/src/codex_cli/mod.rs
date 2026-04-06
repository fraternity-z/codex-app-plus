use std::process::Stdio;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::agent_environment::resolve_agent_environment;
use crate::command_utils::command_failure_detail;
use crate::error::{AppError, AppResult};
use crate::models::{AgentEnvironment, AppServerStartInput};
use crate::windows_child_process::configure_background_tokio_command;

mod windows;
mod wsl;

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
    pub(crate) environment: Vec<(String, Option<String>)>,
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

        Err(AppError::Protocol(self.format_launch_error(
            "version check failed",
            &command_failure_detail(&output.stderr, &output.stdout, output.status.to_string()),
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
        for (key, value) in &self.environment {
            match value {
                Some(value) => {
                    command.env(key, value);
                }
                None => {
                    command.env_remove(key);
                }
            }
        }
        configure_background_tokio_command(&mut command);
        command
    }

    fn format_launch_error(&self, action: &str, detail: &str, fallback_status: String) -> String {
        let suffix = if detail.is_empty() {
            fallback_status
        } else {
            detail.to_string()
        };
        if suffix.is_empty() {
            format!("{} {}", self.display_path, action)
        } else {
            format!("{} {}: {}", self.display_path, action, suffix)
        }
    }
}

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
    use std::sync::{Mutex, OnceLock};

    use super::CodexCli;
    use crate::models::AppServerStartInput;
    use crate::test_support::unique_temp_dir;
    use tokio::process::Command;

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn resolves_explicit_cmd_path() {
        let _guard = env_lock();
        let directory = unique_temp_dir("codex-app-plus", "explicit");
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
        let directory = unique_temp_dir("codex-app-plus", "path");
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
        env::set_var("PATH", unique_temp_dir("codex-app-plus", "missing"));

        let result = CodexCli::resolve(&AppServerStartInput::default());

        if let Some(path) = original_path {
            env::set_var("PATH", path);
        } else {
            env::remove_var("PATH");
        }

        assert!(result.is_err());
    }

    #[test]
    fn wsl_commands_reuse_the_same_prefix_for_version_and_app_server() {
        let cli = CodexCli {
            program: "wsl.exe".to_string(),
            prefix_args: vec![
                "--distribution".to_string(),
                "Ubuntu".to_string(),
                "--cd".to_string(),
                "/home/me".to_string(),
                "--exec".to_string(),
                "bash".to_string(),
                "-ic".to_string(),
                "exec \"$@\"".to_string(),
                "codex-app-plus".to_string(),
                "/root/.nvm/versions/node/v24.14.0/bin/codex".to_string(),
            ],
            display_path: "wsl.exe --distribution Ubuntu --cd /home/me --exec /root/.nvm/versions/node/v24.14.0/bin/codex".to_string(),
            environment: Vec::new(),
        };

        let version_args = collect_args(cli.command_for_args(&["--version"]));
        let app_server_args = collect_args(cli.command_for_args(&[
            "app-server",
            "--analytics-default-enabled",
            "--listen",
            "stdio://",
        ]));

        assert_eq!(version_args[..cli.prefix_args.len()], cli.prefix_args);
        assert_eq!(app_server_args[..cli.prefix_args.len()], cli.prefix_args);
    }

    fn collect_args(command: Command) -> Vec<String> {
        command
            .as_std()
            .get_args()
            .map(|value| value.to_string_lossy().to_string())
            .collect()
    }
}
