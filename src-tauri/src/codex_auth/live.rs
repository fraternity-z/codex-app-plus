use std::fs;
use std::path::Path;

use serde_json::{Map as JsonMap, Value as JsonValue};
use toml::Table;

use crate::agent_environment::{resolve_codex_home_relative_path, AgentFsPath};
use crate::error::{AppError, AppResult};
use crate::models::AgentEnvironment;

use super::live_io::write_live_files;
use super::storage::now_unix_ms;
use super::types::CodexOauthSnapshot;

const OPENAI_API_KEY: &str = "OPENAI_API_KEY";

#[derive(Debug, Clone)]
pub(crate) struct LiveFiles {
    pub(crate) auth_path: AgentFsPath,
    pub(crate) config_path: AgentFsPath,
    pub(crate) auth_map: JsonMap<String, JsonValue>,
    pub(crate) config_table: Table,
    pub(crate) config_text: String,
}

pub(crate) fn read_live_files(agent_environment: AgentEnvironment) -> AppResult<LiveFiles> {
    let auth_path = resolve_codex_home_relative_path(agent_environment, ".codex/auth.json")?;
    let config_path = resolve_codex_home_relative_path(agent_environment, ".codex/config.toml")?;
    let auth_map = read_auth_map(&auth_path.host_path)?;
    let config_text = read_optional_string(&config_path.host_path)?;
    let config_table = parse_config_table(&config_text)?;
    Ok(LiveFiles {
        auth_path,
        config_path,
        auth_map,
        config_table,
        config_text,
    })
}

pub(crate) fn auth_contains_api_key(auth_map: &JsonMap<String, JsonValue>) -> bool {
    auth_map
        .get(OPENAI_API_KEY)
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

pub(crate) fn auth_contains_chatgpt_markers(auth_map: &JsonMap<String, JsonValue>) -> bool {
    auth_map.contains_key("tokens")
        || contains_non_empty_string(auth_map, "accessToken")
        || contains_non_empty_string(auth_map, "access_token")
        || contains_non_empty_string(auth_map, "idToken")
        || contains_non_empty_string(auth_map, "id_token")
}

pub(crate) fn build_snapshot_from_live(live: &LiveFiles) -> CodexOauthSnapshot {
    CodexOauthSnapshot {
        auth_json_text: serialize_auth_map(&live.auth_map).unwrap_or_else(|_| "{}\n".to_string()),
        config_toml_text: live.config_text.clone(),
        updated_at: now_unix_ms().unwrap_or_default(),
    }
}

pub(crate) fn build_oauth_snapshot_from_api_key_live(
    live: &LiveFiles,
) -> AppResult<CodexOauthSnapshot> {
    let auth_map = sanitize_auth_for_chatgpt(live.auth_map.clone());
    let config_table = sanitize_config_for_chatgpt(live.config_table.clone());
    Ok(CodexOauthSnapshot {
        auth_json_text: serialize_auth_map(&auth_map)?,
        config_toml_text: serialize_config_table(&config_table)?,
        updated_at: now_unix_ms()?,
    })
}

pub(crate) fn clear_oauth_snapshot_auth(
    snapshot: &CodexOauthSnapshot,
) -> AppResult<CodexOauthSnapshot> {
    let auth_map = sanitize_auth_for_chatgpt(parse_auth_map(&snapshot.auth_json_text)?);
    Ok(CodexOauthSnapshot {
        auth_json_text: serialize_auth_map(&auth_map)?,
        config_toml_text: snapshot.config_toml_text.clone(),
        updated_at: now_unix_ms()?,
    })
}

pub(crate) fn write_snapshot_to_live(
    live: &LiveFiles,
    snapshot: &CodexOauthSnapshot,
) -> AppResult<()> {
    let auth_map = parse_auth_map(&snapshot.auth_json_text)?;
    let config_table = parse_config_table(&snapshot.config_toml_text)?;
    let auth_bytes = serialize_auth_map(&auth_map)?.into_bytes();
    let config_bytes = serialize_config_table(&config_table)?.into_bytes();
    write_live_files(
        &live.auth_path.host_path,
        &auth_bytes,
        &live.config_path.host_path,
        &config_bytes,
    )
}

pub(crate) fn sanitize_auth_for_chatgpt(
    mut auth_map: JsonMap<String, JsonValue>,
) -> JsonMap<String, JsonValue> {
    auth_map.remove(OPENAI_API_KEY);
    for key in [
        "tokens",
        "accessToken",
        "access_token",
        "idToken",
        "id_token",
        "refreshToken",
        "refresh_token",
    ] {
        auth_map.remove(key);
    }
    auth_map
}

pub(crate) fn sanitize_config_for_chatgpt(mut config_table: Table) -> Table {
    config_table.remove("model_provider");
    config_table.remove("model_providers");
    config_table
}

pub(crate) fn read_model_provider_key(config_table: &Table) -> Option<String> {
    config_table
        .get("model_provider")
        .and_then(toml::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

pub(crate) fn parse_auth_map(text: &str) -> AppResult<JsonMap<String, JsonValue>> {
    match serde_json::from_str::<JsonValue>(text)? {
        JsonValue::Object(map) => Ok(map),
        _ => Err(AppError::InvalidInput(
            "auth.json 必须是 JSON 对象".to_string(),
        )),
    }
}

pub(crate) fn parse_config_table(text: &str) -> AppResult<Table> {
    if text.trim().is_empty() {
        return Ok(Table::new());
    }
    toml::from_str::<Table>(text).map_err(|error| AppError::InvalidInput(error.to_string()))
}

pub(crate) fn serialize_auth_map(auth_map: &JsonMap<String, JsonValue>) -> AppResult<String> {
    Ok(format!(
        "{}\n",
        serde_json::to_string_pretty(&JsonValue::Object(auth_map.clone()))?
    ))
}

pub(crate) fn serialize_config_table(config_table: &Table) -> AppResult<String> {
    if config_table.is_empty() {
        return Ok(String::new());
    }
    let text = toml::to_string_pretty(config_table)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(format!("{text}\n"))
}

fn read_auth_map(path: &Path) -> AppResult<JsonMap<String, JsonValue>> {
    if !path.exists() {
        return Ok(JsonMap::new());
    }
    let text = fs::read_to_string(path)?;
    parse_auth_map(&text)
}

fn read_optional_string(path: &Path) -> AppResult<String> {
    if !path.exists() {
        return Ok(String::new());
    }
    Ok(fs::read_to_string(path)?)
}

fn contains_non_empty_string(auth_map: &JsonMap<String, JsonValue>, key: &str) -> bool {
    auth_map
        .get(key)
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}
