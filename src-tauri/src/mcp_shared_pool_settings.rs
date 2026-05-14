use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{
    AgentEnvironment, McpSharedPoolSettings, ReadMcpSharedPoolSettingsInput,
    ReadMcpSharedPoolSettingsOutput, UpdateMcpSharedPoolSettingsInput,
    UpdateMcpSharedPoolSettingsOutput,
};

const APP_DIRECTORY: &str = "CodexAppPlus";
const STORE_FILE_NAME: &str = "mcp-shared-pool-settings.json";
const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpSharedPoolSettingsStore {
    version: u32,
    windows_native: McpSharedPoolSettings,
    wsl: McpSharedPoolSettings,
}

impl Default for McpSharedPoolSettingsStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            windows_native: McpSharedPoolSettings::default(),
            wsl: McpSharedPoolSettings::default(),
        }
    }
}

pub fn read_mcp_shared_pool_settings(
    input: ReadMcpSharedPoolSettingsInput,
) -> AppResult<ReadMcpSharedPoolSettingsOutput> {
    Ok(ReadMcpSharedPoolSettingsOutput {
        settings: load_mcp_shared_pool_settings(input.agent_environment)?,
    })
}

pub fn write_mcp_shared_pool_settings(
    input: UpdateMcpSharedPoolSettingsInput,
) -> AppResult<UpdateMcpSharedPoolSettingsOutput> {
    let settings = input.settings;
    let path = store_path()?;
    let mut store = read_store(&path)?;
    *select_settings_slot_mut(&mut store, input.agent_environment) = settings.clone();
    write_store(&path, &store)?;
    Ok(UpdateMcpSharedPoolSettingsOutput { settings })
}

pub(crate) fn load_mcp_shared_pool_settings(
    agent_environment: AgentEnvironment,
) -> AppResult<McpSharedPoolSettings> {
    let path = store_path()?;
    let store = read_store(&path)?;
    Ok(select_settings_slot(&store, agent_environment).clone())
}

fn read_store(path: &Path) -> AppResult<McpSharedPoolSettingsStore> {
    if !path.exists() {
        return Ok(McpSharedPoolSettingsStore::default());
    }

    let text = fs::read_to_string(path)?;
    let store = serde_json::from_str::<McpSharedPoolSettingsStore>(&text)?;
    normalize_store(store)
}

fn write_store(path: &Path, store: &McpSharedPoolSettingsStore) -> AppResult<()> {
    let store = normalize_store(store.clone())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(&store)?)?;
    Ok(())
}

fn normalize_store(store: McpSharedPoolSettingsStore) -> AppResult<McpSharedPoolSettingsStore> {
    if store.version != STORE_VERSION {
        return Err(AppError::InvalidInput(
            "不支持的 MCP 共享池设置存储版本".to_string(),
        ));
    }
    Ok(store)
}

fn select_settings_slot(
    store: &McpSharedPoolSettingsStore,
    agent_environment: AgentEnvironment,
) -> &McpSharedPoolSettings {
    match agent_environment {
        AgentEnvironment::WindowsNative => &store.windows_native,
        AgentEnvironment::Wsl => &store.wsl,
    }
}

fn select_settings_slot_mut(
    store: &mut McpSharedPoolSettingsStore,
    agent_environment: AgentEnvironment,
) -> &mut McpSharedPoolSettings {
    match agent_environment {
        AgentEnvironment::WindowsNative => &mut store.windows_native,
        AgentEnvironment::Wsl => &mut store.wsl,
    }
}

fn store_path() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY).join(STORE_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::models::{AgentEnvironment, McpSharedPoolSettings};
    use crate::test_support::unique_temp_dir;

    use super::{read_store, select_settings_slot, write_store, McpSharedPoolSettingsStore};

    #[test]
    fn returns_defaults_when_store_is_missing() {
        let path = unique_temp_dir("codex-app-plus", "mcp-pool-defaults").join("pool.json");

        let store = read_store(&path).expect("default store");

        assert!(!store.windows_native.enabled);
        assert!(!store.wsl.enabled);
    }

    #[test]
    fn writes_settings_per_agent_environment() {
        let path = unique_temp_dir("codex-app-plus", "mcp-pool-write").join("pool.json");
        let mut store = McpSharedPoolSettingsStore::default();
        store.windows_native = McpSharedPoolSettings { enabled: true };

        write_store(&path, &store).expect("write store");
        let restored = read_store(&path).expect("read store");

        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::WindowsNative),
            &McpSharedPoolSettings { enabled: true },
        );
        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::Wsl),
            &McpSharedPoolSettings::default(),
        );
        fs::remove_file(path).ok();
    }
}
