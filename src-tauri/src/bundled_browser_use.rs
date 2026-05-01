use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::json;
use tauri::{AppHandle, Manager};
use toml_edit::{DocumentMut, Item, Table};

use crate::agent_environment::resolve_codex_home_relative_path;
use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;

const RESOURCE_MARKETPLACE_PATH: &str = "bundled/openai-bundled";
const DEV_MARKETPLACE_PATH: &str = "bundled/openai-bundled";
const ENV_PLUGIN_SOURCE: &str = "CODEX_BROWSER_USE_PLUGIN_SOURCE";
const MARKETPLACE_NAME: &str = "openai-bundled";
const PLUGIN_NAME: &str = "browser-use";
const PLUGIN_ID: &str = "browser-use@openai-bundled";
const PLUGIN_RELATIVE_PATH: &str = "plugins/browser-use";
const TMP_MARKETPLACE_PATH: &str = ".codex/.tmp/bundled-marketplaces/openai-bundled";
const USER_CONFIG_PATH: &str = ".codex/config.toml";
const NODE_REPL_MCP_SCRIPT: &str =
    include_str!("../bundled/browser-use-node-repl/node-repl-mcp.mjs");
const NODE_REPL_MCP_CONFIG: &str = r#"{
  "mcpServers": {
    "node_repl": {
      "command": "node",
      "args": ["--no-warnings", "--experimental-vm-modules", "./scripts/node-repl-mcp.mjs"],
      "cwd": "."
    }
  }
}
"#;

pub fn ensure_registered(app: &AppHandle, agent_environment: AgentEnvironment) -> AppResult<()> {
    if agent_environment != AgentEnvironment::WindowsNative {
        return Ok(());
    }

    let config_path = resolve_codex_home_relative_path(agent_environment, USER_CONFIG_PATH)?;
    let codex_home = config_path.host_path.parent().ok_or_else(|| {
        AppError::InvalidInput(format!(
            "无法解析 Codex home: {}",
            config_path.host_path.display()
        ))
    })?;

    let Some(source_root) = resolve_official_plugin_root(app, agent_environment, codex_home)?
    else {
        eprintln!(
            "OpenAI Browser Use plugin source not found; skipping Browser Use plugin registration"
        );
        return Ok(());
    };

    let plugin_version = read_plugin_version(&source_root)?;
    let install_root = install_root(&plugin_version)?;
    materialize_marketplace(&source_root, &install_root)?;
    augment_plugin_for_node_repl(&install_root.join(PLUGIN_RELATIVE_PATH))?;

    let plugin_cache_root = plugin_cache_root(codex_home, &plugin_version);
    materialize_plugin_cache(&install_root, &plugin_cache_root)?;
    augment_plugin_for_node_repl(&plugin_cache_root)?;
    register_marketplace_in_config(&config_path.host_path, &install_root)
}

fn resolve_official_plugin_root(
    app: &AppHandle,
    agent_environment: AgentEnvironment,
    codex_home: &Path,
) -> AppResult<Option<PathBuf>> {
    if let Ok(source) = std::env::var(ENV_PLUGIN_SOURCE) {
        if let Some(plugin_root) = normalize_plugin_source(PathBuf::from(source)) {
            return Ok(Some(plugin_root));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_candidate = resource_dir.join(RESOURCE_MARKETPLACE_PATH);
        if let Some(plugin_root) = normalize_plugin_source(resource_candidate) {
            return Ok(Some(plugin_root));
        }
    }

    let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(DEV_MARKETPLACE_PATH);
    if let Some(plugin_root) = normalize_plugin_source(dev_candidate) {
        return Ok(Some(plugin_root));
    }

    let tmp_candidate =
        resolve_codex_home_relative_path(agent_environment, TMP_MARKETPLACE_PATH)?.host_path;
    if let Some(plugin_root) = normalize_plugin_source(tmp_candidate) {
        return Ok(Some(plugin_root));
    }

    find_cached_plugin_root(codex_home)
}

fn normalize_plugin_source(path: PathBuf) -> Option<PathBuf> {
    if is_plugin_root(&path) {
        return Some(path);
    }

    let marketplace_plugin_root = path.join(PLUGIN_RELATIVE_PATH);
    if is_plugin_root(&marketplace_plugin_root) {
        return Some(marketplace_plugin_root);
    }

    None
}

fn find_cached_plugin_root(codex_home: &Path) -> AppResult<Option<PathBuf>> {
    let plugin_base = codex_home
        .join("plugins")
        .join("cache")
        .join(MARKETPLACE_NAME)
        .join(PLUGIN_NAME);

    let entries = match fs::read_dir(&plugin_base) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    let mut candidates = Vec::new();
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            candidates.push(entry.path());
        }
    }
    candidates.sort();
    candidates.reverse();

    Ok(candidates.into_iter().find(|path| is_plugin_root(path)))
}

fn is_marketplace_root(path: &Path) -> bool {
    path.join(".agents/plugins/marketplace.json").is_file()
        && is_plugin_root(&path.join(PLUGIN_RELATIVE_PATH))
}

fn is_plugin_root(path: &Path) -> bool {
    path.join(".codex-plugin/plugin.json").is_file()
        && path.join("skills/browser/SKILL.md").is_file()
        && path.join("scripts/browser-client.mjs").is_file()
}

fn read_plugin_version(plugin_root: &Path) -> AppResult<String> {
    let manifest_path = plugin_root.join(".codex-plugin/plugin.json");
    let text = fs::read_to_string(&manifest_path)?;
    let value: serde_json::Value = serde_json::from_str(&text)?;
    value
        .get("version")
        .and_then(|version| version.as_str())
        .filter(|version| !version.trim().is_empty())
        .map(|version| version.trim().to_string())
        .ok_or_else(|| {
            AppError::InvalidInput(format!(
                "Browser Use plugin manifest is missing version: {}",
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
        .join(MARKETPLACE_NAME)
        .join(PLUGIN_NAME)
        .join(plugin_version))
}

fn materialize_marketplace(plugin_source_root: &Path, install_root: &Path) -> AppResult<()> {
    if is_marketplace_root(install_root) {
        return Ok(());
    }
    if install_root.exists() {
        fs::remove_dir_all(install_root)?;
    }

    let plugin_destination = install_root.join(PLUGIN_RELATIVE_PATH);
    copy_directory(plugin_source_root, &plugin_destination)?;
    write_marketplace_manifest(install_root)
}

fn write_marketplace_manifest(marketplace_root: &Path) -> AppResult<()> {
    let manifest_path = marketplace_root.join(".agents/plugins/marketplace.json");
    if let Some(parent) = manifest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let manifest = json!({
        "name": MARKETPLACE_NAME,
        "interface": {
            "displayName": "OpenAI Bundled"
        },
        "plugins": [
            {
                "name": PLUGIN_NAME,
                "source": {
                    "source": "local",
                    "path": format!("./{PLUGIN_RELATIVE_PATH}")
                },
                "policy": {
                    "installation": "AVAILABLE",
                    "authentication": "ON_INSTALL"
                },
                "category": "Engineering"
            }
        ]
    });

    let text = serde_json::to_string_pretty(&manifest)?;
    fs::write(manifest_path, format!("{text}\n"))?;
    Ok(())
}

fn plugin_cache_root(codex_home: &Path, plugin_version: &str) -> PathBuf {
    codex_home
        .join("plugins")
        .join("cache")
        .join(MARKETPLACE_NAME)
        .join(PLUGIN_NAME)
        .join(plugin_version)
}

fn materialize_plugin_cache(marketplace_root: &Path, plugin_cache_root: &Path) -> AppResult<()> {
    if is_plugin_root(plugin_cache_root) {
        return Ok(());
    }

    let plugin_source_root = marketplace_root.join(PLUGIN_RELATIVE_PATH);
    if !is_plugin_root(&plugin_source_root) {
        return Err(AppError::InvalidInput(format!(
            "Browser Use plugin is missing: {}",
            plugin_source_root.display()
        )));
    }

    if plugin_cache_root.exists() {
        fs::remove_dir_all(plugin_cache_root)?;
    }

    copy_directory(&plugin_source_root, plugin_cache_root)
}

fn augment_plugin_for_node_repl(plugin_root: &Path) -> AppResult<()> {
    if !is_plugin_root(plugin_root) {
        return Err(AppError::InvalidInput(format!(
            "Browser Use plugin is missing: {}",
            plugin_root.display()
        )));
    }

    write_text_if_changed(&plugin_root.join(".mcp.json"), NODE_REPL_MCP_CONFIG)?;
    write_text_if_changed(
        &plugin_root.join("scripts").join("node-repl-mcp.mjs"),
        NODE_REPL_MCP_SCRIPT,
    )
}

fn write_text_if_changed(path: &Path, text: &str) -> AppResult<()> {
    if matches!(fs::read_to_string(path), Ok(existing) if existing == text) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, text)?;
    Ok(())
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
    use super::{
        augment_plugin_for_node_repl, plugin_cache_root, update_config, MARKETPLACE_NAME, PLUGIN_ID,
    };
    use std::fs;

    #[test]
    fn update_config_adds_openai_bundled_marketplace_and_browser_use_plugin() {
        let updated = update_config(
            "model = \"gpt-5.4\"\n",
            std::path::Path::new(
                r"C:\Users\me\AppData\Local\CodexAppPlus\bundled-plugins\openai-bundled\browser-use\0.1.0-alpha1",
            ),
        )
        .expect("update config");

        assert!(updated.contains("[marketplaces.openai-bundled]"));
        assert!(updated.contains("source_type = \"local\""));
        assert!(
            updated.contains("source = \"C:/Users/me/AppData/Local/CodexAppPlus/bundled-plugins/openai-bundled/browser-use/0.1.0-alpha1\"")
        );
        assert!(updated.contains("[plugins.\"browser-use@openai-bundled\"]"));
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

    #[test]
    fn plugin_cache_root_matches_codex_store_layout() {
        let root = plugin_cache_root(std::path::Path::new(r"C:\Users\me\.codex"), "0.1.0-alpha1");

        assert_eq!(
            root,
            std::path::PathBuf::from(
                r"C:\Users\me\.codex\plugins\cache\openai-bundled\browser-use\0.1.0-alpha1"
            )
        );
    }

    #[test]
    fn augment_plugin_writes_node_repl_mcp_assets() {
        let root = std::env::temp_dir().join(format!(
            "codex-app-plus-browser-use-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let plugin_root = root.join("plugin");
        fs::create_dir_all(plugin_root.join(".codex-plugin")).expect("create manifest dir");
        fs::create_dir_all(plugin_root.join("skills/browser")).expect("create skill dir");
        fs::create_dir_all(plugin_root.join("scripts")).expect("create scripts dir");
        fs::write(
            plugin_root.join(".codex-plugin/plugin.json"),
            r#"{"name":"browser-use","version":"0.1.0-alpha1"}"#,
        )
        .expect("write manifest");
        fs::write(
            plugin_root.join("skills/browser/SKILL.md"),
            "---\nname: browser\n---\n",
        )
        .expect("write skill");
        fs::write(
            plugin_root.join("scripts/browser-client.mjs"),
            "export {};\n",
        )
        .expect("write browser client");

        augment_plugin_for_node_repl(&plugin_root).expect("augment plugin");

        let mcp_json = fs::read_to_string(plugin_root.join(".mcp.json")).expect("read mcp json");
        assert!(mcp_json.contains("\"node_repl\""));
        assert!(mcp_json.contains("--experimental-vm-modules"));

        let script = fs::read_to_string(plugin_root.join("scripts/node-repl-mcp.mjs"))
            .expect("read node repl script");
        assert!(script.contains("SourceTextModule"));

        fs::remove_dir_all(root).expect("cleanup");
    }
}
