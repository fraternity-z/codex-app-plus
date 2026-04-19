use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{
    AgentEnvironment, ProxyMode, ProxySettings, ReadProxySettingsInput, ReadProxySettingsOutput,
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
        match self.mode {
            ProxyMode::Disabled | ProxyMode::System => Ok(ProxySettings {
                mode: self.mode,
                http_proxy: String::new(),
                https_proxy: String::new(),
                no_proxy: String::new(),
            }),
            ProxyMode::Custom => {
                let http_proxy = self.http_proxy.trim().to_string();
                let https_proxy = self.https_proxy.trim().to_string();
                let no_proxy = self.no_proxy.trim().to_string();
                if http_proxy.is_empty() && https_proxy.is_empty() {
                    return Err(AppError::InvalidInput(
                        "自定义代理至少需要填写 HTTP 或 HTTPS 代理地址。".to_string(),
                    ));
                }
                Ok(ProxySettings {
                    mode: ProxyMode::Custom,
                    http_proxy,
                    https_proxy,
                    no_proxy,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{read_store, select_settings_slot, write_store, ProxySettingsStore};
    use crate::models::{AgentEnvironment, ProxyMode, ProxySettings};
    use crate::proxy_settings::ProxySettingsNormalization;
    use crate::test_support::unique_temp_dir;
    use std::fs;

    fn configured_settings() -> ProxySettings {
        ProxySettings {
            mode: ProxyMode::Custom,
            http_proxy: "http://127.0.0.1:8080".to_string(),
            https_proxy: "https://127.0.0.1:8443".to_string(),
            no_proxy: "localhost".to_string(),
        }
    }

    #[test]
    fn returns_default_store_when_file_does_not_exist() {
        let path = unique_temp_dir("codex-app-plus", "proxy-read").join("proxy.json");

        let store = read_store(&path).expect("default store");

        assert_eq!(store.windows_native.mode, ProxyMode::Disabled);
        assert_eq!(store.wsl.mode, ProxyMode::Disabled);
    }

    #[test]
    fn writes_and_reads_custom_proxy_settings_per_environment() {
        let path = unique_temp_dir("codex-app-plus", "proxy-write").join("proxy.json");
        let mut store = ProxySettingsStore::default();
        store.windows_native = configured_settings();

        write_store(&path, &store).expect("write proxy store");
        let restored = read_store(&path).expect("read proxy store");

        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::WindowsNative),
            &configured_settings(),
        );
        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::Wsl),
            &ProxySettings::default()
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn legacy_enabled_flag_migrates_to_mode() {
        let path = unique_temp_dir("codex-app-plus", "proxy-legacy").join("proxy.json");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(
            &path,
            r#"{"version":1,"windowsNative":{"enabled":true,"httpProxy":"","httpsProxy":"","noProxy":""},"wsl":{"enabled":false,"httpProxy":"","httpsProxy":"","noProxy":""}}"#,
        )
        .expect("seed legacy store");

        let restored = read_store(&path).expect("read legacy store");

        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::WindowsNative).mode,
            ProxyMode::System,
        );
        assert_eq!(
            select_settings_slot(&restored, AgentEnvironment::Wsl).mode,
            ProxyMode::Disabled,
        );
        fs::remove_file(path).ok();
    }

    #[test]
    fn custom_mode_requires_http_or_https_value() {
        let result = ProxySettings {
            mode: ProxyMode::Custom,
            http_proxy: String::new(),
            https_proxy: String::new(),
            no_proxy: "localhost".to_string(),
        }
        .normalized();
        assert!(result.is_err());
    }

    #[test]
    fn custom_mode_trims_and_preserves_values() {
        let normalized = ProxySettings {
            mode: ProxyMode::Custom,
            http_proxy: "  http://127.0.0.1:7890  ".to_string(),
            https_proxy: String::new(),
            no_proxy: " localhost ".to_string(),
        }
        .normalized()
        .expect("normalized custom settings");

        assert_eq!(
            normalized,
            ProxySettings {
                mode: ProxyMode::Custom,
                http_proxy: "http://127.0.0.1:7890".to_string(),
                https_proxy: String::new(),
                no_proxy: "localhost".to_string(),
            }
        );
    }

    #[test]
    fn system_mode_drops_custom_fields() {
        let normalized = ProxySettings {
            mode: ProxyMode::System,
            http_proxy: "http://ignored".to_string(),
            https_proxy: "http://ignored".to_string(),
            no_proxy: "ignored".to_string(),
        }
        .normalized()
        .expect("normalized system settings");

        assert_eq!(
            normalized,
            ProxySettings {
                mode: ProxyMode::System,
                http_proxy: String::new(),
                https_proxy: String::new(),
                no_proxy: String::new(),
            }
        );
    }
}
