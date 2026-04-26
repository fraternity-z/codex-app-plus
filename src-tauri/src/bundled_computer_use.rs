use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use toml_edit::{DocumentMut, Item, Table};

use crate::agent_environment::resolve_codex_home_relative_path;
use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;

const MODULE_RESOURCE_PATH: &str = "bundled/computer-use-windows";
const MARKETPLACE_NAME: &str = "codex-app-plus-bundled";
const PLUGIN_ID: &str = "computer-use@codex-app-plus-bundled";
const PLUGIN_RELATIVE_PATH: &str = "plugins/computer-use";
const USER_CONFIG_PATH: &str = ".codex/config.toml";

pub fn ensure_registered(app: &AppHandle, agent_environment: AgentEnvironment) -> AppResult<()> {
    if agent_environment != AgentEnvironment::WindowsNative {
        return Ok(());
    }

    let source_root = resolve_module_source_root(app)?;
    let plugin_version = read_plugin_version(&source_root)?;
    let install_root = install_root(&plugin_version)?;
    materialize_module(&source_root, &install_root)?;

    let config_path = resolve_codex_home_relative_path(agent_environment, USER_CONFIG_PATH)?;
    register_marketplace_in_config(&config_path.host_path, &install_root)
}

fn resolve_module_source_root(app: &AppHandle) -> AppResult<PathBuf> {
    let resource_candidate = app.path().resource_dir()?.join(MODULE_RESOURCE_PATH);
    if is_module_root(&resource_candidate) {
        return Ok(resource_candidate);
    }

    let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(MODULE_RESOURCE_PATH);
    if is_module_root(&dev_candidate) {
        return Ok(dev_candidate);
    }

    Err(AppError::InvalidInput(format!(
        "Bundled Computer Use module is missing: {}",
        dev_candidate.display()
    )))
}

fn is_module_root(path: &Path) -> bool {
    path.join(".agents/plugins/marketplace.json").is_file()
        && path.join(PLUGIN_RELATIVE_PATH).join(".codex-plugin/plugin.json").is_file()
        && path.join(PLUGIN_RELATIVE_PATH).join(".mcp.json").is_file()
        && path
            .join(PLUGIN_RELATIVE_PATH)
            .join("open-computer-use.exe")
            .is_file()
}

fn read_plugin_version(module_root: &Path) -> AppResult<String> {
    let manifest_path = module_root
        .join(PLUGIN_RELATIVE_PATH)
        .join(".codex-plugin/plugin.json");
    let text = fs::read_to_string(&manifest_path)?;
    let value: serde_json::Value = serde_json::from_str(&text)?;
    value
        .get("version")
        .and_then(|version| version.as_str())
        .filter(|version| !version.trim().is_empty())
        .map(|version| version.trim().to_string())
        .ok_or_else(|| {
            AppError::InvalidInput(format!(
                "Computer Use plugin manifest is missing version: {}",
                manifest_path.display()
            ))
        })
}

fn install_root(plugin_version: &str) -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data
        .join("CodexAppPlus")
        .join("bundled-plugins")
        .join("computer-use-windows")
        .join(plugin_version))
}

fn materialize_module(source_root: &Path, install_root: &Path) -> AppResult<()> {
    if is_module_root(install_root) {
        return Ok(());
    }
    if install_root.exists() {
        fs::remove_dir_all(install_root)?;
    }
    copy_directory(source_root, install_root)
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

fn register_marketplace_in_config(config_path: &Path, marketplace_root: &Path) -> AppResult<()> {
    let original = match fs::read_to_string(config_path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let updated = update_config(&original, marketplace_root)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(config_path, updated)?;
    Ok(())
}

fn update_config(toml_str: &str, marketplace_root: &Path) -> AppResult<String> {
    let mut doc = toml_str
        .parse::<DocumentMut>()
        .map_err(|error| AppError::InvalidInput(format!("config.toml 解析失败: {error}")))?;

    let root = doc.as_table_mut();
    let marketplaces = ensure_child_table(root, "marketplaces");
    let marketplace = ensure_child_table(marketplaces, MARKETPLACE_NAME);
    marketplace["source_type"] = toml_edit::value("local");
    marketplace["source"] = toml_edit::value(normalize_path_for_toml(marketplace_root));

    let plugins = ensure_child_table(root, "plugins");
    let plugin = ensure_child_table(plugins, PLUGIN_ID);
    plugin["enabled"] = toml_edit::value(true);

    Ok(doc.to_string())
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

fn normalize_path_for_toml(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::{update_config, MARKETPLACE_NAME, PLUGIN_ID};

    #[test]
    fn update_config_adds_bundled_marketplace_and_plugin() {
        let updated = update_config(
            "model = \"gpt-5.4\"\n",
            std::path::Path::new(r"C:\Users\me\AppData\Local\CodexAppPlus\bundled-plugins\computer-use-windows"),
        )
        .expect("update config");

        assert!(updated.contains("[marketplaces.codex-app-plus-bundled]"));
        assert!(updated.contains("source_type = \"local\""));
        assert!(
            updated.contains("source = \"C:/Users/me/AppData/Local/CodexAppPlus/bundled-plugins/computer-use-windows\"")
        );
        assert!(updated.contains("[plugins.\"computer-use@codex-app-plus-bundled\"]"));
        assert!(updated.contains("enabled = true"));
    }

    #[test]
    fn update_config_replaces_conflicting_non_table_sections() {
        let updated = update_config(
            "marketplaces = \"bad\"\nplugins = \"bad\"\n",
            std::path::Path::new(r"C:\bundle"),
        )
        .expect("update config");

        assert!(updated.contains(&format!("[marketplaces.{MARKETPLACE_NAME}]")));
        assert!(updated.contains(&format!("[plugins.\"{PLUGIN_ID}\"]")));
    }
}
