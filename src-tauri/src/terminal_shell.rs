use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

use crate::error::{AppError, AppResult};
use crate::models::EmbeddedTerminalShell;

const UNIX_DEFAULT_SHELL: &str = "/bin/bash";
const WINDOWS_COMMAND_PROMPT_PROGRAM: &str = "cmd.exe";
const WINDOWS_GIT_BASH_PROGRAM: &str = "C:\\Program Files\\Git\\bin\\bash.exe";
const WINDOWS_POWERSHELL_PROGRAM: &str = "powershell.exe";

#[derive(Debug)]
pub struct ShellConfig {
    pub program: String,
    pub args: Vec<String>,
    pub label: String,
}

pub fn build_shell_command(shell: &ShellConfig) -> CommandBuilder {
    let mut command = CommandBuilder::new(&shell.program);
    command.args(&shell.args);
    command
}

pub fn resolve_shell_config(
    requested_shell: Option<EmbeddedTerminalShell>,
) -> AppResult<ShellConfig> {
    if cfg!(target_os = "windows") {
        let shell = requested_shell.unwrap_or(EmbeddedTerminalShell::PowerShell);
        return build_windows_shell_config(shell, Path::new(WINDOWS_GIT_BASH_PROGRAM));
    }
    Ok(resolve_unix_shell_config())
}

fn resolve_unix_shell_config() -> ShellConfig {
    let shell_path = std::env::var("SHELL").unwrap_or_else(|_| UNIX_DEFAULT_SHELL.to_string());
    let label = PathBuf::from(&shell_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("shell")
        .to_string();
    ShellConfig {
        program: shell_path,
        args: vec!["-i".to_string()],
        label,
    }
}

fn build_windows_shell_config(
    shell: EmbeddedTerminalShell,
    git_bash_program: &Path,
) -> AppResult<ShellConfig> {
    match shell {
        EmbeddedTerminalShell::PowerShell => Ok(build_power_shell_config()),
        EmbeddedTerminalShell::CommandPrompt => Ok(build_command_prompt_config()),
        EmbeddedTerminalShell::GitBash => build_git_bash_shell_config(git_bash_program),
    }
}

fn build_power_shell_config() -> ShellConfig {
    ShellConfig {
        program: WINDOWS_POWERSHELL_PROGRAM.to_string(),
        args: vec!["-NoLogo".to_string(), "-NoExit".to_string()],
        label: "PowerShell".to_string(),
    }
}

fn build_command_prompt_config() -> ShellConfig {
    ShellConfig {
        program: WINDOWS_COMMAND_PROMPT_PROGRAM.to_string(),
        args: vec!["/K".to_string()],
        label: "Command Prompt".to_string(),
    }
}

fn build_git_bash_shell_config(git_bash_program: &Path) -> AppResult<ShellConfig> {
    if !git_bash_program.exists() {
        return Err(AppError::InvalidInput(format!(
            "Git Bash is not installed: {}",
            git_bash_program.display()
        )));
    }
    Ok(ShellConfig {
        program: git_bash_program.display().to_string(),
        args: vec!["--login".to_string(), "-i".to_string()],
        label: "Git Bash".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{build_windows_shell_config, resolve_unix_shell_config};
    use crate::models::EmbeddedTerminalShell;
    use std::path::PathBuf;

    #[test]
    fn builds_powershell_config_with_minimal_interactive_args() {
        let config = build_windows_shell_config(
            EmbeddedTerminalShell::PowerShell,
            PathBuf::from("C:/Program Files/Git/bin/bash.exe").as_path(),
        )
        .expect("expected PowerShell config");

        assert_eq!(config.program, "powershell.exe");
        assert_eq!(config.label, "PowerShell");
        assert_eq!(
            config.args,
            vec!["-NoLogo".to_string(), "-NoExit".to_string()]
        );
    }

    #[test]
    fn builds_command_prompt_config_with_minimal_interactive_args() {
        let config = build_windows_shell_config(
            EmbeddedTerminalShell::CommandPrompt,
            PathBuf::from("C:/Program Files/Git/bin/bash.exe").as_path(),
        )
        .expect("expected Command Prompt config");

        assert_eq!(config.program, "cmd.exe");
        assert_eq!(config.label, "Command Prompt");
        assert_eq!(config.args, vec!["/K".to_string()]);
    }

    #[test]
    fn builds_unix_shell_config_as_interactive() {
        let config = resolve_unix_shell_config();

        assert_eq!(config.args, vec!["-i".to_string()]);
    }

    #[test]
    fn builds_git_bash_config_when_program_exists() {
        let temp_path = std::env::temp_dir().join(format!(
            "codex-app-plus-terminal-shell-{}-git-bash.exe",
            std::process::id()
        ));
        std::fs::write(&temp_path, []).expect("expected temp file to be created");

        let config =
            build_windows_shell_config(EmbeddedTerminalShell::GitBash, temp_path.as_path())
                .expect("expected Git Bash config");

        assert_eq!(config.program, temp_path.display().to_string());
        assert_eq!(config.label, "Git Bash");
        assert_eq!(config.args, vec!["--login".to_string(), "-i".to_string()]);

        std::fs::remove_file(temp_path).expect("expected temp file to be removed");
    }

    #[test]
    fn returns_explicit_error_when_git_bash_is_missing() {
        let missing_path = std::env::temp_dir().join(format!(
            "codex-app-plus-terminal-shell-{}-missing-git-bash.exe",
            std::process::id()
        ));
        let error =
            build_windows_shell_config(EmbeddedTerminalShell::GitBash, missing_path.as_path())
                .expect_err("expected Git Bash error");

        assert!(
            error.to_string().contains("Git Bash is not installed"),
            "unexpected error: {error}"
        );
    }
}
