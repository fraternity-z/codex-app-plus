use std::fs;
use std::path::Path;

use serde_json::{Map as JsonMap, Value as JsonValue};
use toml::Table;

use crate::agent_environment::{resolve_agent_environment, resolve_codex_home_relative_path};
use crate::error::{AppError, AppResult};
use crate::models::{
    ApplyCodexProviderInput, CodexProviderApplyResult, CodexProviderRecord, CodexProviderStore,
    DeleteCodexProviderInput, UpsertCodexProviderInput,
};

mod config_patch;
mod support;

use config_patch::{build_provider_patch_from_text, merge_config_table, parse_config_table};
use support::{
    generate_provider_id, now_unix_ms, require_text, store_path, write_live_files,
    ValidatedProvider,
};

const APP_DIRECTORY: &str = "CodexAppPlus";
const AUTH_FILE_NAME: &str = "auth.json";
const CONFIG_FILE_NAME: &str = "config.toml";
const OPENAI_API_KEY: &str = "OPENAI_API_KEY";
const STORE_FILE_NAME: &str = "codex-providers.json";
const STORE_VERSION: u32 = 1;

pub fn list_codex_providers() -> AppResult<CodexProviderStore> {
    read_store(&store_path(APP_DIRECTORY, STORE_FILE_NAME)?)
}

pub fn upsert_codex_provider(input: UpsertCodexProviderInput) -> AppResult<CodexProviderRecord> {
    upsert_codex_provider_at(&store_path(APP_DIRECTORY, STORE_FILE_NAME)?, input)
}

pub fn delete_codex_provider(input: DeleteCodexProviderInput) -> AppResult<CodexProviderStore> {
    delete_codex_provider_at(&store_path(APP_DIRECTORY, STORE_FILE_NAME)?, input)
}

pub fn apply_codex_provider(input: ApplyCodexProviderInput) -> AppResult<CodexProviderApplyResult> {
    let agent_environment = resolve_agent_environment(input.agent_environment);
    let auth_path = resolve_codex_home_relative_path(agent_environment, ".codex/auth.json")?;
    let config_path = resolve_codex_home_relative_path(agent_environment, ".codex/config.toml")?;
    apply_codex_provider_at(
        &store_path(APP_DIRECTORY, STORE_FILE_NAME)?,
        &auth_path.host_path,
        &auth_path.display_path,
        &config_path.host_path,
        &config_path.display_path,
        input,
    )
}

fn apply_codex_provider_at(
    store_path: &Path,
    auth_path: &Path,
    auth_display_path: &str,
    config_path: &Path,
    config_display_path: &str,
    input: ApplyCodexProviderInput,
) -> AppResult<CodexProviderApplyResult> {
    let store = read_store(store_path)?;
    let record = store
        .providers
        .into_iter()
        .find(|provider| provider.id == input.id)
        .ok_or_else(|| AppError::InvalidInput("未找到要应用的提供商".to_string()))?;

    validate_provider_content(&record)?;
    let template_auth = build_template_auth(&record)?;
    let template_config = build_provider_patch_from_text(
        &record.config_toml_text,
        &record.provider_key,
        &record.name,
        &record.base_url,
    )?;
    let next_auth = JsonValue::Object(merge_auth_map(read_auth_map(auth_path)?, template_auth));
    let next_config = merge_config_table(read_config_table(config_path)?, template_config)?;
    let auth_bytes = serde_json::to_vec_pretty(&next_auth)?;
    let config_bytes = toml::to_string_pretty(&next_config)
        .map_err(|error| AppError::Protocol(error.to_string()))?
        .into_bytes();
    write_live_files(auth_path, &auth_bytes, config_path, &config_bytes)?;

    Ok(CodexProviderApplyResult {
        provider_id: record.id,
        provider_key: record.provider_key,
        auth_path: auth_display_path.to_string(),
        config_path: config_display_path.to_string(),
    })
}

fn upsert_codex_provider_at(
    store_path: &Path,
    input: UpsertCodexProviderInput,
) -> AppResult<CodexProviderRecord> {
    let candidate = validate_upsert_input(input)?;
    let mut store = read_store(store_path)?;
    ensure_unique_provider_key(
        &store.providers,
        &candidate.provider_key,
        Some(candidate.id.as_str()),
    )?;
    let timestamp = now_unix_ms()?;
    let saved = if let Some(index) = store
        .providers
        .iter()
        .position(|provider| provider.id == candidate.id)
    {
        let created_at = store.providers[index].created_at;
        let record = candidate.into_record(created_at, timestamp);
        store.providers[index] = record.clone();
        record
    } else {
        let record = candidate.into_record(timestamp, timestamp);
        store.providers.insert(0, record.clone());
        record
    };
    write_store(store_path, &store)?;
    Ok(saved)
}

fn delete_codex_provider_at(
    store_path: &Path,
    input: DeleteCodexProviderInput,
) -> AppResult<CodexProviderStore> {
    let mut store = read_store(store_path)?;
    let previous_len = store.providers.len();
    store.providers.retain(|provider| provider.id != input.id);
    if store.providers.len() == previous_len {
        return Err(AppError::InvalidInput("未找到要删除的提供商".to_string()));
    }
    write_store(store_path, &store)?;
    Ok(store)
}

fn read_store(path: &Path) -> AppResult<CodexProviderStore> {
    if !path.exists() {
        return Ok(empty_store());
    }
    let content = fs::read_to_string(path)?;
    let store = serde_json::from_str::<CodexProviderStore>(&content)?;
    validate_store(&store)?;
    Ok(store)
}

fn write_store(path: &Path, store: &CodexProviderStore) -> AppResult<()> {
    validate_store(store)?;
    let payload = serde_json::to_vec_pretty(store)?;
    fs::create_dir_all(
        path.parent()
            .ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?,
    )?;
    fs::write(path, payload)?;
    Ok(())
}

fn empty_store() -> CodexProviderStore {
    CodexProviderStore {
        version: STORE_VERSION,
        providers: Vec::new(),
    }
}

fn validate_store(store: &CodexProviderStore) -> AppResult<()> {
    if store.version != STORE_VERSION {
        return Err(AppError::InvalidInput("不支持的提供商存储版本".to_string()));
    }

    let mut seen_ids = std::collections::BTreeSet::new();
    let mut seen_keys = std::collections::BTreeSet::new();
    for provider in &store.providers {
        if !seen_ids.insert(provider.id.clone()) {
            return Err(AppError::InvalidInput(
                "提供商存储中存在重复 id".to_string(),
            ));
        }
        if !seen_keys.insert(provider.provider_key.clone()) {
            return Err(AppError::InvalidInput(
                "提供商存储中存在重复 providerKey".to_string(),
            ));
        }
        validate_provider_content(provider)?;
    }
    Ok(())
}

fn ensure_unique_provider_key(
    providers: &[CodexProviderRecord],
    provider_key: &str,
    current_id: Option<&str>,
) -> AppResult<()> {
    let duplicated = providers.iter().any(|provider| {
        provider.provider_key == provider_key
            && current_id.map(|id| id != provider.id).unwrap_or(true)
    });
    if duplicated {
        return Err(AppError::InvalidInput("providerKey 已存在".to_string()));
    }
    Ok(())
}

fn validate_upsert_input(input: UpsertCodexProviderInput) -> AppResult<ValidatedProvider> {
    let id = match input.id {
        Some(value) => value,
        None => generate_provider_id()?,
    };
    let name = require_text(input.name, "name")?;
    let provider_key = require_text(input.provider_key, "providerKey")?;
    let api_key = require_text(input.api_key, "apiKey")?;
    let base_url = require_text(input.base_url, "baseUrl")?;
    let auth_json_text = normalize_auth_json_text(&input.auth_json_text, &api_key)?;
    let config_toml_text =
        normalize_config_toml_text(&input.config_toml_text, &provider_key, &name, &base_url)?;
    let provider = ValidatedProvider {
        id: require_text(id, "id")?,
        name,
        provider_key,
        api_key,
        base_url,
        auth_json_text,
        config_toml_text,
    };
    validate_provider_content(&provider.as_record(0, 0))?;
    Ok(provider)
}

fn validate_provider_content(provider: &CodexProviderRecord) -> AppResult<()> {
    validate_auth_json(provider)?;
    let _ = build_provider_patch_from_text(
        &provider.config_toml_text,
        &provider.provider_key,
        &provider.name,
        &provider.base_url,
    )?;
    Ok(())
}

fn normalize_auth_json_text(text: &str, api_key: &str) -> AppResult<String> {
    let mut auth = parse_auth_object(text)?;
    auth.insert(
        OPENAI_API_KEY.to_string(),
        JsonValue::String(api_key.to_string()),
    );
    Ok(format!(
        "{}\n",
        serde_json::to_string_pretty(&JsonValue::Object(auth))?
    ))
}

fn normalize_config_toml_text(
    text: &str,
    provider_key: &str,
    provider_name: &str,
    base_url: &str,
) -> AppResult<String> {
    let patch = build_provider_patch_from_text(text, provider_key, provider_name, base_url)?;
    let serialized =
        toml::to_string_pretty(&patch).map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(format!("{serialized}\n"))
}

fn validate_auth_json(provider: &CodexProviderRecord) -> AppResult<()> {
    let auth = parse_auth_object(&provider.auth_json_text)?;
    let api_key = auth
        .get(OPENAI_API_KEY)
        .and_then(JsonValue::as_str)
        .ok_or_else(|| AppError::InvalidInput("auth.json 缺少 OPENAI_API_KEY".to_string()))?;
    if api_key != provider.api_key {
        return Err(AppError::InvalidInput(
            "auth.json 与 apiKey 字段不一致".to_string(),
        ));
    }
    Ok(())
}

fn build_template_auth(provider: &CodexProviderRecord) -> AppResult<JsonMap<String, JsonValue>> {
    let mut auth = parse_auth_object(&provider.auth_json_text)?;
    auth.insert(
        OPENAI_API_KEY.to_string(),
        JsonValue::String(provider.api_key.clone()),
    );
    Ok(auth)
}

fn parse_auth_object(text: &str) -> AppResult<JsonMap<String, JsonValue>> {
    match serde_json::from_str::<JsonValue>(text)? {
        JsonValue::Object(map) => Ok(map),
        _ => Err(AppError::InvalidInput(
            "auth.json 必须是 JSON 对象".to_string(),
        )),
    }
}

fn read_auth_map(path: &Path) -> AppResult<JsonMap<String, JsonValue>> {
    if !path.exists() {
        return Ok(JsonMap::new());
    }
    parse_auth_object(&fs::read_to_string(path)?)
}

fn read_config_table(path: &Path) -> AppResult<Table> {
    if !path.exists() {
        return Ok(Table::new());
    }
    let content = fs::read_to_string(path)?;
    if content.trim().is_empty() {
        return Ok(Table::new());
    }
    parse_config_table(&content)
}

fn merge_auth_map(
    current: JsonMap<String, JsonValue>,
    template: JsonMap<String, JsonValue>,
) -> JsonMap<String, JsonValue> {
    let mut merged = current;
    for (key, value) in template {
        merged.insert(key, value);
    }
    merged
}

#[cfg(test)]
mod tests;
