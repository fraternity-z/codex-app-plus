use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use toml_edit::{DocumentMut, Item, Table};

use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::resolve_codex_home_relative_path;
use crate::models::AgentEnvironment;

const MODULE_RESOURCE_PATH: &str = "bundled/computer-use-windows";
const MARKETPLACE_NAME: &str = "codex-app-plus-bundled";
const PLUGIN_NAME: &str = "computer-use";
const PLUGIN_ID: &str = "computer-use@codex-app-plus-bundled";
const PLUGIN_RELATIVE_PATH: &str = "plugins/computer-use";
const APP_POLICY_CONFIG_PATH: &str = "computer-use/config.toml";
const USER_CONFIG_PATH: &str = ".codex/config.toml";
const DEFAULT_APP_POLICY_CONFIG: &str = r#"# Windows Computer Use app access policy.
# Leave allowed empty to permit visible apps except entries in denied.
# Set require_approvals = true to block unlisted apps until they are added to allowed.
# Add process names without ".exe", for example: allowed = ["notepad", "code"]
# High-risk local apps are blocked by default because they can expose secrets or cause hard-to-undo system changes.
[apps]
require_approvals = false
allowed = []
denied = ["powershell", "pwsh", "cmd", "wt", "windowsterminal", "conhost", "diskmgmt", "diskpart", "format", "mmc", "compmgmt", "regedit", "regedt32", "taskmgr", "credentialuibroker", "1password", "bitwarden", "keepass", "keepassxc", "lastpass", "dashlane", "enpass", "nordpass", "protonpass"]
"#;

pub fn ensure_registered(app: &AppHandle, agent_environment: AgentEnvironment) -> AppResult<()> {
    if agent_environment != AgentEnvironment::WindowsNative {
        return Ok(());
    }

    let source_root = resolve_module_source_root(app)?;
    let plugin_version = read_plugin_version(&source_root)?;
    let install_root = install_root(&plugin_version)?;
    materialize_module(&source_root, &install_root)?;

    let config_path = resolve_codex_home_relative_path(agent_environment, USER_CONFIG_PATH)?;
    let codex_home = config_path.host_path.parent().ok_or_else(|| {
        AppError::InvalidInput(format!(
            "无法解析 Codex home: {}",
            config_path.host_path.display()
        ))
    })?;
    ensure_app_policy_config(codex_home)?;
    let plugin_cache_root = plugin_cache_root(codex_home, &plugin_version);
    materialize_plugin_cache(&install_root, &plugin_cache_root)?;
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
        && is_plugin_root(&path.join(PLUGIN_RELATIVE_PATH))
}

fn is_plugin_root(path: &Path) -> bool {
    path.join(".codex-plugin/plugin.json").is_file()
        && path.join(".mcp.json").is_file()
        && path.join("skills/computer-use/SKILL.md").is_file()
        && path.join("open-computer-use.exe").is_file()
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
        let Some(parent) = install_root.parent() else {
            return Err(AppError::InvalidInput(format!(
                "无法安全清理 Computer Use 模块安装目录: {}",
                install_root.display()
            )));
        };
        remove_directory(install_root, parent, "清理 Computer Use 模块安装目录失败")?;
    }
    copy_directory(source_root, install_root)
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
            "Bundled Computer Use plugin is missing: {}",
            plugin_source_root.display()
        )));
    }

    if plugin_cache_root.exists() {
        let Some(parent) = plugin_cache_root.parent() else {
            return Err(AppError::InvalidInput(format!(
                "无法安全清理 Computer Use 插件缓存目录: {}",
                plugin_cache_root.display()
            )));
        };
        remove_directory(
            plugin_cache_root,
            parent,
            "清理 Computer Use 插件缓存目录失败",
        )?;
    }

    copy_directory(&plugin_source_root, plugin_cache_root)
}

fn ensure_app_policy_config(codex_home: &Path) -> AppResult<()> {
    let config_path = codex_home.join(APP_POLICY_CONFIG_PATH);
    if config_path.exists() {
        return Ok(());
    }
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(config_path, DEFAULT_APP_POLICY_CONFIG)?;
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    fs::create_dir_all(destination).map_err(|error| {
        AppError::Io(format!("创建目录 {} 失败: {error}", destination.display()))
    })?;
    for entry in fs::read_dir(source)
        .map_err(|error| AppError::Io(format!("读取目录 {} 失败: {error}", source.display())))?
    {
        let entry = entry.map_err(|error| {
            AppError::Io(format!("读取目录项 {} 失败: {error}", source.display()))
        })?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| {
            AppError::Io(format!(
                "读取文件类型 {} 失败: {error}",
                source_path.display()
            ))
        })?;
        if file_type.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    AppError::Io(format!("创建目录 {} 失败: {error}", parent.display()))
                })?;
            }
            fs::copy(&source_path, &destination_path).map_err(|error| {
                AppError::Io(format!(
                    "复制 {} 到 {} 失败: {error}",
                    source_path.display(),
                    destination_path.display()
                ))
            })?;
        } else if file_type.is_symlink() {
            return Err(AppError::InvalidInput(format!(
                "Computer Use 模块不能包含符号链接: {}",
                source_path.display()
            )));
        }
    }
    Ok(())
}

fn remove_directory(path: &Path, expected_parent: &Path, context: &str) -> AppResult<()> {
    let canonical_path = fs::canonicalize(path)
        .map_err(|error| AppError::Io(format!("{context}: {}: {error}", path.display())))?;
    let canonical_parent = fs::canonicalize(expected_parent).map_err(|error| {
        AppError::Io(format!("{context}: {}: {error}", expected_parent.display()))
    })?;

    if canonical_path == canonical_parent || !canonical_path.starts_with(&canonical_parent) {
        return Err(AppError::InvalidInput(format!(
            "{context}: refusing to remove path outside expected parent: {}",
            path.display()
        )));
    }

    fs::remove_dir_all(&canonical_path)
        .map_err(|error| AppError::Io(format!("{context}: {}: {error}", path.display())))
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
        ensure_app_policy_config, materialize_plugin_cache, plugin_cache_root, remove_directory,
        update_config, MARKETPLACE_NAME, PLUGIN_ID,
    };
    use std::fs;

    #[test]
    fn update_config_adds_bundled_marketplace_and_plugin() {
        let updated = update_config(
            "model = \"gpt-5.4\"\n",
            std::path::Path::new(
                r"C:\Users\me\AppData\Local\CodexAppPlus\bundled-plugins\computer-use-windows",
            ),
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

    #[test]
    fn plugin_cache_root_matches_codex_store_layout() {
        let root = plugin_cache_root(std::path::Path::new(r"C:\Users\me\.codex"), "0.1.41");

        assert_eq!(
            root,
            std::path::PathBuf::from(
                r"C:\Users\me\.codex\plugins\cache\codex-app-plus-bundled\computer-use\0.1.41"
            )
        );
    }

    #[test]
    fn ensure_app_policy_config_creates_default_policy_without_overwriting() {
        let root = std::env::temp_dir().join(format!(
            "codex-app-plus-computer-use-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);

        ensure_app_policy_config(&root).expect("create policy config");
        let config_path = root.join("computer-use/config.toml");
        let created = fs::read_to_string(&config_path).expect("read created config");
        assert!(created.contains("[apps]"));
        assert!(created.contains("require_approvals = false"));
        assert!(created.contains("allowed = []"));
        assert!(created.contains("\"powershell\""));
        assert!(created.contains("\"diskmgmt\""));
        assert!(created.contains("\"bitwarden\""));

        fs::write(&config_path, "[apps]\nallowed = [\"notepad\"]\n").expect("write custom config");
        ensure_app_policy_config(&root).expect("preserve policy config");
        let preserved = fs::read_to_string(&config_path).expect("read preserved config");
        assert!(preserved.contains("notepad"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn remove_directory_refuses_to_delete_expected_parent() {
        let root = std::env::temp_dir().join(format!(
            "codex-app-plus-computer-use-remove-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create root");

        let result = remove_directory(&root, &root, "test remove");

        assert!(result.is_err());
        assert!(root.is_dir());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn materialize_plugin_cache_keeps_existing_version_siblings() {
        let root = std::env::temp_dir().join(format!(
            "codex-app-plus-computer-use-cache-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let marketplace_root = root.join("marketplace");
        let plugin_source = marketplace_root.join("plugins/computer-use");
        create_minimal_plugin_root(&plugin_source);

        let cache_base = root.join(".codex/plugins/cache/codex-app-plus-bundled/computer-use");
        let old_version = cache_base.join("0.1.38");
        create_minimal_plugin_root(&old_version);
        let new_version = cache_base.join("0.1.41");

        materialize_plugin_cache(&marketplace_root, &new_version).expect("copy plugin cache");

        assert!(old_version.join("open-computer-use.exe").is_file());
        assert!(new_version.join("open-computer-use.exe").is_file());

        fs::remove_dir_all(root).expect("cleanup");
    }

    fn create_minimal_plugin_root(path: &std::path::Path) {
        fs::create_dir_all(path.join(".codex-plugin")).expect("create plugin dir");
        fs::write(path.join(".codex-plugin/plugin.json"), "{}").expect("write manifest");
        fs::write(path.join(".mcp.json"), "{}").expect("write mcp config");
        fs::create_dir_all(path.join("skills/computer-use")).expect("create skill dir");
        fs::write(
            path.join("skills/computer-use/SKILL.md"),
            "---\nname: computer-use\n---\n",
        )
        .expect("write skill");
        fs::write(path.join("open-computer-use.exe"), "fake exe").expect("write executable");
    }
}
