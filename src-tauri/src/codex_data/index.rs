use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{AgentEnvironment, CodexSessionSummary};

const SESSION_INDEX_VERSION: u32 = 1;
const SESSION_INDEX_DIR: &str = "session-index";

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionFileSignature {
    file_size: u64,
    modified_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedSessionEntry {
    thread_id: String,
    path: String,
    file_size: u64,
    modified_at_ms: u64,
    title: String,
    cwd: String,
    updated_at: String,
}

impl CachedSessionEntry {
    fn from_summary(
        path: &Path,
        signature: SessionFileSignature,
        summary: CodexSessionSummary,
    ) -> Self {
        Self {
            thread_id: summary.id,
            path: path_key(path),
            file_size: signature.file_size,
            modified_at_ms: signature.modified_at_ms,
            title: summary.title,
            cwd: summary.cwd,
            updated_at: summary.updated_at,
        }
    }

    fn matches_signature(&self, signature: &SessionFileSignature) -> bool {
        self.file_size == signature.file_size && self.modified_at_ms == signature.modified_at_ms
    }

    fn to_summary(&self, agent_environment: AgentEnvironment) -> CodexSessionSummary {
        CodexSessionSummary {
            id: self.thread_id.clone(),
            title: self.title.clone(),
            cwd: self.cwd.clone(),
            updated_at: self.updated_at.clone(),
            agent_environment,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionIndexCache {
    version: u32,
    root_path: String,
    entries: Vec<CachedSessionEntry>,
}

impl SessionIndexCache {
    fn empty(root: &Path) -> Self {
        Self {
            version: SESSION_INDEX_VERSION,
            root_path: path_key(root),
            entries: Vec::new(),
        }
    }

    fn find_entry(&self, thread_id: &str) -> Option<&CachedSessionEntry> {
        self.entries
            .iter()
            .find(|entry| entry.thread_id == thread_id)
    }
}

pub(crate) fn list_cached_session_summaries(
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<Vec<CodexSessionSummary>> {
    let cache = load_session_index(root, agent_environment)?;
    Ok(map_sorted_session_summaries(&cache, agent_environment))
}

pub(crate) fn list_session_summaries(
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<Vec<CodexSessionSummary>> {
    let cache = refresh_session_index(root, agent_environment)?;
    Ok(map_sorted_session_summaries(&cache, agent_environment))
}

pub(crate) fn session_index_needs_refresh(
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<bool> {
    let cache = load_session_index(root, agent_environment)?;
    let signatures = collect_current_signatures(root)?;
    Ok(cache_matches_signatures(&cache, &signatures) == false)
}

pub(crate) fn find_session_path(
    root: &Path,
    agent_environment: AgentEnvironment,
    thread_id: &str,
) -> AppResult<PathBuf> {
    let cache = load_session_index(root, agent_environment)?;
    if let Some(entry) = cache.find_entry(thread_id) {
        let path = PathBuf::from(&entry.path);
        if cached_entry_is_current(entry)? {
            return Ok(path);
        }
    }

    let refreshed = refresh_session_index(root, agent_environment)?;
    refreshed
        .find_entry(thread_id)
        .map(|entry| PathBuf::from(&entry.path))
        .ok_or_else(|| AppError::InvalidInput(format!("session not found: {thread_id}")))
}

fn cached_entry_is_current(entry: &CachedSessionEntry) -> AppResult<bool> {
    let path = Path::new(&entry.path);
    match fs::metadata(path) {
        Ok(metadata) => Ok(entry.matches_signature(&signature_from_metadata(path, &metadata)?)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn remove_session(
    root: &Path,
    agent_environment: AgentEnvironment,
    thread_id: &str,
    removed_path: &Path,
) -> AppResult<()> {
    let mut cache = load_session_index(root, agent_environment)?;
    let removed_path = path_key(removed_path);
    cache
        .entries
        .retain(|entry| entry.thread_id != thread_id && entry.path != removed_path);
    save_session_index(&cache, agent_environment)
}

fn refresh_session_index(
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<SessionIndexCache> {
    let cached_entries = load_session_index(root, agent_environment)?
        .entries
        .into_iter()
        .map(|entry| (entry.path.clone(), entry))
        .collect::<HashMap<_, _>>();

    let mut files = Vec::new();
    super::collect_session_files(root, &mut files)?;

    let mut entries = Vec::with_capacity(files.len());
    for file in files {
        let signature = read_file_signature(&file)?;
        let key = path_key(&file);
        if let Some(cached) = cached_entries.get(&key) {
            if cached.matches_signature(&signature) {
                entries.push(cached.clone());
                continue;
            }
        }
        if let Some(summary) = super::read_session_summary(&file, agent_environment)? {
            entries.push(CachedSessionEntry::from_summary(&file, signature, summary));
        }
    }

    let cache = SessionIndexCache {
        version: SESSION_INDEX_VERSION,
        root_path: path_key(root),
        entries,
    };
    save_session_index(&cache, agent_environment)?;
    Ok(cache)
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

fn cache_matches_signatures(
    cache: &SessionIndexCache,
    signatures: &HashMap<String, SessionFileSignature>,
) -> bool {
    if cache.entries.len() != signatures.len() {
        return false;
    }
    cache.entries.iter().all(|entry| {
        signatures
            .get(&entry.path)
            .is_some_and(|signature| entry.matches_signature(signature))
    })
}

fn map_sorted_session_summaries(
    cache: &SessionIndexCache,
    agent_environment: AgentEnvironment,
) -> Vec<CodexSessionSummary> {
    let mut sessions = cache
        .entries
        .iter()
        .map(|entry| entry.to_summary(agent_environment))
        .collect::<Vec<_>>();
    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    sessions
}

fn load_session_index(
    root: &Path,
    agent_environment: AgentEnvironment,
) -> AppResult<SessionIndexCache> {
    let path = session_index_path(agent_environment)?;
    if !path.exists() {
        return Ok(SessionIndexCache::empty(root));
    }

    let content = fs::read_to_string(&path)?;
    let Ok(cache) = serde_json::from_str::<SessionIndexCache>(&content) else {
        eprintln!(
            "failed to parse session index cache at {}; rebuilding",
            path.display()
        );
        return Ok(SessionIndexCache::empty(root));
    };
    if cache.version != SESSION_INDEX_VERSION || cache.root_path != path_key(root) {
        return Ok(SessionIndexCache::empty(root));
    }
    Ok(cache)
}

fn save_session_index(
    cache: &SessionIndexCache,
    agent_environment: AgentEnvironment,
) -> AppResult<()> {
    let path = session_index_path(agent_environment)?;
    let parent = path.parent().ok_or_else(|| {
        AppError::InvalidInput(format!("invalid session index path: {}", path.display()))
    })?;
    fs::create_dir_all(parent)?;
    fs::write(path, serde_json::to_vec(cache)?)?;
    Ok(())
}

fn session_index_path(agent_environment: AgentEnvironment) -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    let environment_name = match agent_environment {
        AgentEnvironment::WindowsNative => "windows-native",
        AgentEnvironment::Wsl => "wsl",
    };
    Ok(local_data
        .join("CodexAppPlus")
        .join(SESSION_INDEX_DIR)
        .join(format!("{environment_name}.json")))
}

fn read_file_signature(path: &Path) -> AppResult<SessionFileSignature> {
    let metadata = fs::metadata(path)?;
    signature_from_metadata(path, &metadata)
}

fn signature_from_metadata(
    path: &Path,
    metadata: &fs::Metadata,
) -> AppResult<SessionFileSignature> {
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
        file_size: metadata.len(),
        modified_at_ms,
    })
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
