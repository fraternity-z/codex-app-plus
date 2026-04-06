use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{
    AgentEnvironment, ProxySettings, ReadProxySettingsInput, ReadProxySettingsOutput,
    UpdateProxySettingsInput, UpdateProxySettingsOutput,
};

const APP_DIRECTORY: &str = "CodexAppPlus";
const STORE_FILE_NAME: &str = "proxy-settings.json";
const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxySettingsStore {
    version: u32,
    windows_native: ProxySettings,
    wsl: ProxySettings,
}

impl Default for ProxySettingsStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            windows_native: ProxySettings::default(),
            wsl: ProxySettings::default(),
        }
    }
}

pub fn read_proxy_settings(
    input: ReadProxySettingsInput,
) -> AppResult<ReadProxySettingsOutput> {
    Ok(ReadProxySettingsOutput {
        settings: load_proxy_settings(input.agent_environment)?,
    })
}

pub fn write_proxy_settings(
    input: UpdateProxySettingsInput,
) -> AppResult<UpdateProxySettingsOutput> {
    let settings = input.settings.normalized()?;
    let path = store_path()?;
    let mut store = read_store(&path)?;
    *select_settings_slot_mut(&mut store, input.agent_environment) = settings.clone();
    write_store(&path, &store)?;
    Ok(UpdateProxySettingsOutput { settings })
}

pub(crate) fn load_proxy_settings(
    agent_environment: AgentEnvironment,
) -> AppResult<ProxySettings> {
    let path = store_path()?;
    let store = read_store(&path)?;
    Ok(select_settings_slot(&store, agent_environment).clone())
}

fn read_store(path: &Path) -> AppResult<ProxySettingsStore> {
    if !path.exists() {
        return Ok(ProxySettingsStore::default());
    }

    let text = fs::read_to_string(path)?;
    let store = serde_json::from_str::<ProxySettingsStore>(&text)?;
    normalize_store(store)
}

fn write_store(path: &Path, store: &ProxySettingsStore) -> AppResult<()> {
    let store = normalize_store(store.clone())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(&store)?)?;
    Ok(())
}

fn normalize_store(store: ProxySettingsStore) -> AppResult<ProxySettingsStore> {
    if store.version != STORE_VERSION {
        return Err(AppError::InvalidInput("不支持的代理设置存储版本".to_string()));
    }
    Ok(ProxySettingsStore {
        version: store.version,
        windows_native: store.windows_native.normalized()?,
        wsl: store.wsl.normalized()?,
    })
}

fn select_settings_slot(
    store: &ProxySettingsStore,
    agent_environment: AgentEnvironment,
) -> &ProxySettings {
    match agent_environment {
        AgentEnvironment::WindowsNative => &store.windows_native,
        AgentEnvironment::Wsl => &store.wsl,
    }
}

fn select_settings_slot_mut(
    store: &mut ProxySettingsStore,
    agent_environment: AgentEnvironment,
) -> &mut ProxySettings {
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

pub(crate) trait ProxySettingsNormalization {
    fn normalized(&self) -> AppResult<ProxySettings>;
}

impl ProxySettingsNormalization for ProxySettings {
    fn normalized(&self) -> AppResult<ProxySettings> {
        Ok(ProxySettings {
            enabled: self.enabled,
            http_proxy: String::new(),
            https_proxy: String::new(),
            no_proxy: String::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{read_store, select_settings_slot, write_store, ProxySettingsStore};
    use crate::models::{AgentEnvironment, ProxySettings};
    use crate::test_support::unique_temp_dir;
    use std::fs;

    fn configured_settings() -> ProxySettings {
        ProxySettings {
            enabled: true,
            http_proxy: "http://127.0.0.1:8080".to_string(),
            https_proxy: "https://127.0.0.1:8443".to_string(),
            no_proxy: "localhost".to_string(),
        }
    }

    #[test]
    fn returns_default_store_when_file_does_not_exist() {
        let path = unique_temp_dir("codex-app-plus", "proxy-read").join("proxy.json");

        let store = read_store(&path).expect("default store");

        assert!(!store.windows_native.enabled);
        assert!(!store.wsl.enabled);
    }

    #[test]
    fn writes_and_reads_environment_specific_proxy_settings() {
        let path = unique_temp_dir("codex-app-plus", "proxy-write").join("proxy.json");
        let mut store = ProxySettingsStore::default();
        store.windows_native = configured_settings();

        write_store(&path, &store).expect("write proxy store");
        let restored = read_store(&path).expect("read proxy store");

        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::WindowsNative),
            &ProxySettings {
                enabled: true,
                http_proxy: String::new(),
                https_proxy: String::new(),
                no_proxy: String::new(),
            }
        );
        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::Wsl),
            &ProxySettings::default()
        );
        fs::remove_file(path).ok();
    }
}
