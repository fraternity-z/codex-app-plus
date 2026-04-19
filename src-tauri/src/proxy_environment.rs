use portable_pty::CommandBuilder;
use std::env;
use std::process::Command as StdCommand;

use crate::models::{ProxyMode, ProxySettings};

const HTTP_PROXY_KEYS: [&str; 2] = ["HTTP_PROXY", "http_proxy"];
const HTTPS_PROXY_KEYS: [&str; 2] = ["HTTPS_PROXY", "https_proxy"];
const NO_PROXY_KEYS: [&str; 2] = ["NO_PROXY", "no_proxy"];
const ALL_PROXY_KEYS: [&str; 6] = [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
];

pub(crate) type ProxyEnvironmentEdit = (&'static str, Option<String>);

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct SystemProxyValues {
    http_proxy: String,
    https_proxy: String,
    no_proxy: String,
}

pub(crate) fn proxy_environment_assignments(
    settings: &ProxySettings,
) -> Vec<ProxyEnvironmentEdit> {
    match settings.mode {
        ProxyMode::Disabled => ALL_PROXY_KEYS
            .iter()
            .map(|key| (*key, None))
            .collect::<Vec<_>>(),
        ProxyMode::System => proxy_environment_edits_from_values(&system_proxy_values()),
        ProxyMode::Custom => proxy_environment_edits_from_values(&SystemProxyValues {
            http_proxy: settings.http_proxy.clone(),
            https_proxy: settings.https_proxy.clone(),
            no_proxy: settings.no_proxy.clone(),
        }),
    }
}

pub(crate) fn apply_std_proxy_environment(
    command: &mut StdCommand,
    settings: &ProxySettings,
) {
    for (key, value) in proxy_environment_assignments(settings) {
        match value {
            Some(value) => {
                command.env(key, value);
            }
            None => {
                command.env_remove(key);
            }
        }
    }
}

pub(crate) fn apply_terminal_proxy_environment(
    command: &mut CommandBuilder,
    settings: &ProxySettings,
) {
    for (key, value) in proxy_environment_assignments(settings) {
        match value {
            Some(value) => {
                command.env(key, value);
            }
            None => {
                command.env_remove(key);
            }
        }
    }
}

fn proxy_environment_edits_from_values(values: &SystemProxyValues) -> Vec<ProxyEnvironmentEdit> {
    let mut assignments = Vec::new();
    extend_assignments(&mut assignments, &HTTP_PROXY_KEYS, values.http_proxy.trim());
    extend_assignments(&mut assignments, &HTTPS_PROXY_KEYS, values.https_proxy.trim());
    extend_assignments(&mut assignments, &NO_PROXY_KEYS, values.no_proxy.trim());
    assignments
}

fn extend_assignments(
    assignments: &mut Vec<ProxyEnvironmentEdit>,
    keys: &[&'static str],
    value: &str,
) {
    for key in keys {
        let value = if value.is_empty() {
            None
        } else {
            Some(value.to_string())
        };
        assignments.push((*key, value));
    }
}

fn system_proxy_values() -> SystemProxyValues {
    system_proxy_values_impl()
}

#[cfg(windows)]
fn system_proxy_values_impl() -> SystemProxyValues {
    windows_system_proxy::read().unwrap_or_else(|_| environment_proxy_values())
}

#[cfg(not(windows))]
fn system_proxy_values_impl() -> SystemProxyValues {
    environment_proxy_values()
}

fn environment_proxy_values() -> SystemProxyValues {
    SystemProxyValues {
        http_proxy: first_env_value(&HTTP_PROXY_KEYS),
        https_proxy: first_env_value(&HTTPS_PROXY_KEYS),
        no_proxy: first_env_value(&NO_PROXY_KEYS),
    }
}

fn first_env_value(keys: &[&str]) -> String {
    keys.iter()
        .filter_map(|key| env::var(key).ok())
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

#[cfg(windows)]
mod windows_system_proxy {
    use std::mem::size_of;
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        REG_DWORD, REG_EXPAND_SZ, REG_SZ,
    };

    use super::{system_proxy_values_from_windows_proxy_config, SystemProxyValues};

    const INTERNET_SETTINGS_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    pub(super) fn read() -> Result<SystemProxyValues, ()> {
        let mut key: HKEY = std::ptr::null_mut();
        let path = wide(INTERNET_SETTINGS_PATH);
        let status =
            unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, KEY_READ, &mut key) };
        if status != ERROR_SUCCESS {
            return Err(());
        }

        let result = read_from_key(key);
        unsafe {
            RegCloseKey(key);
        }
        result
    }

    fn read_from_key(key: HKEY) -> Result<SystemProxyValues, ()> {
        if query_dword(key, "ProxyEnable")?.unwrap_or(0) == 0 {
            return Ok(SystemProxyValues::default());
        }
        let Some(proxy_server) = query_string(key, "ProxyServer")? else {
            return Ok(SystemProxyValues::default());
        };
        let proxy_override = query_string(key, "ProxyOverride")?;
        Ok(system_proxy_values_from_windows_proxy_config(
            &proxy_server,
            proxy_override.as_deref(),
        ))
    }

    fn query_dword(key: HKEY, name: &str) -> Result<Option<u32>, ()> {
        let name = wide(name);
        let mut value_type = 0_u32;
        let mut value = 0_u32;
        let mut value_len = size_of::<u32>() as u32;
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                null_mut(),
                &mut value_type,
                (&mut value as *mut u32).cast::<u8>(),
                &mut value_len,
            )
        };
        if status != ERROR_SUCCESS {
            return Ok(None);
        }
        if value_type != REG_DWORD || value_len != size_of::<u32>() as u32 {
            return Err(());
        }
        Ok(Some(value))
    }

    fn query_string(key: HKEY, name: &str) -> Result<Option<String>, ()> {
        let name = wide(name);
        let mut value_type = 0_u32;
        let mut value_len = 0_u32;
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                null_mut(),
                &mut value_type,
                null_mut(),
                &mut value_len,
            )
        };
        if status != ERROR_SUCCESS || value_len == 0 {
            return Ok(None);
        }
        if value_type != REG_SZ && value_type != REG_EXPAND_SZ {
            return Err(());
        }

        let mut buffer = vec![0_u16; (value_len as usize + 1) / 2];
        let status = unsafe {
            RegQueryValueExW(
                key,
                name.as_ptr(),
                null_mut(),
                &mut value_type,
                buffer.as_mut_ptr().cast::<u8>(),
                &mut value_len,
            )
        };
        if status != ERROR_SUCCESS {
            return Err(());
        }

        let end = buffer
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(buffer.len());
        Ok(Some(String::from_utf16_lossy(&buffer[..end])))
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

fn system_proxy_values_from_windows_proxy_config(
    proxy_server: &str,
    proxy_override: Option<&str>,
) -> SystemProxyValues {
    let proxy_server = proxy_server.trim();
    let (http_proxy, https_proxy) = if proxy_server.contains('=') {
        let mut http_proxy = String::new();
        let mut https_proxy = String::new();
        for segment in proxy_server.split(';') {
            let Some((protocol, server)) = segment.split_once('=') else {
                continue;
            };
            let server = normalize_system_proxy_server(server);
            match protocol.trim().to_ascii_lowercase().as_str() {
                "http" => http_proxy = server,
                "https" => https_proxy = server,
                _ => {}
            }
        }
        if https_proxy.is_empty() {
            https_proxy = http_proxy.clone();
        }
        (http_proxy, https_proxy)
    } else {
        let proxy = normalize_system_proxy_server(proxy_server);
        (proxy.clone(), proxy)
    };

    SystemProxyValues {
        http_proxy,
        https_proxy,
        no_proxy: normalize_windows_proxy_override(proxy_override),
    }
}

fn normalize_system_proxy_server(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() || value.contains("://") {
        return value.to_string();
    }
    format!("http://{value}")
}

fn normalize_windows_proxy_override(value: Option<&str>) -> String {
    value
        .unwrap_or_default()
        .split(';')
        .flat_map(normalize_windows_proxy_override_item)
        .collect::<Vec<_>>()
        .join(",")
}

fn normalize_windows_proxy_override_item(value: &str) -> Vec<String> {
    let value = value.trim();
    if value.is_empty() {
        return Vec::new();
    }
    if value.eq_ignore_ascii_case("<local>") {
        return vec!["localhost".to_string(), "127.0.0.1".to_string()];
    }
    let value = value
        .strip_prefix("*.")
        .map(|suffix| format!(".{suffix}"))
        .unwrap_or_else(|| value.to_string());
    vec![value]
}

#[cfg(test)]
mod tests {
    use super::{
        apply_std_proxy_environment, proxy_environment_assignments,
        proxy_environment_edits_from_values, system_proxy_values_from_windows_proxy_config,
        SystemProxyValues,
    };
    use crate::models::{ProxyMode, ProxySettings};
    use std::collections::BTreeMap;
    use std::process::Command as StdCommand;

    #[test]
    fn clears_proxy_environment_when_proxy_is_disabled() {
        assert_eq!(
            proxy_environment_assignments(&ProxySettings::default()),
            vec![
                ("HTTP_PROXY", None),
                ("http_proxy", None),
                ("HTTPS_PROXY", None),
                ("https_proxy", None),
                ("NO_PROXY", None),
                ("no_proxy", None),
            ]
        );
    }

    #[test]
    fn custom_mode_uses_settings_values() {
        let assignments = proxy_environment_assignments(&ProxySettings {
            mode: ProxyMode::Custom,
            http_proxy: "http://127.0.0.1:7890".to_string(),
            https_proxy: "http://127.0.0.1:7890".to_string(),
            no_proxy: "localhost".to_string(),
        });

        assert_eq!(
            assignments,
            vec![
                ("HTTP_PROXY", Some("http://127.0.0.1:7890".to_string())),
                ("http_proxy", Some("http://127.0.0.1:7890".to_string())),
                ("HTTPS_PROXY", Some("http://127.0.0.1:7890".to_string())),
                ("https_proxy", Some("http://127.0.0.1:7890".to_string())),
                ("NO_PROXY", Some("localhost".to_string())),
                ("no_proxy", Some("localhost".to_string())),
            ]
        );
    }

    #[test]
    fn custom_mode_clears_unset_values() {
        let assignments = proxy_environment_assignments(&ProxySettings {
            mode: ProxyMode::Custom,
            http_proxy: "http://127.0.0.1:7890".to_string(),
            https_proxy: String::new(),
            no_proxy: String::new(),
        });

        assert_eq!(
            assignments,
            vec![
                ("HTTP_PROXY", Some("http://127.0.0.1:7890".to_string())),
                ("http_proxy", Some("http://127.0.0.1:7890".to_string())),
                ("HTTPS_PROXY", None),
                ("https_proxy", None),
                ("NO_PROXY", None),
                ("no_proxy", None),
            ]
        );
    }

    #[test]
    fn builds_uppercase_and_lowercase_proxy_environment() {
        let assignments = proxy_environment_edits_from_values(&SystemProxyValues {
            http_proxy: "http://127.0.0.1:8080".to_string(),
            https_proxy: "https://127.0.0.1:8443".to_string(),
            no_proxy: "localhost,127.0.0.1".to_string(),
        });

        assert_eq!(
            assignments,
            vec![
                ("HTTP_PROXY", Some("http://127.0.0.1:8080".to_string())),
                ("http_proxy", Some("http://127.0.0.1:8080".to_string())),
                ("HTTPS_PROXY", Some("https://127.0.0.1:8443".to_string())),
                ("https_proxy", Some("https://127.0.0.1:8443".to_string())),
                ("NO_PROXY", Some("localhost,127.0.0.1".to_string())),
                ("no_proxy", Some("localhost,127.0.0.1".to_string())),
            ]
        );
    }

    #[test]
    fn removes_proxy_environment_from_std_command_when_disabled() {
        let mut command = StdCommand::new("git");
        command.env("HTTP_PROXY", "http://old.proxy");
        apply_std_proxy_environment(&mut command, &ProxySettings::default());

        let env_map = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().to_string(),
                    value.map(|item| item.to_string_lossy().to_string()),
                )
            })
            .collect::<BTreeMap<_, _>>();

        assert_eq!(env_map.get("HTTP_PROXY"), Some(&None));
        assert_eq!(env_map.get("http_proxy"), Some(&None));
    }

    #[test]
    fn parses_windows_system_proxy_config() {
        let values = system_proxy_values_from_windows_proxy_config(
            "http=127.0.0.1:7890;https=secure.local:7891",
            Some("localhost;*.internal;<local>"),
        );

        assert_eq!(
            values,
            SystemProxyValues {
                http_proxy: "http://127.0.0.1:7890".to_string(),
                https_proxy: "http://secure.local:7891".to_string(),
                no_proxy: "localhost,.internal,localhost,127.0.0.1".to_string(),
            }
        );
    }

    #[test]
    fn parses_single_windows_proxy_as_http_and_https_proxy() {
        let values =
            system_proxy_values_from_windows_proxy_config("127.0.0.1:7890", None);

        assert_eq!(
            values,
            SystemProxyValues {
                http_proxy: "http://127.0.0.1:7890".to_string(),
                https_proxy: "http://127.0.0.1:7890".to_string(),
                no_proxy: String::new(),
            }
        );
    }
}
