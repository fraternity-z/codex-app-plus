use std::fs;
use std::path::PathBuf;

use serde_json::{Map as JsonMap, Value as JsonValue};
use toml::Table;

use super::live::{
    build_oauth_snapshot_from_api_key_live, sanitize_auth_for_chatgpt, sanitize_config_for_chatgpt,
    LiveFiles,
};
use super::live_io::write_live_files;
use crate::test_support::unique_temp_dir;

fn unique_dir(name: &str) -> PathBuf {
    let path = unique_temp_dir("codex-auth", name);
    fs::create_dir_all(&path).unwrap();
    path
}

fn sample_live_files() -> LiveFiles {
    let root = unique_dir("sample");
    let mut auth_map = JsonMap::new();
    auth_map.insert(
        "OPENAI_API_KEY".to_string(),
        JsonValue::String("secret".to_string()),
    );
    let config_table = toml::from_str::<Table>(
        "model_provider = \"demo\"\n[model_providers.demo]\nbase_url = \"https://example.com\"\n[other]\nvalue = 1\n",
    )
    .unwrap();
    LiveFiles {
        auth_path: crate::infra::filesystem::agent_environment::AgentFsPath {
            display_path: root.join("auth.json").display().to_string(),
            host_path: root.join("auth.json"),
        },
        config_path: crate::infra::filesystem::agent_environment::AgentFsPath {
            display_path: root.join("config.toml").display().to_string(),
            host_path: root.join("config.toml"),
        },
        auth_map,
        config_table: config_table.clone(),
        config_text: toml::to_string_pretty(&config_table).unwrap(),
    }
}

#[test]
fn sanitize_config_for_chatgpt_removes_provider_sections() {
    let table = toml::from_str::<Table>(
        "model_provider = \"demo\"\n[model_providers.demo]\nbase_url = \"https://example.com\"\n[other]\nvalue = 1\n",
    )
    .unwrap();
    let sanitized = sanitize_config_for_chatgpt(table);

    assert!(sanitized.get("model_provider").is_none());
    assert!(sanitized.get("model_providers").is_none());
    assert!(sanitized.get("other").is_some());
}

#[test]
fn sanitize_auth_for_chatgpt_removes_auth_markers() {
    let mut auth = JsonMap::new();
    auth.insert(
        "OPENAI_API_KEY".to_string(),
        JsonValue::String("secret".to_string()),
    );
    auth.insert("tokens".to_string(), JsonValue::Object(JsonMap::new()));

    let sanitized = sanitize_auth_for_chatgpt(auth);

    assert!(!sanitized.contains_key("OPENAI_API_KEY"));
    assert!(!sanitized.contains_key("tokens"));
}

#[test]
fn build_oauth_snapshot_from_api_key_live_strips_provider_state() {
    let snapshot = build_oauth_snapshot_from_api_key_live(&sample_live_files()).unwrap();

    assert!(!snapshot.auth_json_text.contains("OPENAI_API_KEY"));
    assert!(!snapshot.config_toml_text.contains("model_provider"));
    assert!(snapshot.config_toml_text.contains("[other]"));
}

#[test]
fn write_live_files_rolls_back_auth_on_failure() {
    let root = unique_dir("rollback");
    let auth_path = root.join("auth.json");
    let config_dir = root.join("config-dir");
    fs::write(&auth_path, b"old-auth").unwrap();
    fs::create_dir_all(&config_dir).unwrap();

    let error = write_live_files(&auth_path, b"new-auth", &config_dir, b"bad")
        .err()
        .unwrap();

    assert!(!error.to_string().is_empty());
    assert_eq!(fs::read_to_string(&auth_path).unwrap(), "old-auth");
}
