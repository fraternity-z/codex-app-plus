use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;

use super::{CodexCli, WSL_PROGRAM};

const DEFAULT_WSL_CODEX_COMMAND: &str = "codex";
const DISCOVERY_BASH: &str = "bash";
const DISCOVERY_MARKER: &str = "CODEX_WSL_DISCOVERY::";
const DISCOVERY_STATUS_FALLBACK: &str = "WSL login shell discovery returned no details";
const MAX_DIAGNOSTIC_LENGTH: usize = 240;
const DISCOVERY_SCRIPT: &str = r#"
candidate="$1"
if [ -z "$candidate" ]; then
  printf '%s\n' 'CODEX_WSL_DISCOVERY::error=empty-codex-command'
  exit 10
fi

resolved=""
if [ -x "$candidate" ]; then
  resolved="$candidate"
else
  resolved="$(command -v -- "$candidate" 2>/dev/null || true)"
fi

if [ -z "$resolved" ]; then
  printf '%s\n' 'CODEX_WSL_DISCOVERY::error=codex-not-found'
  exit 11
fi

resolved="$(readlink -f -- "$resolved" 2>/dev/null || printf '%s' "$resolved")"
printf 'CODEX_WSL_DISCOVERY::codex=%s\n' "$resolved"

case "$resolved" in
  *.js)
    node_path="$(command -v -- node 2>/dev/null || true)"
    if [ -z "$node_path" ]; then
      printf '%s\n' 'CODEX_WSL_DISCOVERY::error=node-not-found'
      exit 12
    fi
    node_path="$(readlink -f -- "$node_path" 2>/dev/null || printf '%s' "$node_path")"
    printf 'CODEX_WSL_DISCOVERY::node=%s\n' "$node_path"
    printf '%s\n' 'CODEX_WSL_DISCOVERY::mode=node-js'
    ;;
  *)
    printf '%s\n' 'CODEX_WSL_DISCOVERY::mode=native'
    ;;
esac
"#;

#[derive(Debug, Clone, PartialEq, Eq)]
enum WslLaunchMode {
    Native {
        codex_path: String,
    },
    NodeJs {
        node_path: String,
        codex_js_path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WslLaunchSpec {
    launch_mode: WslLaunchMode,
    display_path: String,
}

#[derive(Debug, Default)]
struct DiscoveryReport {
    codex_path: Option<String>,
    node_path: Option<String>,
    mode: Option<String>,
    error: Option<String>,
}

pub(super) fn resolve_wsl_cli(input: &AppServerStartInput) -> AppResult<CodexCli> {
    resolve_wsl_cli_with_discovery(input, discover_launch_spec)
}

fn resolve_wsl_cli_with_discovery<F>(
    input: &AppServerStartInput,
    discover: F,
) -> AppResult<CodexCli>
where
    F: FnOnce(&str) -> AppResult<WslLaunchSpec>,
{
    let candidate = resolve_wsl_candidate(input)?;
    let spec = discover(&candidate)?;
    Ok(build_wsl_cli(spec))
}

fn resolve_wsl_candidate(input: &AppServerStartInput) -> AppResult<String> {
    let candidate = input
        .codex_path
        .as_deref()
        .map(str::trim)
        .unwrap_or(DEFAULT_WSL_CODEX_COMMAND);
    if candidate.is_empty() {
        return Err(AppError::InvalidInput(
            "codexPath cannot be empty in WSL mode; provide a WSL command name or absolute path."
                .to_string(),
        ));
    }
    Ok(candidate.to_string())
}

fn discover_launch_spec(candidate: &str) -> AppResult<WslLaunchSpec> {
    let output = Command::new(WSL_PROGRAM)
        .args([
            "-e",
            DISCOVERY_BASH,
            "-lic",
            DISCOVERY_SCRIPT,
            "codex-app-plus-wsl-discovery",
            candidate,
        ])
        .output()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let status = output.status.to_string();

    build_launch_spec(
        candidate,
        output.status.success(),
        &stdout,
        &stderr,
        &status,
    )
}

fn build_launch_spec(
    candidate: &str,
    succeeded: bool,
    stdout: &str,
    stderr: &str,
    status: &str,
) -> AppResult<WslLaunchSpec> {
    let report = parse_discovery_report(stdout);
    if let Some(code) = report.error.as_deref() {
        return Err(match code {
            "codex-not-found" => AppError::Protocol(format!(
                "Unable to resolve WSL Codex command `{candidate}` from a login shell. The interactive WSL shell and `wsl.exe --exec` do not share the same PATH."
            )),
            "node-not-found" => AppError::Protocol(format!(
                "WSL login shell resolved `{candidate}` to JavaScript entry `{}`, but could not resolve `node`. The interactive WSL shell and `wsl.exe --exec` do not share the same PATH.",
                report.codex_path.clone().unwrap_or_else(|| candidate.to_string())
            )),
            _ => AppError::Protocol(format!(
                "Failed to resolve WSL Codex command `{candidate}`: {code}."
            )),
        });
    }

    if let Some(spec) = build_launch_spec_from_report(report) {
        return Ok(spec);
    }

    let detail = format_discovery_detail(stdout, stderr, status, succeeded);
    Err(AppError::Protocol(format!(
        "Failed to resolve WSL Codex command `{candidate}` from a login shell. The interactive WSL shell and `wsl.exe --exec` do not share the same environment. {detail}"
    )))
}

fn parse_discovery_report(stdout: &str) -> DiscoveryReport {
    let mut report = DiscoveryReport::default();
    for line in stdout.lines() {
        let Some(payload) = line.strip_prefix(DISCOVERY_MARKER) else {
            continue;
        };
        let Some((key, value)) = payload.split_once('=') else {
            continue;
        };
        match key {
            "codex" => report.codex_path = Some(value.to_string()),
            "node" => report.node_path = Some(value.to_string()),
            "mode" => report.mode = Some(value.to_string()),
            "error" => report.error = Some(value.to_string()),
            _ => {}
        }
    }
    report
}

fn build_launch_spec_from_report(report: DiscoveryReport) -> Option<WslLaunchSpec> {
    match report.mode.as_deref() {
        Some("native") => {
            let codex_path = report.codex_path?;
            Some(WslLaunchSpec {
                display_path: format!("WSL:{codex_path}"),
                launch_mode: WslLaunchMode::Native { codex_path },
            })
        }
        Some("node-js") => {
            let codex_js_path = report.codex_path?;
            let node_path = report.node_path?;
            Some(WslLaunchSpec {
                display_path: format!("WSL:{node_path} {codex_js_path}"),
                launch_mode: WslLaunchMode::NodeJs {
                    node_path,
                    codex_js_path,
                },
            })
        }
        _ => None,
    }
}

fn build_wsl_cli(spec: WslLaunchSpec) -> CodexCli {
    let prefix_args = match spec.launch_mode {
        WslLaunchMode::Native { codex_path } => vec!["--exec".to_string(), codex_path],
        WslLaunchMode::NodeJs {
            node_path,
            codex_js_path,
        } => vec!["--exec".to_string(), node_path, codex_js_path],
    };

    CodexCli {
        program: WSL_PROGRAM.to_string(),
        prefix_args,
        display_path: spec.display_path,
        is_wsl: true,
    }
}

fn format_discovery_detail(stdout: &str, stderr: &str, status: &str, succeeded: bool) -> String {
    let stdout_text = trim_diagnostic(stdout);
    let stderr_text = trim_diagnostic(stderr);
    if !stderr_text.is_empty() {
        return format!("Stderr: {stderr_text}");
    }
    if !stdout_text.is_empty() {
        return format!("Stdout: {stdout_text}");
    }
    if succeeded {
        DISCOVERY_STATUS_FALLBACK.to_string()
    } else {
        format!("Discovery exit status: {status}")
    }
}

fn trim_diagnostic(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= MAX_DIAGNOSTIC_LENGTH {
        return trimmed.to_string();
    }
    let mut shortened = trimmed[..MAX_DIAGNOSTIC_LENGTH].to_string();
    shortened.push_str("...");
    shortened
}

#[cfg(test)]
#[path = "wsl_tests.rs"]
mod tests;
