use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::AgentEnvironment;

use super::{delete_session_by_id, index, infer_name_from_path, read_session_summary};

static SESSION_INDEX_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_session_index_tests() -> MutexGuard<'static, ()> {
    SESSION_INDEX_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("lock session index tests")
}

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

fn build_session_contents(thread_id: &str, title: &str, updated_at: &str) -> String {
    [
        format!(
            "{{\"timestamp\":\"2026-03-01T10:00:00Z\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"{thread_id}\",\"cwd\":\"E:/code/project\"}}}}\n"
        ),
        format!(
            "{{\"timestamp\":\"2026-03-01T10:00:01Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":[{{\"type\":\"input_text\",\"text\":\"{title}\"}}]}}}}\n"
        ),
        format!(
            "{{\"timestamp\":\"{updated_at}\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{{\"type\":\"output_text\",\"text\":\"done\"}}]}}}}\n"
        ),
    ]
    .join("")
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
        "{\"timestamp\":\"2026-03-01T10:09:59Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"done\"}]}}\n",
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
        "{\"timestamp\":\"2026-03-01T10:00:02Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"真正的首条用户消息\"}]}}\n",
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
fn list_session_summaries_refreshes_changed_file() {
    let _guard = lock_session_index_tests();
    let root = create_temp_session_root();
    let relative_path = "2026/03/rollout-thread-cache.jsonl";
    write_session_file(
        &root,
        relative_path,
        &build_session_contents("thread-cache", "First title", "2026-03-01T10:09:59Z"),
    );

    let first = index::list_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("prime session index");
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].title, "First title");

    write_session_file(
        &root,
        relative_path,
        &build_session_contents("thread-cache", "Updated title", "2026-03-01T11:00:00Z"),
    );

    let second = index::list_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("refresh session index");

    assert_eq!(second.len(), 1);
    assert_eq!(second[0].title, "Updated title");
    assert_eq!(second[0].updated_at, "2026-03-01T11:00:00Z");

    fs::remove_dir_all(root).expect("remove temp session root");
}

#[test]
fn cached_session_summaries_return_immediately_before_refresh() {
    let _guard = lock_session_index_tests();
    let root = create_temp_session_root();
    let relative_path = "2026/03/rollout-thread-cached.jsonl";
    write_session_file(
        &root,
        relative_path,
        &build_session_contents("thread-cached", "Cached title", "2026-03-01T10:09:59Z"),
    );

    let _ = index::list_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("prime session index");
    write_session_file(
        &root,
        relative_path,
        &build_session_contents("thread-cached", "Updated title", "2026-03-01T11:00:00Z"),
    );

    let cached = index::list_cached_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("read cached session summaries");

    assert_eq!(cached.len(), 1);
    assert_eq!(cached[0].title, "Cached title");
    assert!(index::session_index_needs_refresh(&root, AgentEnvironment::WindowsNative)
        .expect("detect stale session index"));

    fs::remove_dir_all(root).expect("remove temp session root");
}

#[test]
fn find_session_path_uses_indexed_lookup() {
    let _guard = lock_session_index_tests();
    let root = create_temp_session_root();
    let path = write_session_file(
        &root,
        "2026/03/rollout-thread-read.jsonl",
        &build_session_contents("thread-read", "Read me", "2026-03-01T10:09:59Z"),
    );

    let _ = index::list_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("prime session index");
    let resolved = index::find_session_path(&root, AgentEnvironment::WindowsNative, "thread-read")
        .expect("resolve indexed session path");

    assert_eq!(resolved, path);

    fs::remove_dir_all(root).expect("remove temp session root");
}

#[test]
fn deletes_session_file_and_prunes_empty_directories() {
    let _guard = lock_session_index_tests();
    let root = create_temp_session_root();
    let path = write_session_file(
        &root,
        "2026/03/thread-delete.jsonl",
        &build_session_contents("thread-delete", "Delete me", "2026-03-01T10:09:59Z"),
    );
    let _ = index::list_session_summaries(&root, AgentEnvironment::WindowsNative)
        .expect("prime session index");

    delete_session_by_id(&root, AgentEnvironment::WindowsNative, "thread-delete")
        .expect("delete session");

    assert!(!path.exists());
    assert!(!root.join("2026/03").exists());
    assert!(root.exists());
    let error = index::find_session_path(&root, AgentEnvironment::WindowsNative, "thread-delete")
        .expect_err("session should be removed from index");
    assert!(error.to_string().contains("session not found"));

    fs::remove_dir_all(root).expect("remove temp session root");
}
