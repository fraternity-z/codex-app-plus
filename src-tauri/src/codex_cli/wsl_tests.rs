use crate::models::{AgentEnvironment, AppServerStartInput};

use super::{build_launch_spec, resolve_wsl_cli_with_discovery, WslLaunchMode, WslLaunchSpec};

#[test]
fn resolves_native_wsl_cli_to_absolute_binary() {
    let input = AppServerStartInput {
        agent_environment: Some(AgentEnvironment::Wsl),
        codex_path: Some("/usr/local/bin/codex".to_string()),
    };
    let cli = resolve_wsl_cli_with_discovery(&input, |candidate| {
        assert_eq!(candidate, "/usr/local/bin/codex");
        Ok(WslLaunchSpec {
            display_path: "WSL:/opt/codex/bin/codex".to_string(),
            launch_mode: WslLaunchMode::Native {
                codex_path: "/opt/codex/bin/codex".to_string(),
            },
        })
    })
    .unwrap();

    assert_eq!(cli.program, "wsl.exe");
    assert_eq!(
        cli.prefix_args,
        vec!["--exec".to_string(), "/opt/codex/bin/codex".to_string()]
    );
    assert_eq!(cli.display_path, "WSL:/opt/codex/bin/codex");
}

#[test]
fn resolves_node_js_wsl_cli_to_node_and_js_entry() {
    let spec = build_launch_spec(
        "codex",
        true,
        "noise\nCODEX_WSL_DISCOVERY::codex=/root/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js\nCODEX_WSL_DISCOVERY::node=/root/.nvm/versions/node/v24.14.0/bin/node\nCODEX_WSL_DISCOVERY::mode=node-js\n",
        "",
        "exit status: 0",
    )
    .unwrap();

    assert_eq!(
        spec,
        WslLaunchSpec {
            display_path: "WSL:/root/.nvm/versions/node/v24.14.0/bin/node /root/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js".to_string(),
            launch_mode: WslLaunchMode::NodeJs {
                node_path: "/root/.nvm/versions/node/v24.14.0/bin/node".to_string(),
                codex_js_path: "/root/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js".to_string(),
            },
        }
    );
}

#[test]
fn returns_clear_error_when_login_shell_cannot_find_codex() {
    let error = build_launch_spec(
        "codex",
        false,
        "CODEX_WSL_DISCOVERY::error=codex-not-found\n",
        "",
        "exit status: 11",
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("Unable to resolve WSL Codex command `codex`"));
    assert!(error.to_string().contains("do not share the same PATH"));
}

#[test]
fn returns_clear_error_when_js_entry_has_no_node() {
    let error = build_launch_spec(
        "codex",
        false,
        "CODEX_WSL_DISCOVERY::codex=/root/.nvm/versions/node/v24.14.0/lib/node_modules/@openai/codex/bin/codex.js\nCODEX_WSL_DISCOVERY::error=node-not-found\n",
        "",
        "exit status: 12",
    )
    .unwrap_err();

    assert!(error.to_string().contains("could not resolve `node`"));
    assert!(error.to_string().contains("codex.js"));
}
