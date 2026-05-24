use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use toml_edit::{Array, DocumentMut, Item, Table, Value};

use super::models::{ComputerUseAppInput, ComputerUseAppKind, ComputerUseSettingsOutput};
use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::resolve_codex_home_relative_path;
use crate::models::AgentEnvironment;

const USER_COMPUTER_USE_CONFIG_PATH: &str = ".codex/computer-use/config.toml";
const MAX_APP_IDENTIFIER_CHARS: usize = 120;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ComputerUsePolicyConfig {
    allowed_apps: Vec<String>,
    denied_apps: Vec<String>,
}

pub fn read_computer_use_settings() -> AppResult<ComputerUseSettingsOutput> {
    let path = computer_use_config_path()?;
    read_computer_use_settings_at(&path)
}

pub fn add_computer_use_app(input: ComputerUseAppInput) -> AppResult<ComputerUseSettingsOutput> {
    let path = computer_use_config_path()?;
    add_computer_use_app_at(&path, input)
}

pub fn remove_computer_use_app(input: ComputerUseAppInput) -> AppResult<ComputerUseSettingsOutput> {
    let path = computer_use_config_path()?;
    remove_computer_use_app_at(&path, input)
}

fn computer_use_config_path() -> AppResult<PathBuf> {
    Ok(resolve_codex_home_relative_path(
        AgentEnvironment::WindowsNative,
        USER_COMPUTER_USE_CONFIG_PATH,
    )?
    .host_path)
}

fn read_computer_use_settings_at(path: &Path) -> AppResult<ComputerUseSettingsOutput> {
    let text = read_config_text(path)?;
    let config = parse_policy_config(&text)?;
    Ok(settings_from_config(path, config))
}

fn add_computer_use_app_at(
    path: &Path,
    input: ComputerUseAppInput,
) -> AppResult<ComputerUseSettingsOutput> {
    mutate_computer_use_config(path, input, AppListMutation::Add)
}

fn remove_computer_use_app_at(
    path: &Path,
    input: ComputerUseAppInput,
) -> AppResult<ComputerUseSettingsOutput> {
    mutate_computer_use_config(path, input, AppListMutation::Remove)
}

enum AppListMutation {
    Add,
    Remove,
}

fn mutate_computer_use_config(
    path: &Path,
    input: ComputerUseAppInput,
    mutation: AppListMutation,
) -> AppResult<ComputerUseSettingsOutput> {
    let text = read_config_text(path)?;
    let app = normalize_app_identifier(&input.app)?;
    let updated = update_config_text(&text, input.kind, &app, mutation)?;
    write_config_text(path, &updated)?;
    read_computer_use_settings_at(path)
}

fn read_config_text(path: &Path) -> AppResult<String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}

fn write_config_text(path: &Path, text: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, text)?;
    Ok(())
}

fn update_config_text(
    text: &str,
    kind: ComputerUseAppKind,
    app: &str,
    mutation: AppListMutation,
) -> AppResult<String> {
    let mut doc = parse_document(text)?;
    let mut config = parse_policy_config(text)?;

    match mutation {
        AppListMutation::Add => add_app_to_config(&mut config, kind, app),
        AppListMutation::Remove => remove_app_from_config(&mut config, kind, app),
    }

    let apps_table = ensure_child_table(doc.as_table_mut(), "apps");
    apps_table["allowed"] = string_array_item(&config.allowed_apps);
    apps_table["denied"] = string_array_item(&config.denied_apps);

    Ok(doc.to_string())
}

fn parse_document(text: &str) -> AppResult<DocumentMut> {
    text.parse::<DocumentMut>().map_err(|error| {
        AppError::InvalidInput(format!("computer-use/config.toml 解析失败: {error}"))
    })
}

fn parse_policy_config(text: &str) -> AppResult<ComputerUsePolicyConfig> {
    if text.trim().is_empty() {
        return Ok(ComputerUsePolicyConfig::default());
    }

    let value = toml::from_str::<toml::Value>(text).map_err(|error| {
        AppError::InvalidInput(format!("computer-use/config.toml 解析失败: {error}"))
    })?;
    let apps = value.get("apps");
    Ok(ComputerUsePolicyConfig {
        allowed_apps: parse_app_list(apps.and_then(|item| item.get("allowed"))),
        denied_apps: parse_app_list(apps.and_then(|item| item.get("denied"))),
    })
}

fn parse_app_list(value: Option<&toml::Value>) -> Vec<String> {
    let Some(values) = value.and_then(toml::Value::as_array) else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for value in values {
        let Some(raw) = value.as_str() else {
            continue;
        };
        let Ok(normalized) = normalize_app_identifier(raw) else {
            continue;
        };
        if !result.iter().any(|item| item == &normalized) {
            result.push(normalized);
        }
    }
    result
}

fn settings_from_config(path: &Path, config: ComputerUsePolicyConfig) -> ComputerUseSettingsOutput {
    ComputerUseSettingsOutput {
        config_path: path.display().to_string(),
        allowed_apps: config.allowed_apps,
        denied_apps: config.denied_apps,
    }
}

fn add_app_to_config(config: &mut ComputerUsePolicyConfig, kind: ComputerUseAppKind, app: &str) {
    let (target, opposite) = app_lists_mut(config, kind);
    if !target.iter().any(|value| value == app) {
        target.push(app.to_string());
    }
    opposite.retain(|value| value != app);
}

fn remove_app_from_config(
    config: &mut ComputerUsePolicyConfig,
    kind: ComputerUseAppKind,
    app: &str,
) {
    let (target, _) = app_lists_mut(config, kind);
    target.retain(|value| value != app);
}

fn app_lists_mut(
    config: &mut ComputerUsePolicyConfig,
    kind: ComputerUseAppKind,
) -> (&mut Vec<String>, &mut Vec<String>) {
    match kind {
        ComputerUseAppKind::Allowed => (&mut config.allowed_apps, &mut config.denied_apps),
        ComputerUseAppKind::Denied => (&mut config.denied_apps, &mut config.allowed_apps),
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

fn string_array_item(values: &[String]) -> Item {
    let mut array = Array::default();
    for value in values {
        array.push(value.as_str());
    }
    Item::Value(Value::Array(array))
}

fn normalize_app_identifier(value: &str) -> AppResult<String> {
    let mut normalized = value
        .trim()
        .trim_matches(&['"', '\''][..])
        .replace('\\', "/");
    if let Some(file_name) = normalized.rsplit('/').next() {
        normalized = file_name.trim().to_string();
    }
    if normalized.to_ascii_lowercase().ends_with(".exe") {
        normalized.truncate(normalized.len() - 4);
    }
    normalized = normalized.trim().to_ascii_lowercase();

    if normalized.is_empty() {
        return Err(AppError::InvalidInput("应用名称不能为空".to_string()));
    }
    if normalized.chars().count() > MAX_APP_IDENTIFIER_CHARS {
        return Err(AppError::InvalidInput(format!(
            "应用名称不能超过 {MAX_APP_IDENTIFIER_CHARS} 个字符"
        )));
    }
    if normalized.chars().any(char::is_control) {
        return Err(AppError::InvalidInput(
            "应用名称不能包含控制字符".to_string(),
        ));
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_app_identifier, parse_policy_config, update_config_text, AppListMutation,
    };
    use crate::models::ComputerUseAppKind;

    #[test]
    fn normalizes_process_names_and_paths() {
        let normalized =
            normalize_app_identifier(r#" C:\Program Files\Notepad.EXE "#).expect("app name");

        assert_eq!(normalized, "notepad");
    }

    #[test]
    fn parses_and_deduplicates_app_policy_lists() {
        let config = parse_policy_config(
            r#"
[apps]
allowed = ["Code.exe", "code", ""]
denied = ["powershell.exe", 3, "notepad"]
"#,
        )
        .expect("config");

        assert_eq!(config.allowed_apps, vec!["code"]);
        assert_eq!(config.denied_apps, vec!["powershell", "notepad"]);
    }

    #[test]
    fn adding_app_moves_it_from_opposite_list() {
        let updated = update_config_text(
            r#"
[apps]
allowed = []
denied = ["notepad", "powershell"]
"#,
            ComputerUseAppKind::Allowed,
            "notepad",
            AppListMutation::Add,
        )
        .expect("update config");

        let config = parse_policy_config(&updated).expect("updated config");
        assert_eq!(config.allowed_apps, vec!["notepad"]);
        assert_eq!(config.denied_apps, vec!["powershell"]);
    }

    #[test]
    fn removing_app_updates_selected_list_only() {
        let updated = update_config_text(
            r#"
[apps]
allowed = ["code"]
denied = ["powershell"]
"#,
            ComputerUseAppKind::Denied,
            "powershell",
            AppListMutation::Remove,
        )
        .expect("update config");

        let config = parse_policy_config(&updated).expect("updated config");
        assert_eq!(config.allowed_apps, vec!["code"]);
        assert!(config.denied_apps.is_empty());
    }
}
