use std::process::Stdio;

use tauri::AppHandle;
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};

use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::resolve_agent_environment;
use crate::infra::process::command::command_failure_detail;
use crate::infra::process::windows_child::configure_child_tree_root_tokio_command;
use crate::models::{AgentEnvironment, AppServerStartInput};

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
    pub fn resolve(app: Option<&AppHandle>, input: &AppServerStartInput) -> AppResult<Self> {
        match resolve_agent_environment(input.agent_environment) {
            AgentEnvironment::WindowsNative => windows::resolve_windows_cli(app, input),
            AgentEnvironment::Wsl => wsl::resolve_wsl_cli(app, input),
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

    pub fn spawn_app_server(&self, config_overrides: &[String]) -> AppResult<SpawnedAppServer> {
        let args = app_server_args(config_overrides);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        let mut command = self.command_for_args(&arg_refs);
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

    pub(crate) fn command_for_args(&self, args: &[&str]) -> Command {
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
        configure_child_tree_root_tokio_command(&mut command);
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

fn app_server_args(config_overrides: &[String]) -> Vec<String> {
    let mut args = vec!["app-server".to_string()];
    for value in config_overrides {
        args.push("-c".to_string());
        args.push(value.clone());
    }
    args.extend([
        "--analytics-default-enabled".to_string(),
        "--listen".to_string(),
        "stdio://".to_string(),
    ]);
    args
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

    use super::{app_server_args, CodexCli};
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
        let cli = CodexCli::resolve(None, &input).unwrap();

        assert_eq!(cli.program, "cmd.exe");
        assert_eq!(
            cli.prefix_args,
            vec!["/C".to_string(), path.to_string_lossy().to_string()]
        );
        assert_eq!(cli.display_path, path.to_string_lossy());
        assert_codex_home_env(&cli);
    }

    #[test]
    fn finds_codex_on_path_when_system_fallback_is_enabled() {
        let _guard = env_lock();
        let original_path = env::var_os("PATH");
        let original_bundle_root = env::var_os("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT");
        let original_allow_system = env::var_os("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX");
        let directory = unique_temp_dir("codex-app-plus", "path");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("codex.cmd"), "@echo off").unwrap();
        env::set_var("PATH", &directory);
        env::set_var(
            "CODEX_APP_PLUS_BUNDLED_CODEX_ROOT",
            unique_temp_dir("codex-app-plus", "invalid-bundle-root"),
        );
        env::set_var("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX", "1");

        let cli = CodexCli::resolve(None, &AppServerStartInput::default()).unwrap();

        restore_env("PATH", original_path);
        restore_env("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT", original_bundle_root);
        restore_env("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX", original_allow_system);

        assert_eq!(cli.program, "cmd.exe");
        assert!(cli.display_path.ends_with("codex.cmd"));
    }

    #[test]
    fn prefers_bundled_codex_over_path() {
        let _guard = env_lock();
        let original_path = env::var_os("PATH");
        let original_bundle_root = env::var_os("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT");
        let original_allow_system = env::var_os("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX");
        let bundle_root = unique_temp_dir("codex-app-plus", "bundled");
        let path_root = unique_temp_dir("codex-app-plus", "system");
        let native_bundle = native_bundle_fixture();
        let package_root = bundle_root.join("npm/node_modules/@openai/codex");
        let platform_root = bundle_root.join(native_bundle.package_relative);
        let bundled_binary = platform_root
            .join("vendor")
            .join(native_bundle.target_triple)
            .join("bin")
            .join(native_bundle.binary_name);
        let bundled_path_dir = platform_root
            .join("vendor")
            .join(native_bundle.target_triple)
            .join("codex-path");
        fs::create_dir_all(bundled_binary.parent().unwrap()).unwrap();
        fs::create_dir_all(&bundled_path_dir).unwrap();
        fs::create_dir_all(package_root.join("bin")).unwrap();
        fs::create_dir_all(&path_root).unwrap();
        fs::write(&bundled_binary, []).unwrap();
        fs::write(package_root.join("bin/codex.js"), "#!/usr/bin/env node").unwrap();
        fs::write(
            package_root.join("package.json"),
            r#"{"name":"@openai/codex"}"#,
        )
        .unwrap();
        fs::write(
            platform_root.join("package.json"),
            r#"{"name":"@openai/codex"}"#,
        )
        .unwrap();
        fs::write(path_root.join("codex.cmd"), "@echo off").unwrap();
        fs::write(
            bundle_root.join("manifest.json"),
            format!(
                r#"{{"schemaVersion":2,"version":"test","npmPackage":{{"name":"@openai/codex","root":"npm/node_modules/@openai/codex","platformPackages":{{"{}":"{}"}}}}}}"#,
                native_bundle.manifest_key, native_bundle.package_relative
            ),
        )
        .unwrap();
        env::set_var("PATH", &path_root);
        env::set_var("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT", &bundle_root);
        env::remove_var("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX");

        let cli = CodexCli::resolve(None, &AppServerStartInput::default()).unwrap();

        restore_env("PATH", original_path);
        restore_env("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT", original_bundle_root);
        restore_env("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX", original_allow_system);

        assert_eq!(std::path::PathBuf::from(&cli.program), bundled_binary);
        assert!(cli.prefix_args.is_empty());
        assert_eq!(std::path::PathBuf::from(&cli.display_path), bundled_binary);
        assert!(cli.environment.iter().any(|(key, value)| key == "PATH"
            && value
                .as_deref()
                .is_some_and(|value| value.contains("codex-path"))));
    }

    #[test]
    fn returns_error_when_codex_missing() {
        let _guard = env_lock();
        let original_path = env::var_os("PATH");
        let original_bundle_root = env::var_os("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT");
        let original_allow_system = env::var_os("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX");
        let bundle_root = unique_temp_dir("codex-app-plus", "missing-bundle");
        let package_root = bundle_root.join("npm/node_modules/@openai/codex");
        fs::create_dir_all(package_root.join("bin")).unwrap();
        fs::write(package_root.join("bin/codex.js"), "#!/usr/bin/env node").unwrap();
        fs::write(
            package_root.join("package.json"),
            r#"{"name":"@openai/codex"}"#,
        )
        .unwrap();
        fs::write(
            bundle_root.join("manifest.json"),
            r#"{"schemaVersion":2,"version":"test","npmPackage":{"name":"@openai/codex","root":"npm/node_modules/@openai/codex","platformPackages":{"windowsX64":"npm/node_modules/@openai/codex-win32-x64","linuxX64":"npm/node_modules/@openai/codex-linux-x64"}}}"#,
        )
        .unwrap();
        env::set_var("PATH", unique_temp_dir("codex-app-plus", "missing"));
        env::set_var("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT", &bundle_root);
        env::remove_var("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX");

        let result = CodexCli::resolve(None, &AppServerStartInput::default());

        restore_env("PATH", original_path);
        restore_env("CODEX_APP_PLUS_BUNDLED_CODEX_ROOT", original_bundle_root);
        restore_env("CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX", original_allow_system);

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

    #[test]
    fn app_server_args_include_config_overrides_before_listen_args() {
        let args = app_server_args(&[
            "mcp_servers.fetch={ url = \"http://127.0.0.1:1/mcp/fetch\" }".to_string(),
        ]);

        assert_eq!(
            args,
            vec![
                "app-server",
                "-c",
                "mcp_servers.fetch={ url = \"http://127.0.0.1:1/mcp/fetch\" }",
                "--analytics-default-enabled",
                "--listen",
                "stdio://",
            ],
        );
    }

    fn collect_args(command: Command) -> Vec<String> {
        command
            .as_std()
            .get_args()
            .map(|value| value.to_string_lossy().to_string())
            .collect()
    }

    fn assert_codex_home_env(cli: &CodexCli) {
        let codex_home = cli
            .environment
            .iter()
            .find_map(|(key, value)| (key == "CODEX_HOME").then(|| value.as_deref()).flatten())
            .expect("CODEX_HOME should be set for Windows CLI launches");

        assert!(
            codex_home.ends_with(".codex"),
            "unexpected CODEX_HOME: {codex_home}"
        );
    }

    struct NativeBundleFixture {
        manifest_key: &'static str,
        package_relative: &'static str,
        target_triple: &'static str,
        binary_name: &'static str,
    }

    fn native_bundle_fixture() -> NativeBundleFixture {
        if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") {
                return NativeBundleFixture {
                    manifest_key: "darwinArm64",
                    package_relative: "npm/node_modules/@openai/codex-darwin-arm64",
                    target_triple: "aarch64-apple-darwin",
                    binary_name: "codex",
                };
            }
            return NativeBundleFixture {
                manifest_key: "darwinX64",
                package_relative: "npm/node_modules/@openai/codex-darwin-x64",
                target_triple: "x86_64-apple-darwin",
                binary_name: "codex",
            };
        }
        if cfg!(target_os = "linux") {
            if cfg!(target_arch = "aarch64") {
                return NativeBundleFixture {
                    manifest_key: "linuxArm64",
                    package_relative: "npm/node_modules/@openai/codex-linux-arm64",
                    target_triple: "aarch64-unknown-linux-musl",
                    binary_name: "codex",
                };
            }
            return NativeBundleFixture {
                manifest_key: "linuxX64",
                package_relative: "npm/node_modules/@openai/codex-linux-x64",
                target_triple: "x86_64-unknown-linux-musl",
                binary_name: "codex",
            };
        }
        if cfg!(target_arch = "aarch64") {
            return NativeBundleFixture {
                manifest_key: "windowsArm64",
                package_relative: "npm/node_modules/@openai/codex-win32-arm64",
                target_triple: "aarch64-pc-windows-msvc",
                binary_name: "codex.exe",
            };
        }
        NativeBundleFixture {
            manifest_key: "windowsX64",
            package_relative: "npm/node_modules/@openai/codex-win32-x64",
            target_triple: "x86_64-pc-windows-msvc",
            binary_name: "codex.exe",
        }
    }

    fn restore_env(name: &str, value: Option<std::ffi::OsString>) {
        if let Some(value) = value {
            env::set_var(name, value);
        } else {
            env::remove_var(name);
        }
    }
}
