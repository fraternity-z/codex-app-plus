use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::agent_environment::resolve_codex_home_relative_path;
use crate::codex_session_text::summarize_user_message;
use crate::error::{AppError, AppResult};
use crate::models::{
    AgentEnvironment, CodexSessionMessage, CodexSessionReadInput, CodexSessionReadOutput,
    CodexSessionSummary, DeleteCodexSessionInput,
};

const SUMMARY_TAIL_BYTES: u64 = 64 * 1024;

struct SessionHeader {
    session_id: String,
    cwd: String,
    title: Option<String>,
}

pub fn list_codex_sessions(
    agent_environment: AgentEnvironment,
) -> AppResult<Vec<CodexSessionSummary>> {
    let mut files = Vec::new();
    collect_session_files(&codex_sessions_root(agent_environment)?, &mut files)?;

    let mut sessions = Vec::new();
    for file in files {
        if let Some(summary) = read_session_summary(&file, agent_environment)? {
            sessions.push(summary);
        }
    }

    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(sessions)
}

pub fn read_codex_session(input: CodexSessionReadInput) -> AppResult<CodexSessionReadOutput> {
    validate_thread_id(&input.thread_id)?;

    let path = find_session_file(input.agent_environment, &input.thread_id)?;
    let messages = read_session_messages(&path, &input.thread_id)?;
    Ok(CodexSessionReadOutput {
        thread_id: input.thread_id,
        messages,
    })
}

pub fn delete_codex_session(input: DeleteCodexSessionInput) -> AppResult<()> {
    validate_thread_id(&input.thread_id)?;

    let root = codex_sessions_root(input.agent_environment)?;
    delete_session_by_id(&root, &input.thread_id)
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

fn find_session_file(agent_environment: AgentEnvironment, thread_id: &str) -> AppResult<PathBuf> {
    find_session_file_in_root(&codex_sessions_root(agent_environment)?, thread_id)
}

fn find_session_file_in_root(root: &Path, thread_id: &str) -> AppResult<PathBuf> {
    let mut files = Vec::new();
    collect_session_files(root, &mut files)?;

    for file in files {
        if session_file_matches(&file, thread_id)? {
            return Ok(file);
        }
    }

    Err(AppError::InvalidInput(format!(
        "session not found: {thread_id}"
    )))
}

fn delete_session_by_id(root: &Path, thread_id: &str) -> AppResult<()> {
    let path = find_session_file_in_root(root, thread_id)?;
    fs::remove_file(&path)?;
    prune_empty_session_dirs(path.parent(), root)
}

fn prune_empty_session_dirs(mut current: Option<&Path>, root: &Path) -> AppResult<()> {
    while let Some(directory) = current {
        if directory == root || directory.starts_with(root) == false {
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

fn session_file_matches(path: &Path, thread_id: &str) -> AppResult<bool> {
    for line in BufReader::new(File::open(path)?).lines().take(3) {
        let value = parse_line(&line?)?;
        if read_session_id(&value).as_deref() == Some(thread_id) {
            return Ok(true);
        }
    }
    Ok(false)
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::models::AgentEnvironment;

    use super::{delete_session_by_id, infer_name_from_path, read_session_summary};

    fn create_temp_session_file(contents: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("codex-app-plus-session-{suffix}.jsonl"));
        fs::write(&path, contents).expect("write temp session file");
        path
    }

    fn create_temp_session_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("codex-app-plus-sessions-{suffix}"));
        fs::create_dir_all(&path).expect("create temp session root");
        path
    }

    fn write_session_file(root: &Path, relative_path: &str, contents: &str) -> PathBuf {
        let path = root.join(relative_path);
        let parent = path.parent().expect("session file parent");
        fs::create_dir_all(parent).expect("create session file parent");
        fs::write(&path, contents).expect("write session file");
        path
    }

    #[test]
    fn infers_name_from_windows_path() {
        assert_eq!(
            infer_name_from_path("e:\\code\\MathStudyPlatform"),
            "MathStudyPlatform"
        );
    }

    #[test]
    fn reads_summary_from_header_and_tail() {
        let filler = "x".repeat(80_000);
        let contents = [
            "{\"timestamp\":\"2026-03-01T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"thread-1\",\"cwd\":\"E:/code/project\"}}\n",
            "{\"timestamp\":\"2026-03-01T10:00:01Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"Fix slow startup\"}]}}\n",
            "{\"timestamp\":\"2026-03-01T10:00:02Z\",\"type\":\"log\",\"payload\":{\"text\":\"",
            filler.as_str(),
            "\"}}\n",
            "{\"timestamp\":\"2026-03-01T10:09:59Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"done\"}]}}\n"
        ]
        .join("");
        let path = create_temp_session_file(&contents);

        let summary = read_session_summary(&path, AgentEnvironment::WindowsNative)
            .expect("read summary")
            .expect("session summary present");

        assert_eq!(summary.id, "thread-1");
        assert_eq!(summary.title, "Fix slow startup");
        assert_eq!(summary.cwd, "E:/code/project");
        assert_eq!(summary.updated_at, "2026-03-01T10:09:59Z");
        assert_eq!(summary.agent_environment, AgentEnvironment::WindowsNative);

        fs::remove_file(path).expect("remove temp session file");
    }

    #[test]
    fn ignores_developer_messages_when_picking_session_title() {
        let contents = [
            "{\"timestamp\":\"2026-03-01T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"thread-2\",\"cwd\":\"E:/code/project\"}}\n",
            "{\"timestamp\":\"2026-03-01T10:00:01Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"developer\",\"content\":[{\"type\":\"input_text\",\"text\":\"<permissions instructions>\\nFilesystem sandboxing defines which files can be read or written.\\n</permissions instructions>\"}]}}\n",
            "{\"timestamp\":\"2026-03-01T10:00:02Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"真正的首条用户消息\"}]}}\n"
        ]
        .join("");
        let path = create_temp_session_file(&contents);

        let summary = read_session_summary(&path, AgentEnvironment::Wsl)
            .expect("read summary")
            .expect("session summary present");

        assert_eq!(summary.title, "真正的首条用户消息");
        assert_eq!(summary.agent_environment, AgentEnvironment::Wsl);

        fs::remove_file(path).expect("remove temp session file");
    }

    #[test]
    fn deletes_session_file_and_prunes_empty_directories() {
        let root = create_temp_session_root();
        let contents = "{\"timestamp\":\"2026-03-01T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"thread-delete\",\"cwd\":\"E:/code/project\"}}\n";
        let path = write_session_file(&root, "2026/03/thread-delete.jsonl", contents);

        delete_session_by_id(&root, "thread-delete").expect("delete session");

        assert!(!path.exists());
        assert!(!root.join("2026/03").exists());
        assert!(root.exists());

        fs::remove_dir_all(root).expect("remove temp session root");
    }
}
