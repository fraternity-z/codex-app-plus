use std::fs;
use std::io::{ErrorKind, Write};
use std::path::Path;

use toml_edit::{DocumentMut, Item, Table};

use crate::agent_environment::{resolve_host_path_for_agent_path, resolve_agent_environment};
use crate::error::{AppError, AppResult};
use crate::models::{WriteProjectPermissionConfigInput, WriteProjectPermissionConfigOutput};

const APPROVAL_POLICY_KEY: &str = "approval_policy";
const SANDBOX_MODE_KEY: &str = "sandbox_mode";
const SANDBOX_WORKSPACE_WRITE_KEY: &str = "sandbox_workspace_write";
const NETWORK_ACCESS_KEY: &str = "network_access";

pub fn write_project_permission_config(
    input: WriteProjectPermissionConfigInput,
) -> AppResult<WriteProjectPermissionConfigOutput> {
    let agent_environment = resolve_agent_environment(Some(input.agent_environment));
    let host_path = resolve_host_path_for_agent_path(agent_environment, &input.file_path)?;
    validate_project_config_path(&host_path)?;

    let original = match fs::read_to_string(&host_path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let updated = update_project_permission_config_text(&original, &input)?;

    write_permission_config_file(&host_path, &updated)?;

    Ok(WriteProjectPermissionConfigOutput {
        file_path: input.file_path,
    })
}

fn write_permission_config_file(path: &Path, contents: &str) -> AppResult<()> {
    match fs::OpenOptions::new().write(true).truncate(true).open(path) {
        Ok(mut file) => {
            file.write_all(contents.as_bytes())?;
            Ok(())
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            match fs::OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut file) => {
                    file.write_all(contents.as_bytes())?;
                    Ok(())
                }
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                    let mut file = fs::OpenOptions::new().write(true).truncate(true).open(path)?;
                    file.write_all(contents.as_bytes())?;
                    Ok(())
                }
                Err(error) => Err(error.into()),
            }
        }
        Err(error) => Err(error.into()),
    }
}

fn validate_project_config_path(path: &Path) -> AppResult<()> {
    let file_name = path.file_name().and_then(|value| value.to_str());
    let parent_name = path
        .parent()
        .and_then(|parent| parent.file_name())
        .and_then(|value| value.to_str());

    if file_name != Some("config.toml") || parent_name != Some(".codex") {
        return Err(AppError::InvalidInput(
            "项目配置只能写入工作区 .codex/config.toml".to_string(),
        ));
    }
    Ok(())
}

fn update_project_permission_config_text(
    toml_str: &str,
    input: &WriteProjectPermissionConfigInput,
) -> AppResult<String> {
    let mut doc = toml_str
        .parse::<DocumentMut>()
        .map_err(|error| AppError::InvalidInput(format!("config.toml 解析失败: {error}")))?;

    if let Some(approval_policy) = input.approval_policy.as_deref() {
        validate_approval_policy(approval_policy)?;
        doc[APPROVAL_POLICY_KEY] = toml_edit::value(approval_policy);
    }

    if let Some(sandbox_mode) = input.sandbox_mode.as_deref() {
        validate_sandbox_mode(sandbox_mode)?;
        doc[SANDBOX_MODE_KEY] = toml_edit::value(sandbox_mode);
    }

    if let Some(network_access) = input.network_access {
        let workspace_write = ensure_child_table(doc.as_table_mut(), SANDBOX_WORKSPACE_WRITE_KEY);
        workspace_write[NETWORK_ACCESS_KEY] = toml_edit::value(network_access);
    }

    Ok(doc.to_string())
}

fn validate_approval_policy(value: &str) -> AppResult<()> {
    match value {
        "untrusted" | "on-failure" | "on-request" | "never" => Ok(()),
        _ => Err(AppError::InvalidInput(format!(
            "不支持的 approval_policy: {value}"
        ))),
    }
}

fn validate_sandbox_mode(value: &str) -> AppResult<()> {
    match value {
        "read-only" | "workspace-write" | "danger-full-access" => Ok(()),
        _ => Err(AppError::InvalidInput(format!(
            "不支持的 sandbox_mode: {value}"
        ))),
    }
}

fn ensure_child_table<'a>(parent: &'a mut Table, key: &str) -> &'a mut Table {
    let item = parent
        .entry(key)
        .or_insert_with(|| Item::Table(Table::new()));
    if !item.is_table_like() {
        *item = Item::Table(Table::new());
    }
    item.as_table_mut().expect("item was normalized to a table")
}

#[cfg(test)]
mod tests {
    use crate::models::{AgentEnvironment, WriteProjectPermissionConfigInput};

    use super::{update_project_permission_config_text, write_permission_config_file};

    fn input() -> WriteProjectPermissionConfigInput {
        WriteProjectPermissionConfigInput {
            agent_environment: AgentEnvironment::WindowsNative,
            file_path: "E:/code/project/.codex/config.toml".to_string(),
            approval_policy: Some("never".to_string()),
            sandbox_mode: Some("workspace-write".to_string()),
            network_access: Some(true),
        }
    }

    #[test]
    fn updates_only_permission_keys() {
        let output = update_project_permission_config_text(
            r#"
model = "gpt-5.2"
approval_policy = "on-request"

[sandbox_workspace_write]
writable_roots = ["E:/tmp"]
network_access = false
"#,
            &input(),
        )
        .expect("updated config");

        let parsed: toml::Value = toml::from_str(&output).expect("valid TOML");
        assert_eq!(parsed["model"].as_str(), Some("gpt-5.2"));
        assert_eq!(parsed["approval_policy"].as_str(), Some("never"));
        assert_eq!(parsed["sandbox_mode"].as_str(), Some("workspace-write"));
        assert_eq!(
            parsed["sandbox_workspace_write"]["writable_roots"]
                .as_array()
                .expect("writable roots")
                .len(),
            1
        );
        assert_eq!(
            parsed["sandbox_workspace_write"]["network_access"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn rejects_unknown_permission_values() {
        let mut bad = input();
        bad.sandbox_mode = Some("root".to_string());
        let error = update_project_permission_config_text("", &bad)
            .expect_err("invalid sandbox mode should fail");

        assert!(error.to_string().contains("不支持的 sandbox_mode"));
    }

    #[test]
    fn overwrites_existing_project_config_file() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "codex-app-plus-permission-config-{unique}"
        ));
        let config_path = root.join(".codex").join("config.toml");

        write_permission_config_file(&config_path, "approval_policy = \"on-request\"\n")
            .expect("create config");
        write_permission_config_file(&config_path, "approval_policy = \"never\"\n")
            .expect("overwrite config");

        let output = std::fs::read_to_string(config_path).expect("read config");
        assert_eq!(output, "approval_policy = \"never\"\n");
        let _ = std::fs::remove_dir_all(root);
    }
}
