use crate::agent_environment::resolve_codex_home_relative_path;
use crate::codex_session_text::summarize_user_message;
use crate::error::{AppError, AppResult};
use crate::events::emit_codex_session_index_updated;
use crate::models::{
    AgentEnvironment, CodexSessionIndexUpdatedPayload, CodexSessionMessage, CodexSessionReadInput,
    CodexSessionReadOutput, CodexSessionSearchResult, CodexSessionSummary, DeleteCodexSessionInput,
    SearchCodexSessionsInput,
};
use serde_json::Value;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::AppHandle;

mod index;
mod search_index;
#[cfg(test)]
mod tests;
const SUMMARY_TAIL_BYTES: u64 = 64 * 1024;
const DEFAULT_SEARCH_LIMIT: usize = 20;
const MAX_SEARCH_LIMIT: usize = 100;
const MAX_MATCHES_PER_SESSION: usize = 3;

struct SessionHeader {
    session_id: String,
    cwd: String,
    title: Option<String>,
}

pub fn list_codex_sessions(
    app: AppHandle,
    agent_environment: AgentEnvironment,
) -> AppResult<Vec<CodexSessionSummary>> {
    let root = codex_sessions_root(agent_environment)?;
    let sessions = index::list_cached_session_summaries(&root, agent_environment)?;
    if index::session_index_needs_refresh(&root, agent_environment)? {
        spawn_session_index_refresh(app, root, agent_environment);
    }
    Ok(sessions)
}

pub fn read_codex_session(input: CodexSessionReadInput) -> AppResult<CodexSessionReadOutput> {
    validate_thread_id(&input.thread_id)?;

    let root = codex_sessions_root(input.agent_environment)?;
    let path = index::find_session_path(&root, input.agent_environment, &input.thread_id)?;
    let messages = read_session_messages(&path, &input.thread_id)?;
    Ok(CodexSessionReadOutput {
        thread_id: input.thread_id,
        messages,
    })
}

pub fn search_codex_sessions(
    input: SearchCodexSessionsInput,
) -> AppResult<Vec<CodexSessionSearchResult>> {
    let query = input.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let root = codex_sessions_root(input.agent_environment)?;
    let limit = input
        .limit
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .max(1)
        .min(MAX_SEARCH_LIMIT);
    search_index::search_sessions(&root, input.agent_environment, query, limit)
}

pub fn delete_codex_session(input: DeleteCodexSessionInput) -> AppResult<()> {
    validate_thread_id(&input.thread_id)?;

    let root = codex_sessions_root(input.agent_environment)?;
    delete_session_by_id(&root, input.agent_environment, &input.thread_id)
}

fn validate_thread_id(thread_id: &str) -> AppResult<()> {
    if thread_id.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "threadId cannot be empty".to_string(),
        ));
    }
    Ok(())
}

fn codex_sessions_root(agent_environment: AgentEnvironment) -> AppResult<PathBuf> {
    Ok(resolve_codex_home_relative_path(agent_environment, ".codex/sessions")?.host_path)
}
fn spawn_session_index_refresh(app: AppHandle, root: PathBuf, agent_environment: AgentEnvironment) {
    std::thread::spawn(move || {
        let started_at = Instant::now();
        match index::list_session_summaries(&root, agent_environment) {
            Ok(sessions) => {
                let payload = CodexSessionIndexUpdatedPayload {
                    agent_environment,
                    duration_ms: started_at.elapsed().as_millis() as u64,
                    session_count: sessions.len(),
                };
                if let Err(error) = emit_codex_session_index_updated(&app, payload) {
                    eprintln!("emit codex-session-index-updated failed: {error}");
                }
            }
            Err(error) => {
                eprintln!("refresh codex session index failed: {error}");
            }
        }
    });
}

fn collect_session_files(root: &Path, files: &mut Vec<PathBuf>) -> AppResult<()> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_session_files(&path, files)?;
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
    Ok(())
}

fn read_session_summary(
    path: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<Option<CodexSessionSummary>> {
    let Some(header) = read_session_header(path)? else {
        return Ok(None);
    };
    let updated_at = read_session_updated_at(path)?;

    Ok(Some(CodexSessionSummary {
        id: header.session_id,
        title: header
            .title
            .unwrap_or_else(|| infer_name_from_path(&header.cwd)),
        cwd: header.cwd,
        updated_at: updated_at.unwrap_or_default(),
        agent_environment,
    }))
}

fn read_session_header(path: &Path) -> AppResult<Option<SessionHeader>> {
    let mut session_id = None;
    let mut cwd = None;
    let mut title = None;

    for line in BufReader::new(File::open(path)?).lines() {
        let value = parse_line(&line?)?;
        if session_id.is_none() {
            session_id = read_session_id(&value);
            cwd = read_session_cwd(&value);
        }
        if title.is_none() {
            title = read_message_role(&value)
                .filter(|role| *role == "user")
                .and_then(|role| read_message_text(&value, role))
                .and_then(|text| summarize_user_message(&text));
        }
        if session_id.is_some() && cwd.is_some() && title.is_some() {
            break;
        }
    }

    let Some(session_id) = session_id else {
        return Ok(None);
    };
    let Some(cwd) = cwd else {
        return Ok(None);
    };

    Ok(Some(SessionHeader {
        session_id,
        cwd,
        title,
    }))
}

fn read_session_updated_at(path: &Path) -> AppResult<Option<String>> {
    read_timestamp_from_tail(path).or_else(|_| read_last_timestamp(path))
}

fn read_timestamp_from_tail(path: &Path) -> AppResult<Option<String>> {
    let mut file = File::open(path)?;
    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return Ok(None);
    }

    let start = file_len.saturating_sub(SUMMARY_TAIL_BYTES);
    file.seek(SeekFrom::Start(start))?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;

    let text = String::from_utf8_lossy(&bytes);
    for line in text.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(value) = parse_line(trimmed) {
            if let Some(timestamp) = read_timestamp(&value) {
                return Ok(Some(timestamp));
            }
        }
    }

    read_last_timestamp(path)
}

fn read_last_timestamp(path: &Path) -> AppResult<Option<String>> {
    let mut updated_at = None;

    for line in BufReader::new(File::open(path)?).lines() {
        let value = parse_line(&line?)?;
        updated_at = read_timestamp(&value).or(updated_at);
    }

    Ok(updated_at)
}

fn delete_session_by_id(
    root: &Path,
    agent_environment: AgentEnvironment,
    thread_id: &str,
) -> AppResult<()> {
    let path = index::find_session_path(root, agent_environment, thread_id)?;
    fs::remove_file(&path)?;
    prune_empty_session_dirs(path.parent(), root)?;
    index::remove_session(root, agent_environment, thread_id, &path)
}

fn prune_empty_session_dirs(mut current: Option<&Path>, root: &Path) -> AppResult<()> {
    while let Some(directory) = current {
        if directory == root || !directory.starts_with(root) {
            break;
        }
        if fs::read_dir(directory)?.next().is_some() {
            break;
        }
        fs::remove_dir(directory)?;
        current = directory.parent();
    }
    Ok(())
}

fn read_session_messages(path: &Path, thread_id: &str) -> AppResult<Vec<CodexSessionMessage>> {
    let mut messages = Vec::new();

    for (index, line) in BufReader::new(File::open(path)?).lines().enumerate() {
        let value = parse_line(&line?)?;
        let Some(role) = read_message_role(&value) else {
            continue;
        };
        let Some(text) = read_message_text(&value, role) else {
            continue;
        };
        if text.is_empty() {
            continue;
        }
        messages.push(CodexSessionMessage {
            id: format!("{thread_id}:local:{index}"),
            role: role.to_string(),
            text,
        });
    }

    Ok(messages)
}

fn parse_line(line: &str) -> AppResult<Value> {
    serde_json::from_str(line).map_err(Into::into)
}

fn read_timestamp(value: &Value) -> Option<String> {
    value
        .get("timestamp")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn read_session_id(value: &Value) -> Option<String> {
    value
        .get("type")
        .and_then(Value::as_str)
        .filter(|kind| *kind == "session_meta")?;
    value
        .get("payload")?
        .get("id")?
        .as_str()
        .map(ToOwned::to_owned)
}

fn read_session_cwd(value: &Value) -> Option<String> {
    value
        .get("type")
        .and_then(Value::as_str)
        .filter(|kind| *kind == "session_meta")?;
    value
        .get("payload")?
        .get("cwd")?
        .as_str()
        .map(ToOwned::to_owned)
}

fn read_message_role(value: &Value) -> Option<&str> {
    value
        .get("type")
        .and_then(Value::as_str)
        .filter(|kind| *kind == "response_item")?;
    value
        .get("payload")?
        .get("type")?
        .as_str()
        .filter(|kind| *kind == "message")?;
    value.get("payload")?.get("role")?.as_str()
}

fn read_message_text(value: &Value, role: &str) -> Option<String> {
    let content = value.get("payload")?.get("content")?.as_array()?;
    let expected_type = if role == "assistant" {
        "output_text"
    } else {
        "input_text"
    };
    let parts = content
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some(expected_type))
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("\n"))
}

fn infer_name_from_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or(path)
        .to_string()
}
