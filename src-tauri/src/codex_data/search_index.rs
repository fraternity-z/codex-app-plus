use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult};
use crate::models::{
    AgentEnvironment, CodexSessionSearchMatch, CodexSessionSearchResult, CodexSessionSummary,
};

const SEARCH_INDEX_VERSION: &str = "2";
const SEARCH_INDEX_DIR: &str = "session-search-index";
const MIN_TRIGRAM_QUERY_CHARS: usize = 3;

static SEARCH_INDEX_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionFileSignature {
    file_size: i64,
    modified_at_ms: i64,
}

#[derive(Debug, Clone)]
struct IndexedSession {
    thread_id: String,
    path: String,
    file_size: i64,
    modified_at_ms: i64,
}

#[derive(Debug)]
struct SearchRow {
    thread_id: String,
    title: String,
    cwd: String,
    updated_at: String,
    line_text: String,
    line_number: usize,
}

pub(crate) fn search_sessions(
    root: &Path,
    agent_environment: AgentEnvironment,
    query: &str,
    limit: usize,
) -> AppResult<Vec<CodexSessionSearchResult>> {
    let _guard = SEARCH_INDEX_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|error| {
            AppError::Protocol(format!("session search index lock poisoned: {error}"))
        })?;
    let normalized_query = query.to_lowercase();
    let mut connection = open_search_index(root, agent_environment)?;
    refresh_search_index(&mut connection, root, agent_environment)?;
    search_indexed_sessions(&connection, agent_environment, &normalized_query, limit)
}

fn open_search_index(root: &Path, agent_environment: AgentEnvironment) -> AppResult<Connection> {
    let path = session_search_index_path(agent_environment)?;
    let parent = path.parent().ok_or_else(|| {
        AppError::InvalidInput(format!(
            "invalid session search index path: {}",
            path.display()
        ))
    })?;
    fs::create_dir_all(parent)?;

    let connection = Connection::open(path)?;
    connection.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        ",
    )?;
    ensure_schema(&connection)?;

    let expected_root = path_key(root);
    let cached_version = read_meta_value(&connection, "version")?;
    let cached_root = read_meta_value(&connection, "root_path")?;
    if cached_version.as_deref() != Some(SEARCH_INDEX_VERSION)
        || cached_root.as_deref() != Some(expected_root.as_str())
    {
        reset_schema(&connection)?;
        ensure_schema(&connection)?;
        write_meta_value(&connection, "version", SEARCH_INDEX_VERSION)?;
        write_meta_value(&connection, "root_path", &expected_root)?;
    }

    Ok(connection)
}

fn ensure_schema(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS session_search_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_search_sessions (
            thread_id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            file_size INTEGER NOT NULL,
            modified_at_ms INTEGER NOT NULL,
            title TEXT NOT NULL,
            cwd TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS session_search_lines USING fts5(
            thread_id UNINDEXED,
            line_number UNINDEXED,
            line_text UNINDEXED,
            normalized_text,
            tokenize = 'trigram'
        );
        ",
    )?;
    Ok(())
}

fn reset_schema(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "
        DROP TABLE IF EXISTS session_search_lines;
        DROP TABLE IF EXISTS session_search_sessions;
        DROP TABLE IF EXISTS session_search_meta;
        ",
    )?;
    Ok(())
}

fn read_meta_value(connection: &Connection, key: &str) -> AppResult<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM session_search_meta WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
}

fn write_meta_value(connection: &Connection, key: &str, value: &str) -> AppResult<()> {
    connection.execute(
        "
        INSERT INTO session_search_meta (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ",
        params![key, value],
    )?;
    Ok(())
}

fn refresh_search_index(
    connection: &mut Connection,
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<()> {
    let signatures = collect_current_signatures(root)?;
    let indexed_sessions = load_indexed_sessions(connection)?;
    let transaction = connection.transaction()?;

    for indexed in indexed_sessions.values() {
        let current_signature = signatures.get(&indexed.path);
        if current_signature.is_some_and(|signature| indexed.matches_signature(signature)) {
            continue;
        }
        remove_indexed_session(&transaction, &indexed.thread_id)?;
    }

    for (path_key, signature) in signatures {
        if indexed_sessions
            .get(&path_key)
            .is_some_and(|indexed| indexed.matches_signature(&signature))
        {
            continue;
        }

        let path = Path::new(&path_key);
        let Some(summary) = super::read_session_summary(path, agent_environment)? else {
            continue;
        };
        remove_indexed_session(&transaction, &summary.id)?;
        insert_indexed_session(&transaction, path, &signature, &summary)?;
        insert_session_lines(&transaction, path, &summary.id)?;
    }

    transaction.commit()?;
    Ok(())
}

fn load_indexed_sessions(connection: &Connection) -> AppResult<HashMap<String, IndexedSession>> {
    let mut statement = connection.prepare(
        "
        SELECT thread_id, path, file_size, modified_at_ms
        FROM session_search_sessions
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(IndexedSession {
            thread_id: row.get(0)?,
            path: row.get(1)?,
            file_size: row.get(2)?,
            modified_at_ms: row.get(3)?,
        })
    })?;

    let mut sessions = HashMap::new();
    for row in rows {
        let session = row?;
        sessions.insert(session.path.clone(), session);
    }
    Ok(sessions)
}

impl IndexedSession {
    fn matches_signature(&self, signature: &SessionFileSignature) -> bool {
        self.file_size == signature.file_size && self.modified_at_ms == signature.modified_at_ms
    }
}

fn remove_indexed_session(connection: &Connection, thread_id: &str) -> AppResult<()> {
    connection.execute(
        "DELETE FROM session_search_lines WHERE thread_id = ?1",
        [thread_id],
    )?;
    connection.execute(
        "DELETE FROM session_search_sessions WHERE thread_id = ?1",
        [thread_id],
    )?;
    Ok(())
}

fn insert_indexed_session(
    connection: &Connection,
    path: &Path,
    signature: &SessionFileSignature,
    summary: &CodexSessionSummary,
) -> AppResult<()> {
    connection.execute(
        "
        INSERT INTO session_search_sessions (
            thread_id,
            path,
            file_size,
            modified_at_ms,
            title,
            cwd,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ",
        params![
            summary.id,
            path_key(path),
            signature.file_size,
            signature.modified_at_ms,
            summary.title,
            summary.cwd,
            summary.updated_at,
        ],
    )?;
    Ok(())
}

fn insert_session_lines(connection: &Connection, path: &Path, thread_id: &str) -> AppResult<()> {
    let mut statement = connection.prepare(
        "
        INSERT INTO session_search_lines (
            thread_id,
            line_number,
            line_text,
            normalized_text
        )
        VALUES (?1, ?2, ?3, ?4)
        ",
    )?;

    for (line_index, line) in BufReader::new(File::open(path)?).lines().enumerate() {
        let value = super::parse_line(&line?)?;
        let Some(role) = super::read_message_role(&value) else {
            continue;
        };
        let Some(text) = super::read_message_text(&value, role) else {
            continue;
        };
        for message_line in text.lines() {
            let trimmed = message_line.trim();
            if trimmed.is_empty() {
                continue;
            }
            statement.execute(params![
                thread_id,
                (line_index + 1) as i64,
                trimmed,
                trimmed.to_lowercase(),
            ])?;
        }
    }

    Ok(())
}

fn search_indexed_sessions(
    connection: &Connection,
    agent_environment: AgentEnvironment,
    normalized_query: &str,
    limit: usize,
) -> AppResult<Vec<CodexSessionSearchResult>> {
    let sql = if normalized_query.chars().count() >= MIN_TRIGRAM_QUERY_CHARS {
        "
        SELECT
            session_search_sessions.thread_id,
            session_search_sessions.title,
            session_search_sessions.cwd,
            session_search_sessions.updated_at,
            session_search_lines.line_text,
            CAST(session_search_lines.line_number AS INTEGER)
        FROM session_search_lines
        JOIN session_search_sessions
            ON session_search_sessions.thread_id = session_search_lines.thread_id
        WHERE session_search_lines MATCH ?1
            AND instr(session_search_lines.normalized_text, ?2) > 0
        ORDER BY session_search_sessions.updated_at DESC,
            session_search_sessions.thread_id ASC,
            CAST(session_search_lines.line_number AS INTEGER) ASC
        "
    } else {
        "
        SELECT
            session_search_sessions.thread_id,
            session_search_sessions.title,
            session_search_sessions.cwd,
            session_search_sessions.updated_at,
            session_search_lines.line_text,
            CAST(session_search_lines.line_number AS INTEGER)
        FROM session_search_lines
        JOIN session_search_sessions
            ON session_search_sessions.thread_id = session_search_lines.thread_id
        WHERE instr(session_search_lines.normalized_text, ?2) > 0
        ORDER BY session_search_sessions.updated_at DESC,
            session_search_sessions.thread_id ASC,
            CAST(session_search_lines.line_number AS INTEGER) ASC
        "
    };
    let fts_query = create_fts_phrase_query(normalized_query);
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![fts_query, normalized_query], |row| {
        Ok(SearchRow {
            thread_id: row.get(0)?,
            title: row.get(1)?,
            cwd: row.get(2)?,
            updated_at: row.get(3)?,
            line_text: row.get(4)?,
            line_number: row.get::<_, i64>(5)? as usize,
        })
    })?;

    let mut result_positions = HashMap::<String, usize>::new();
    let mut results = Vec::<CodexSessionSearchResult>::new();
    for row in rows {
        let row = row?;
        let existing_position = result_positions.get(&row.thread_id).copied();
        if existing_position.is_none() && results.len() >= limit {
            break;
        }
        let Some((start_column, end_column)) = find_match_columns(&row.line_text, normalized_query)
        else {
            continue;
        };
        let search_match = CodexSessionSearchMatch {
            line_text: row.line_text,
            line_number: row.line_number,
            start_column,
            end_column,
        };

        if let Some(position) = existing_position {
            let result = &mut results[position];
            if result.matches.len() < super::MAX_MATCHES_PER_SESSION {
                result.matches.push(search_match);
            }
            continue;
        }

        result_positions.insert(row.thread_id.clone(), results.len());
        results.push(CodexSessionSearchResult {
            id: row.thread_id,
            title: row.title,
            cwd: row.cwd,
            updated_at: row.updated_at,
            agent_environment,
            matches: vec![search_match],
        });
    }

    Ok(results)
}

fn create_fts_phrase_query(query: &str) -> String {
    format!("\"{}\"", query.replace('"', "\"\""))
}

fn find_match_columns(line_text: &str, normalized_query: &str) -> Option<(usize, usize)> {
    let (normalized_line, spans) = normalize_with_original_spans(line_text);
    let normalized_start = normalized_line.find(normalized_query)?;
    let normalized_end = normalized_start.saturating_add(normalized_query.len());
    let original_start = original_byte_for_normalized_byte(&spans, normalized_start)?;
    let original_end = original_byte_for_normalized_end(&spans, normalized_end)?;
    Some((
        utf16_column_for_byte(line_text, original_start),
        utf16_column_for_byte(line_text, original_end),
    ))
}

fn normalize_with_original_spans(value: &str) -> (String, Vec<(usize, usize, usize, usize)>) {
    let mut normalized = String::with_capacity(value.len());
    let mut spans = Vec::new();
    for (original_start, character) in value.char_indices() {
        let original_end = original_start + character.len_utf8();
        for lowered in character.to_lowercase() {
            let normalized_start = normalized.len();
            normalized.push(lowered);
            let normalized_end = normalized.len();
            spans.push((
                normalized_start,
                normalized_end,
                original_start,
                original_end,
            ));
        }
    }
    (normalized, spans)
}

fn original_byte_for_normalized_byte(
    spans: &[(usize, usize, usize, usize)],
    normalized_byte: usize,
) -> Option<usize> {
    spans
        .iter()
        .find(|(start, end, _, _)| normalized_byte >= *start && normalized_byte < *end)
        .map(|(_, _, original_start, _)| *original_start)
}

fn original_byte_for_normalized_end(
    spans: &[(usize, usize, usize, usize)],
    normalized_byte: usize,
) -> Option<usize> {
    if normalized_byte == 0 {
        return Some(0);
    }
    spans
        .iter()
        .find(|(start, end, _, _)| normalized_byte > *start && normalized_byte <= *end)
        .map(|(_, _, _, original_end)| *original_end)
}

fn utf16_column_for_byte(value: &str, byte_index: usize) -> usize {
    value[..byte_index].encode_utf16().count() + 1
}

fn collect_current_signatures(root: &Path) -> AppResult<HashMap<String, SessionFileSignature>> {
    let mut files = Vec::new();
    super::collect_session_files(root, &mut files)?;
    let mut signatures = HashMap::with_capacity(files.len());
    for file in files {
        signatures.insert(path_key(&file), read_file_signature(&file)?);
    }
    Ok(signatures)
}

fn read_file_signature(path: &Path) -> AppResult<SessionFileSignature> {
    let metadata = fs::metadata(path)?;
    let modified_at_ms = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            AppError::InvalidInput(format!(
                "failed to read modified time for {}: {error}",
                path.display()
            ))
        })?
        .as_millis() as u64;
    Ok(SessionFileSignature {
        file_size: metadata.len() as i64,
        modified_at_ms: modified_at_ms as i64,
    })
}

fn session_search_index_path(agent_environment: AgentEnvironment) -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    let environment_name = match agent_environment {
        AgentEnvironment::WindowsNative => "windows-native",
        AgentEnvironment::Wsl => "wsl",
    };
    Ok(local_data
        .join("CodexAppPlus")
        .join(SEARCH_INDEX_DIR)
        .join(format!("{environment_name}.sqlite")))
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
