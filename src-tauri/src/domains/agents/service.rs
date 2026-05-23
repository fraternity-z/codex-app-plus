use std::path::{Component, Path, PathBuf};

use toml::{map::Map, Value};

use super::models::{
    AgentEnvironment, AgentSummaryOutput, AgentsSettingsOutput, CreateAgentInput, DeleteAgentInput,
    GetAgentsSettingsInput, ReadAgentConfigInput, ReadAgentConfigOutput, SetAgentsCoreInput,
    UpdateAgentInput, WriteAgentConfigInput, WriteAgentConfigOutput,
};
use crate::error::{AppError, AppResult};
use crate::infra::filesystem::agent_environment::{
    resolve_agent_environment, resolve_codex_home_relative_path,
};

const DEFAULT_AGENT_MAX_THREADS: u32 = 6;
const DEFAULT_AGENT_MAX_DEPTH: u32 = 1;
const MIN_AGENT_MAX_THREADS: u32 = 1;
const MAX_AGENT_MAX_THREADS: u32 = 12;
const MIN_AGENT_MAX_DEPTH: u32 = 1;
const MAX_AGENT_MAX_DEPTH: u32 = 4;
const MANAGED_AGENTS_DIR: &str = "agents";

pub fn get_agents_settings(input: GetAgentsSettingsInput) -> AppResult<AgentsSettingsOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    get_agents_settings_at(&config.host_path, &config.display_path)
}

pub fn set_agents_core(input: SetAgentsCoreInput) -> AppResult<AgentsSettingsOutput> {
    validate_max_threads(input.max_threads)?;
    validate_max_depth(input.max_depth)?;

    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let mut table = read_config_table(&config.host_path)?;

    set_feature_flag(&mut table, "multi_agent", input.multi_agent_enabled);
    set_feature_flag(&mut table, "multi_agent_v2", input.multi_agent_enabled);
    let agents = ensure_table_mut(&mut table, "agents")?;
    agents.insert(
        "max_threads".to_string(),
        Value::Integer(i64::from(input.max_threads)),
    );
    agents.insert(
        "max_depth".to_string(),
        Value::Integer(i64::from(input.max_depth)),
    );

    write_config_table(&config.host_path, &table)?;
    get_agents_settings_at(&config.host_path, &config.display_path)
}

pub fn create_agent(input: CreateAgentInput) -> AppResult<AgentsSettingsOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let mut table = read_config_table(&config.host_path)?;
    let agents = ensure_table_mut(&mut table, "agents")?;

    let name = normalize_agent_name(&input.name)?;
    if has_agent_name_conflict(agents, &name, None) {
        return Err(AppError::InvalidInput(format!("agent '{name}' 已存在")));
    }

    let relative = managed_relative_config_for_name(&name);
    let target = resolve_safe_managed_abs_path_for_write(&config.host_path, &relative)?;
    if target.exists() {
        return Err(AppError::InvalidInput(format!(
            "目标 agent 配置文件已存在: {}",
            target.display()
        )));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&target, build_agent_config_template())?;

    let mut role = Map::new();
    if let Some(description) = normalize_optional_string(input.description.as_deref()) {
        role.insert("description".to_string(), Value::String(description));
    }
    role.insert(
        "config_file".to_string(),
        Value::String(pathbuf_to_string(&relative)?),
    );
    agents.insert(name, Value::Table(role));

    if let Err(error) = write_config_table(&config.host_path, &table) {
        let _ = std::fs::remove_file(&target);
        return Err(error);
    }

    get_agents_settings_at(&config.host_path, &config.display_path)
}

pub fn update_agent(input: UpdateAgentInput) -> AppResult<AgentsSettingsOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let mut table = read_config_table(&config.host_path)?;
    let agents = ensure_table_mut(&mut table, "agents")?;

    let original_name = normalize_lookup_name(&input.original_name)?;
    let next_name = normalize_agent_name(&input.name)?;
    if next_name != original_name
        && has_agent_name_conflict(agents, &next_name, Some(&original_name))
    {
        return Err(AppError::InvalidInput(format!(
            "agent '{next_name}' 已存在"
        )));
    }

    let current = agents
        .remove(&original_name)
        .ok_or_else(|| AppError::InvalidInput(format!("agent '{original_name}' 不存在")))?;
    let mut role = current
        .as_table()
        .cloned()
        .ok_or_else(|| AppError::InvalidInput("agent 配置必须是 table".to_string()))?;

    let old_relative = role
        .get("config_file")
        .and_then(Value::as_str)
        .and_then(managed_relative_path_from_config);
    let new_relative = managed_relative_config_for_name(&next_name);
    let mut renamed_paths: Option<(PathBuf, PathBuf)> = None;
    if let Some(old_relative) = old_relative {
        if old_relative != new_relative {
            let old_abs = resolve_safe_managed_abs_path_for_read(&config.host_path, &old_relative)?;
            let new_abs =
                resolve_safe_managed_abs_path_for_write(&config.host_path, &new_relative)?;
            if new_abs.exists() {
                return Err(AppError::InvalidInput(format!(
                    "目标 agent 配置文件已存在: {}",
                    new_abs.display()
                )));
            }
            if old_abs.exists() {
                if let Some(parent) = new_abs.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::rename(&old_abs, &new_abs)?;
                renamed_paths = Some((old_abs, new_abs));
            }
        }
        role.insert(
            "config_file".to_string(),
            Value::String(pathbuf_to_string(&new_relative)?),
        );
    }

    match normalize_optional_string(input.description.as_deref()) {
        Some(description) => {
            role.insert("description".to_string(), Value::String(description));
        }
        None => {
            role.remove("description");
        }
    }

    agents.insert(next_name, Value::Table(role));
    if let Err(error) = write_config_table(&config.host_path, &table) {
        if let Some((old_abs, new_abs)) = renamed_paths {
            if new_abs.exists() {
                let _ = std::fs::rename(new_abs, old_abs);
            }
        }
        return Err(error);
    }

    get_agents_settings_at(&config.host_path, &config.display_path)
}

pub fn delete_agent(input: DeleteAgentInput) -> AppResult<AgentsSettingsOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let mut table = read_config_table(&config.host_path)?;
    let agents = ensure_table_mut(&mut table, "agents")?;
    let name = normalize_lookup_name(&input.name)?;

    let existing = agents
        .remove(&name)
        .ok_or_else(|| AppError::InvalidInput(format!("agent '{name}' 不存在")))?;
    let maybe_relative = existing
        .as_table()
        .and_then(|role| role.get("config_file"))
        .and_then(Value::as_str)
        .and_then(managed_relative_path_from_config);

    let mut deleted_backup: Option<(PathBuf, Vec<u8>)> = None;
    if let Some(relative) = maybe_relative {
        let target = resolve_safe_managed_abs_path_for_read(&config.host_path, &relative)?;
        if target.exists() {
            let backup = std::fs::read(&target)?;
            std::fs::remove_file(&target)?;
            deleted_backup = Some((target, backup));
        }
    }

    if let Err(error) = write_config_table(&config.host_path, &table) {
        if let Some((path, backup)) = deleted_backup {
            let _ = std::fs::write(path, backup);
        }
        return Err(error);
    }

    get_agents_settings_at(&config.host_path, &config.display_path)
}

pub fn read_agent_config(input: ReadAgentConfigInput) -> AppResult<ReadAgentConfigOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let relative = resolve_managed_agent_relative_path(&config.host_path, &input.name)?;
    let path = resolve_safe_managed_abs_path_for_write(&config.host_path, &relative)?;
    let content = if path.exists() {
        std::fs::read_to_string(path)?
    } else {
        String::new()
    };
    Ok(ReadAgentConfigOutput { content })
}

pub fn write_agent_config(input: WriteAgentConfigInput) -> AppResult<WriteAgentConfigOutput> {
    let env = resolve_agent_environment(input.agent_environment);
    let config = resolve_config_path(env)?;
    let relative = resolve_managed_agent_relative_path(&config.host_path, &input.name)?;
    let path = resolve_safe_managed_abs_path_for_write(&config.host_path, &relative)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, &input.content)?;
    Ok(WriteAgentConfigOutput {
        content: input.content,
    })
}

fn get_agents_settings_at(
    config_path: &Path,
    config_display_path: &str,
) -> AppResult<AgentsSettingsOutput> {
    let table = read_config_table(config_path)?;
    let multi_agent_enabled = read_multi_agent_enabled(&table);
    let max_threads = read_max_threads(&table);
    let max_depth = read_max_depth(&table);
    let mut agents = collect_agents(config_path, &table)?;
    agents.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(AgentsSettingsOutput {
        config_path: config_display_path.to_string(),
        multi_agent_enabled,
        max_threads,
        max_depth,
        agents,
    })
}

fn collect_agents(
    config_path: &Path,
    table: &Map<String, Value>,
) -> AppResult<Vec<AgentSummaryOutput>> {
    let mut result = Vec::new();
    let Some(agents) = table.get("agents").and_then(Value::as_table) else {
        return Ok(result);
    };
    for (name, value) in agents {
        if is_reserved_agents_key(name) {
            continue;
        }
        let Some(role) = value.as_table() else {
            continue;
        };
        let config_file = role
            .get("config_file")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_default();
        let resolved_path = resolve_config_file_path_for_display(config_path, &config_file)
            .map(|path| path.display().to_string())
            .unwrap_or_else(|| config_path.display().to_string());
        let file_exists = resolve_config_file_path_for_display(config_path, &config_file)
            .map(|path| path.is_file())
            .unwrap_or(false);
        let managed_by_app = managed_relative_path_from_config(&config_file).is_some();
        result.push(AgentSummaryOutput {
            name: name.to_string(),
            description: role
                .get("description")
                .and_then(Value::as_str)
                .and_then(|value| normalize_optional_string(Some(value))),
            config_file,
            resolved_path,
            managed_by_app,
            file_exists,
        });
    }
    Ok(result)
}

fn resolve_config_path(
    agent_environment: AgentEnvironment,
) -> AppResult<crate::infra::filesystem::agent_environment::AgentFsPath> {
    resolve_codex_home_relative_path(agent_environment, ".codex/config.toml")
}

fn read_config_table(path: &Path) -> AppResult<Map<String, Value>> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let text = std::fs::read_to_string(path)?;
    let value: Value = toml::from_str(&text)
        .map_err(|error| AppError::InvalidInput(format!("config.toml 解析失败: {error}")))?;
    Ok(value.as_table().cloned().unwrap_or_default())
}

fn write_config_table(path: &Path, table: &Map<String, Value>) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text =
        toml::to_string_pretty(table).map_err(|error| AppError::Protocol(error.to_string()))?;
    std::fs::write(path, format!("{text}\n"))?;
    Ok(())
}

fn ensure_table_mut<'a>(
    table: &'a mut Map<String, Value>,
    key: &str,
) -> AppResult<&'a mut Map<String, Value>> {
    let entry = table
        .entry(key.to_string())
        .or_insert_with(|| Value::Table(Map::new()));
    entry
        .as_table_mut()
        .ok_or_else(|| AppError::InvalidInput(format!("{key} 必须是 TOML table")))
}

fn set_feature_flag(table: &mut Map<String, Value>, key: &str, enabled: bool) {
    let features = table
        .entry("features".to_string())
        .or_insert_with(|| Value::Table(Map::new()));
    if let Some(features_table) = features.as_table_mut() {
        features_table.insert(key.to_string(), Value::Boolean(enabled));
    }
}

fn read_multi_agent_enabled(table: &Map<String, Value>) -> bool {
    let Some(features) = table.get("features").and_then(Value::as_table) else {
        return false;
    };
    features
        .get("multi_agent")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || features
            .get("multi_agent_v2")
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

fn read_max_threads(table: &Map<String, Value>) -> u32 {
    table
        .get("agents")
        .and_then(Value::as_table)
        .and_then(|agents| agents.get("max_threads"))
        .and_then(Value::as_integer)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| (MIN_AGENT_MAX_THREADS..=MAX_AGENT_MAX_THREADS).contains(value))
        .unwrap_or(DEFAULT_AGENT_MAX_THREADS)
}

fn read_max_depth(table: &Map<String, Value>) -> u32 {
    table
        .get("agents")
        .and_then(Value::as_table)
        .and_then(|agents| agents.get("max_depth"))
        .and_then(Value::as_integer)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| (MIN_AGENT_MAX_DEPTH..=MAX_AGENT_MAX_DEPTH).contains(value))
        .unwrap_or(DEFAULT_AGENT_MAX_DEPTH)
}

fn validate_max_threads(value: u32) -> AppResult<()> {
    if (MIN_AGENT_MAX_THREADS..=MAX_AGENT_MAX_THREADS).contains(&value) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "agents.max_threads 必须在 {} 到 {} 之间",
            MIN_AGENT_MAX_THREADS, MAX_AGENT_MAX_THREADS
        )))
    }
}

fn validate_max_depth(value: u32) -> AppResult<()> {
    if (MIN_AGENT_MAX_DEPTH..=MAX_AGENT_MAX_DEPTH).contains(&value) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "agents.max_depth 必须在 {} 到 {} 之间",
            MIN_AGENT_MAX_DEPTH, MAX_AGENT_MAX_DEPTH
        )))
    }
}

fn normalize_agent_name(raw_name: &str) -> AppResult<String> {
    let mut name = String::new();
    let mut previous_was_space = false;
    for char in raw_name.trim().to_ascii_lowercase().chars() {
        if char.is_ascii_whitespace() {
            if !name.is_empty() && !previous_was_space {
                name.push('-');
            }
            previous_was_space = true;
            continue;
        }
        name.push(char);
        previous_was_space = false;
    }

    if name.is_empty() {
        return Err(AppError::InvalidInput("agent name 不能为空".to_string()));
    }
    if name.len() > 32 {
        return Err(AppError::InvalidInput(
            "agent name 长度不能超过 32".to_string(),
        ));
    }
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return Err(AppError::InvalidInput("agent name 不能为空".to_string()));
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err(AppError::InvalidInput(
            "agent name 必须以小写字母或数字开头".to_string(),
        ));
    }
    for char in chars {
        if !char.is_ascii_lowercase() && !char.is_ascii_digit() && char != '_' && char != '-' {
            return Err(AppError::InvalidInput(
                "agent name 只能包含小写字母、数字、_ 或 -".to_string(),
            ));
        }
    }
    if is_reserved_agents_key(&name) {
        return Err(AppError::InvalidInput("agent name 为保留字段".to_string()));
    }
    Ok(name)
}

fn normalize_lookup_name(raw_name: &str) -> AppResult<String> {
    let name = raw_name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput("agent name 不能为空".to_string()));
    }
    Ok(name.to_string())
}

fn normalize_optional_string(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn is_reserved_agents_key(name: &str) -> bool {
    name == "max_threads" || name == "max_depth"
}

fn has_agent_name_conflict(
    agents: &Map<String, Value>,
    name: &str,
    excluding: Option<&str>,
) -> bool {
    if is_reserved_agents_key(name) {
        return true;
    }
    agents.iter().any(|(existing_name, value)| {
        if is_reserved_agents_key(existing_name) || !value.is_table() {
            return false;
        }
        if excluding.is_some_and(|excluding_name| excluding_name == existing_name) {
            return false;
        }
        existing_name.eq_ignore_ascii_case(name)
    })
}

fn managed_relative_config_for_name(name: &str) -> PathBuf {
    PathBuf::from(MANAGED_AGENTS_DIR).join(format!("{name}.toml"))
}

fn managed_relative_path_from_config(raw_value: &str) -> Option<PathBuf> {
    let normalized = normalize_relative_path(raw_value)?;
    let mut components = normalized.components();
    match components.next() {
        Some(Component::Normal(first)) if first == MANAGED_AGENTS_DIR => Some(normalized),
        _ => None,
    }
}

fn normalize_relative_path(raw_value: &str) -> Option<PathBuf> {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = PathBuf::from(trimmed.replace('\\', "/"));
    if path.is_absolute() {
        return None;
    }
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if normalized.as_os_str().is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn resolve_config_file_path_for_display(config_path: &Path, raw_value: &str) -> Option<PathBuf> {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let raw_path = Path::new(trimmed);
    if raw_path.is_absolute() {
        return Some(raw_path.to_path_buf());
    }
    let relative = normalize_relative_path(raw_value)?;
    Some(codex_home_for_config(config_path)?.join(relative))
}

fn resolve_safe_managed_abs_path_for_write(
    config_path: &Path,
    relative: &Path,
) -> AppResult<PathBuf> {
    let base = codex_home_for_config(config_path)
        .ok_or_else(|| AppError::InvalidInput("无法解析 codex home".to_string()))?;
    let normalized = normalize_relative_path(&relative.to_string_lossy())
        .ok_or_else(|| AppError::InvalidInput("agent config_file 非法".to_string()))?;
    let managed =
        managed_relative_path_from_config(&normalized.to_string_lossy()).ok_or_else(|| {
            AppError::InvalidInput("agent config_file 必须位于 agents/ 下".to_string())
        })?;
    Ok(base.join(managed))
}

fn resolve_safe_managed_abs_path_for_read(
    config_path: &Path,
    relative: &Path,
) -> AppResult<PathBuf> {
    resolve_safe_managed_abs_path_for_write(config_path, relative)
}

fn resolve_managed_agent_relative_path(config_path: &Path, agent_name: &str) -> AppResult<PathBuf> {
    let table = read_config_table(config_path)?;
    let agents = table
        .get("agents")
        .and_then(Value::as_table)
        .ok_or_else(|| AppError::InvalidInput("未配置任何 agents".to_string()))?;
    let role = agents
        .get(agent_name.trim())
        .and_then(Value::as_table)
        .ok_or_else(|| AppError::InvalidInput(format!("agent '{}' 不存在", agent_name.trim())))?;
    let config_file = role
        .get("config_file")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("agent 未配置 config_file".to_string()))?;
    managed_relative_path_from_config(config_file).ok_or_else(|| {
        AppError::InvalidInput("仅支持应用托管的 agents/*.toml 配置文件".to_string())
    })
}

fn codex_home_for_config(config_path: &Path) -> Option<&Path> {
    config_path.parent()
}

fn pathbuf_to_string(path: &Path) -> AppResult<String> {
    path.to_str()
        .map(ToString::to_string)
        .ok_or_else(|| AppError::InvalidInput("路径包含无效字符".to_string()))
}

fn build_agent_config_template() -> &'static str {
    "model = \"gpt-5-codex\"\nreasoning_effort = \"medium\"\n"
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_agent_name, normalize_relative_path, read_max_depth, read_max_threads,
        read_multi_agent_enabled,
    };
    use toml::{map::Map, Value};

    #[test]
    fn normalize_agent_name_rewrites_spaces() {
        assert_eq!(
            normalize_agent_name("Research Lead").unwrap(),
            "research-lead"
        );
    }

    #[test]
    fn normalize_relative_path_rejects_parent_segments() {
        assert!(normalize_relative_path("../agents/a.toml").is_none());
    }

    #[test]
    fn read_agents_limits_use_defaults_when_missing() {
        let table = Map::new();
        assert_eq!(read_max_threads(&table), 6);
        assert_eq!(read_max_depth(&table), 1);
    }

    #[test]
    fn read_agents_limits_accept_in_range_values() {
        let mut agents = Map::new();
        agents.insert("max_threads".to_string(), Value::Integer(8));
        agents.insert("max_depth".to_string(), Value::Integer(3));
        let mut table = Map::new();
        table.insert("agents".to_string(), Value::Table(agents));
        assert_eq!(read_max_threads(&table), 8);
        assert_eq!(read_max_depth(&table), 3);
    }

    #[test]
    fn read_multi_agent_enabled_accepts_v2_flag() {
        let mut features = Map::new();
        features.insert("multi_agent_v2".to_string(), Value::Boolean(true));
        let mut table = Map::new();
        table.insert("features".to_string(), Value::Table(features));

        assert!(read_multi_agent_enabled(&table));
    }
}
