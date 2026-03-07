use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map as JsonMap, Value as JsonValue};
use toml::{Table, Value as TomlValue};

use crate::error::{AppError, AppResult};
use crate::models::{
    ApplyCodexProviderInput, CodexProviderApplyResult, CodexProviderRecord, CodexProviderStore,
    DeleteCodexProviderInput, UpsertCodexProviderInput,
};

const APP_DIRECTORY: &str = "CodexAppPlus";
const AUTH_FILE_NAME: &str = "auth.json";
const CODEX_DIRECTORY: &str = ".codex";
const CONFIG_FILE_NAME: &str = "config.toml";
const MODEL_KEY: &str = "model";
const MODEL_PROVIDER_KEY: &str = "model_provider";
const MODEL_PROVIDERS_KEY: &str = "model_providers";
const OPENAI_API_KEY: &str = "OPENAI_API_KEY";
const STORE_FILE_NAME: &str = "codex-providers.json";
const STORE_VERSION: u32 = 1;

pub fn list_codex_providers() -> AppResult<CodexProviderStore> {
    read_store(&store_path()?)
}

pub fn upsert_codex_provider(input: UpsertCodexProviderInput) -> AppResult<CodexProviderRecord> {
    upsert_codex_provider_at(&store_path()?, input)
}

pub fn delete_codex_provider(input: DeleteCodexProviderInput) -> AppResult<CodexProviderStore> {
    delete_codex_provider_at(&store_path()?, input)
}

pub fn apply_codex_provider(input: ApplyCodexProviderInput) -> AppResult<CodexProviderApplyResult> {
    apply_codex_provider_at(&store_path()?, &codex_auth_path()?, &codex_config_path()?, input)
}

fn apply_codex_provider_at(
    store_path: &Path,
    auth_path: &Path,
    config_path: &Path,
    input: ApplyCodexProviderInput,
) -> AppResult<CodexProviderApplyResult> {
    let store = read_store(store_path)?;
    let record = store
        .providers
        .into_iter()
        .find(|provider| provider.id == input.id)
        .ok_or_else(|| AppError::InvalidInput("未找到要应用的提供商".to_string()))?;
    validate_provider_content(&record)?;
    let template_auth = parse_auth_object(&record.auth_json_text)?;
    let template_config = parse_config_table(&record.config_toml_text)?;
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
        auth_path: auth_path.display().to_string(),
        config_path: config_path.display().to_string(),
    })
}

fn upsert_codex_provider_at(
    store_path: &Path,
    input: UpsertCodexProviderInput,
) -> AppResult<CodexProviderRecord> {
    let candidate = validate_upsert_input(input)?;
    let mut store = read_store(store_path)?;
    ensure_unique_provider_key(&store.providers, &candidate.provider_key, Some(candidate.id.as_str()))?;
    let timestamp = now_unix_ms()?;
    let saved = if let Some(index) = store.providers.iter().position(|provider| provider.id == candidate.id) {
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
    write_bytes_atomic(path, &payload)
}

fn empty_store() -> CodexProviderStore {
    CodexProviderStore { version: STORE_VERSION, providers: Vec::new() }
}

fn validate_store(store: &CodexProviderStore) -> AppResult<()> {
    if store.version != STORE_VERSION {
        return Err(AppError::InvalidInput("不支持的提供商存储版本".to_string()));
    }
    let mut seen_ids = std::collections::BTreeSet::new();
    let mut seen_keys = std::collections::BTreeSet::new();
    for provider in &store.providers {
        if !seen_ids.insert(provider.id.clone()) {
            return Err(AppError::InvalidInput("提供商存储中存在重复 id".to_string()));
        }
        if !seen_keys.insert(provider.provider_key.clone()) {
            return Err(AppError::InvalidInput("提供商存储中存在重复 providerKey".to_string()));
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
        provider.provider_key == provider_key && current_id.map(|id| id != provider.id).unwrap_or(true)
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
    let provider = ValidatedProvider {
        id: require_text(id, "id")?,
        name: require_text(input.name, "name")?,
        provider_key: require_text(input.provider_key, "providerKey")?,
        api_key: require_text(input.api_key, "apiKey")?,
        base_url: require_text(input.base_url, "baseUrl")?,
        model: require_text(input.model, "model")?,
        auth_json_text: input.auth_json_text,
        config_toml_text: input.config_toml_text,
    };
    validate_provider_content(&provider.as_record(0, 0))?;
    Ok(provider)
}

fn validate_provider_content(provider: &CodexProviderRecord) -> AppResult<()> {
    let auth = parse_auth_object(&provider.auth_json_text)?;
    let api_key = auth
        .get(OPENAI_API_KEY)
        .and_then(JsonValue::as_str)
        .ok_or_else(|| AppError::InvalidInput("auth.json 缺少 OPENAI_API_KEY".to_string()))?;
    if api_key != provider.api_key {
        return Err(AppError::InvalidInput("auth.json 与 apiKey 字段不一致".to_string()));
    }
    let config = parse_config_table(&provider.config_toml_text)?;
    let config_provider_key = get_toml_string(&config, MODEL_PROVIDER_KEY)?;
    let config_model = get_toml_string(&config, MODEL_KEY)?;
    let config_base_url = get_provider_base_url(&config, &provider.provider_key)?;
    if config_provider_key != provider.provider_key {
        return Err(AppError::InvalidInput("config.toml 与 providerKey 字段不一致".to_string()));
    }
    if config_model != provider.model {
        return Err(AppError::InvalidInput("config.toml 与 model 字段不一致".to_string()));
    }
    if config_base_url != provider.base_url {
        return Err(AppError::InvalidInput("config.toml 与 baseUrl 字段不一致".to_string()));
    }
    Ok(())
}

fn parse_auth_object(text: &str) -> AppResult<JsonMap<String, JsonValue>> {
    match serde_json::from_str::<JsonValue>(text)? {
        JsonValue::Object(map) => Ok(map),
        _ => Err(AppError::InvalidInput("auth.json 必须是 JSON 对象".to_string())),
    }
}

fn parse_config_table(text: &str) -> AppResult<Table> {
    toml::from_str::<Table>(text).map_err(|error| AppError::InvalidInput(error.to_string()))
}

fn get_toml_string<'a>(table: &'a Table, key: &str) -> AppResult<&'a str> {
    table
        .get(key)
        .and_then(TomlValue::as_str)
        .ok_or_else(|| AppError::InvalidInput(format!("config.toml 缺少字符串字段 {key}")))
}

fn get_provider_base_url<'a>(table: &'a Table, provider_key: &str) -> AppResult<&'a str> {
    table
        .get(MODEL_PROVIDERS_KEY)
        .and_then(TomlValue::as_table)
        .and_then(|providers| providers.get(provider_key))
        .and_then(TomlValue::as_table)
        .and_then(|provider| provider.get("base_url"))
        .and_then(TomlValue::as_str)
        .ok_or_else(|| AppError::InvalidInput("config.toml 缺少当前 provider 的 base_url".to_string()))
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

fn merge_config_table(current: Table, template: Table) -> AppResult<Table> {
    let mut merged = current;
    for (key, value) in template {
        if key == MODEL_PROVIDERS_KEY {
            let provider_value = merge_model_providers(merged.remove(MODEL_PROVIDERS_KEY), value)?;
            merged.insert(key, provider_value);
            continue;
        }
        merged.insert(key, value);
    }
    Ok(merged)
}

fn merge_model_providers(current: Option<TomlValue>, template: TomlValue) -> AppResult<TomlValue> {
    let mut merged = match current {
        Some(value) => value
            .as_table()
            .cloned()
            .ok_or_else(|| AppError::InvalidInput("当前 config.toml 的 model_providers 不是表".to_string()))?,
        None => Table::new(),
    };
    let template_map = template
        .as_table()
        .ok_or_else(|| AppError::InvalidInput("config.toml 的 model_providers 必须是表".to_string()))?;
    for (key, value) in template_map {
        merged.insert(key.to_string(), value.clone());
    }
    Ok(TomlValue::Table(merged))
}

fn write_live_files(
    auth_path: &Path,
    auth_bytes: &[u8],
    config_path: &Path,
    config_bytes: &[u8],
) -> AppResult<()> {
    let old_auth = read_optional_bytes(auth_path)?;
    write_bytes_atomic(auth_path, auth_bytes)?;
    if let Err(error) = write_bytes_atomic(config_path, config_bytes) {
        restore_previous_file(auth_path, old_auth.as_deref())?;
        return Err(error);
    }
    Ok(())
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| AppError::InvalidInput("无效路径".to_string()))?;
    fs::create_dir_all(parent)?;
    let temp_path = parent.join(format!("{}.tmp", path.file_name().and_then(|name| name.to_str()).unwrap_or("temp")));
    fs::write(&temp_path, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(&temp_path, path)?;
    Ok(())
}

fn restore_previous_file(path: &Path, bytes: Option<&[u8]>) -> AppResult<()> {
    match bytes {
        Some(previous) => write_bytes_atomic(path, previous),
        None if path.exists() => fs::remove_file(path).map_err(Into::into),
        None => Ok(()),
    }
}

fn read_optional_bytes(path: &Path) -> AppResult<Option<Vec<u8>>> {
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read(path)?))
}

fn require_text(value: String, field: &str) -> AppResult<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(format!("{field} 不能为空")));
    }
    Ok(trimmed)
}

fn store_path() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir().ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY).join(STORE_FILE_NAME))
}

fn codex_auth_path() -> AppResult<PathBuf> {
    Ok(codex_dir()?.join(AUTH_FILE_NAME))
}

fn codex_config_path() -> AppResult<PathBuf> {
    Ok(codex_dir()?.join(CONFIG_FILE_NAME))
}

fn codex_dir() -> AppResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| AppError::InvalidInput("无法解析用户目录".to_string()))?;
    Ok(home.join(CODEX_DIRECTORY))
}

fn generate_provider_id() -> AppResult<String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(format!("provider-{}-{}", std::process::id(), duration.as_nanos()))
}

fn now_unix_ms() -> AppResult<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?;
    Ok(duration.as_millis() as i64)
}

struct ValidatedProvider {
    id: String,
    name: String,
    provider_key: String,
    api_key: String,
    base_url: String,
    model: String,
    auth_json_text: String,
    config_toml_text: String,
}

impl ValidatedProvider {
    fn as_record(&self, created_at: i64, updated_at: i64) -> CodexProviderRecord {
        CodexProviderRecord {
            id: self.id.clone(),
            name: self.name.clone(),
            provider_key: self.provider_key.clone(),
            api_key: self.api_key.clone(),
            base_url: self.base_url.clone(),
            model: self.model.clone(),
            auth_json_text: self.auth_json_text.clone(),
            config_toml_text: self.config_toml_text.clone(),
            created_at,
            updated_at,
        }
    }

    fn into_record(self, created_at: i64, updated_at: i64) -> CodexProviderRecord {
        CodexProviderRecord {
            id: self.id,
            name: self.name,
            provider_key: self.provider_key,
            api_key: self.api_key,
            base_url: self.base_url,
            model: self.model,
            auth_json_text: self.auth_json_text,
            config_toml_text: self.config_toml_text,
            created_at,
            updated_at,
        }
    }
}

#[cfg(test)]
mod tests;
