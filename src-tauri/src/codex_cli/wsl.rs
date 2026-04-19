use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;
use crate::proxy_environment::proxy_environment_assignments;
use crate::proxy_settings::load_proxy_settings;
use crate::wsl_support::{
    ensure_wsl_command_available, is_windows_path_like, resolve_default_wsl_context,
    resolve_wsl_command_path, WslContext,
};

use super::CodexCli;

const DEFAULT_WSL_CODEX_COMMAND: &str = "codex";
const WSL_LOGIN_SHELL: &str = "bash";
const WSL_LOGIN_EXEC_FLAG: &str = "-ic";
const WSL_LOGIN_EXEC_SCRIPT: &str = "exec \"$@\"";
const WSL_LOGIN_ARG0: &str = "codex-app-plus";

#[derive(Debug, Clone, PartialEq, Eq)]
struct WslLaunchSpec {
    display_path: String,
    prefix_args: Vec<String>,
    wsl_program: String,
}

pub(super) fn resolve_wsl_cli(input: &AppServerStartInput) -> AppResult<CodexCli> {
    let wsl_program = resolve_wsl_command_path();
    let context = resolve_default_wsl_context()?;
    let program = resolve_wsl_codex_program(input.codex_path.as_deref())?;
    let resolved_program = ensure_wsl_command_available(&context, &program)?;
    let proxy_settings = load_proxy_settings(crate::models::AgentEnvironment::Wsl)?;
    let spec = build_launch_spec(&wsl_program, &context, &resolved_program, &proxy_settings)?;
    Ok(CodexCli {
        program: spec.wsl_program,
        prefix_args: spec.prefix_args,
        display_path: spec.display_path,
        environment: Vec::new(),
    })
}

fn build_launch_spec(
    wsl_program: &Path,
    context: &WslContext,
    program: &str,
    proxy_settings: &crate::models::ProxySettings,
) -> AppResult<WslLaunchSpec> {
    let prefix_args = build_wsl_exec_prefix(context, program, proxy_settings);
    let wsl_program_text = wsl_program.to_string_lossy().to_string();
    Ok(WslLaunchSpec {
        display_path: build_display_path(&wsl_program_text, &prefix_args),
        prefix_args,
        wsl_program: wsl_program_text,
    })
}

fn resolve_wsl_codex_program(codex_path: Option<&str>) -> AppResult<String> {
    let candidate = codex_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_WSL_CODEX_COMMAND);
    if is_windows_path_like(candidate) {
        return Err(AppError::InvalidInput(
            "WSL 模式不能使用 Windows Codex 路径；请清空 codexPath 或填写 Linux 命令/绝对路径。"
                .to_string(),
        ));
    }
    Ok(candidate.to_string())
}

fn build_wsl_exec_prefix(
    context: &WslContext,
    program: &str,
    proxy_settings: &crate::models::ProxySettings,
) -> Vec<String> {
    vec![
        "--distribution".to_string(),
        context.distro_name.clone(),
        "--cd".to_string(),
        context.home_path.clone(),
        "--exec".to_string(),
        WSL_LOGIN_SHELL.to_string(),
        WSL_LOGIN_EXEC_FLAG.to_string(),
        build_wsl_exec_script(proxy_settings),
        WSL_LOGIN_ARG0.to_string(),
        program.to_string(),
    ]
}

fn build_wsl_exec_script(proxy_settings: &crate::models::ProxySettings) -> String {
    let statements = proxy_environment_assignments(proxy_settings)
        .into_iter()
        .map(|(key, value)| match value {
            Some(value) => format!("export {key}={};", shell_quote(value.as_str())),
            None => format!("unset {key};"),
        })
        .collect::<Vec<_>>()
        .join(" ");
    if statements.is_empty() {
        return WSL_LOGIN_EXEC_SCRIPT.to_string();
    }
    format!("{statements} exec \"$@\"")
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn build_display_path(program: &str, args: &[String]) -> String {
    let display_args = if args.len() >= 10 {
        vec![
            args[0].clone(),
            args[1].clone(),
            args[2].clone(),
            args[3].clone(),
            args[4].clone(),
            args[9].clone(),
        ]
    } else {
        args.to_vec()
    };
    std::iter::once(program.to_string())
        .chain(display_args.iter().map(|value| format_display_arg(value)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_display_arg(value: &str) -> String {
    if value.chars().any(char::is_whitespace) {
        format!("{value:?}")
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::wsl_support::WslContext;

    use super::{build_launch_spec, resolve_wsl_codex_program};

    const DISABLED_PROXY_EXEC_SCRIPT: &str = "unset HTTP_PROXY; unset http_proxy; unset HTTPS_PROXY; unset https_proxy; unset NO_PROXY; unset no_proxy; exec \"$@\"";

    fn wsl_context() -> WslContext {
        WslContext {
            distro_name: "Ubuntu".to_string(),
            home_path: "/home/me".to_string(),
        }
    }

    #[test]
    fn uses_default_codex_command_when_path_is_blank() {
        let program = resolve_wsl_codex_program(Some("   ")).expect("default program");

        assert_eq!(program, "codex");
    }

    #[test]
    fn preserves_linux_absolute_codex_path() {
        let spec = build_launch_spec(
            Path::new(r"C:\Windows\System32\wsl.exe"),
            &wsl_context(),
            "/usr/local/bin/codex",
            &crate::models::ProxySettings::default(),
        )
        .expect("launch spec");

        assert_eq!(
            spec.prefix_args,
            vec![
                "--distribution",
                "Ubuntu",
                "--cd",
                "/home/me",
                "--exec",
                "bash",
                "-ic",
                DISABLED_PROXY_EXEC_SCRIPT,
                "codex-app-plus",
                "/usr/local/bin/codex",
            ]
        );
    }

    #[test]
    fn rejects_windows_codex_path_in_wsl_mode() {
        let error = resolve_wsl_codex_program(Some(r"C:\Users\dev\AppData\Roaming\npm\codex.cmd"))
            .expect_err("windows path should be rejected");

        assert!(error
            .to_string()
            .contains("WSL 模式不能使用 Windows Codex 路径"));
    }

    #[test]
    fn includes_distribution_and_home_in_display_path() {
        let spec = build_launch_spec(
            Path::new("wsl.exe"),
            &wsl_context(),
            "/root/.nvm/versions/node/v24.14.0/bin/codex",
            &crate::models::ProxySettings::default(),
        )
        .expect("launch spec");

        assert_eq!(
            spec.display_path,
            "wsl.exe --distribution Ubuntu --cd /home/me --exec /root/.nvm/versions/node/v24.14.0/bin/codex"
        );
    }

    #[test]
    fn clears_proxy_exports_from_wsl_launch_script_when_disabled() {
        let spec = build_launch_spec(
            Path::new("wsl.exe"),
            &wsl_context(),
            "/usr/local/bin/codex",
            &crate::models::ProxySettings::default(),
        )
        .expect("launch spec");

        assert_eq!(spec.prefix_args[7], DISABLED_PROXY_EXEC_SCRIPT);
    }

    #[cfg(not(windows))]
    #[test]
    fn injects_system_proxy_exports_into_wsl_launch_script() {
        let _guard = proxy_env_lock();
        let original_http_proxy = std::env::var_os("HTTP_PROXY");
        let original_https_proxy = std::env::var_os("HTTPS_PROXY");
        let original_no_proxy = std::env::var_os("NO_PROXY");
        std::env::set_var("HTTP_PROXY", "http://127.0.0.1:8080");
        std::env::remove_var("HTTPS_PROXY");
        std::env::set_var("NO_PROXY", "localhost");

        let spec = build_launch_spec(
            Path::new("wsl.exe"),
            &wsl_context(),
            "/usr/local/bin/codex",
            &crate::models::ProxySettings {
                mode: crate::models::ProxyMode::System,
                http_proxy: String::new(),
                https_proxy: String::new(),
                no_proxy: String::new(),
            },
        )
        .expect("launch spec");

        restore_env("HTTP_PROXY", original_http_proxy);
        restore_env("HTTPS_PROXY", original_https_proxy);
        restore_env("NO_PROXY", original_no_proxy);

        assert!(spec.prefix_args[7].contains("export HTTP_PROXY='http://127.0.0.1:8080';"));
        assert!(spec.prefix_args[7].contains("export no_proxy='localhost';"));
        assert!(spec.prefix_args[7].contains("exec \"$@\""));
    }

    #[cfg(not(windows))]
    fn proxy_env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
        LOCK.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap()
    }

    #[cfg(not(windows))]
    fn restore_env(key: &str, value: Option<std::ffi::OsString>) {
        if let Some(value) = value {
            std::env::set_var(key, value);
        } else {
            std::env::remove_var(key);
        }
    }
}
