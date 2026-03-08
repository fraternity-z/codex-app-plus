use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;

const WINDOWS_CANDIDATES: [&str; 4] = ["codex.cmd", "codex.exe", "codex.ps1", "codex"];

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
}

impl CodexCli {
    pub fn resolve(input: &AppServerStartInput) -> AppResult<Self> {
        let path = resolve_codex_path(input)?;
        Ok(build_cli(path))
    }

    pub async fn detect_version(&self) -> AppResult<String> {
        let output = self.command_for_args(&["--version"]).output().await?;
        if output.status.success() {
            return parse_version_output(&output.stdout);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            format!("{} 返回非零退出码: {}", self.display_path, output.status)
        } else {
            format!("{} 版本检测失败: {}", self.display_path, stderr)
        };
        Err(AppError::Protocol(message))
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

        let mut child = command.spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Protocol("无法获取 app-server stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Protocol("无法获取 app-server stdout".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Protocol("无法获取 app-server stderr".to_string()))?;

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
        command
    }
}

fn resolve_codex_path(input: &AppServerStartInput) -> AppResult<PathBuf> {
    if let Some(path) = resolve_custom_path(input)? {
        return Ok(path);
    }

    search_path_candidates().ok_or_else(|| {
        AppError::InvalidInput("未检测到已安装 Codex，请先确保 codex 已加入 PATH".to_string())
    })
}

fn resolve_custom_path(input: &AppServerStartInput) -> AppResult<Option<PathBuf>> {
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

fn build_cli(path: PathBuf) -> CodexCli {
    let display_path = path.to_string_lossy().to_string();
    let extension = file_extension(&path);
    let path_text = display_path.clone();

    if extension == "cmd" || extension == "bat" {
        return CodexCli {
            program: "cmd.exe".to_string(),
            prefix_args: vec!["/C".to_string(), path_text],
            display_path,
        };
    }

    if extension == "ps1" {
        return CodexCli {
            program: "powershell.exe".to_string(),
            prefix_args: vec!["-File".to_string(), path_text],
            display_path,
        };
    }

    CodexCli {
        program: path_text,
        prefix_args: Vec::new(),
        display_path,
    }
}

fn file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn parse_version_output(stdout: &[u8]) -> AppResult<String> {
    let version = String::from_utf8_lossy(stdout).trim().to_string();
    if version.is_empty() {
        return Err(AppError::Protocol("Codex 版本检测返回空输出".to_string()));
    }
    Ok(version)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

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
        };
        let cli = CodexCli::resolve(&input).unwrap();

        assert_eq!(cli.program, "cmd.exe");
        assert_eq!(cli.prefix_args[0], "/C");
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
