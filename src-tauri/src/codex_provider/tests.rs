use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use serde_json::json;

use super::*;

fn temp_dir(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "codex-app-plus-{name}-{}",
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}

fn sample_upsert_input(id: Option<&str>, provider_key: &str) -> UpsertCodexProviderInput {
    UpsertCodexProviderInput {
        id: id.map(ToString::to_string),
        name: "Right Code".to_string(),
        provider_key: provider_key.to_string(),
        api_key: "secret-1".to_string(),
        base_url: "https://right.codes/codex/v1".to_string(),
        model: "gpt-5.4".to_string(),
        auth_json_text: serde_json::to_string_pretty(&json!({ "OPENAI_API_KEY": "secret-1" }))
            .unwrap(),
        config_toml_text: format!(
            "model_provider = \"{provider_key}\"\nmodel = \"gpt-5.4\"\n\n[model_providers.\"{provider_key}\"]\nbase_url = \"https://right.codes/codex/v1\"\nwire_api = \"responses\"\n"
        ),
    }
}

#[test]
fn upsert_creates_and_updates_provider_records() {
    let base_dir = temp_dir("store");
    let store_file = base_dir.join(STORE_FILE_NAME);
    let created = upsert_codex_provider_at(&store_file, sample_upsert_input(None, "right_code")).unwrap();
    assert_eq!(created.provider_key, "right_code");
    thread::sleep(Duration::from_millis(2));
    let updated = upsert_codex_provider_at(
        &store_file,
        UpsertCodexProviderInput {
            id: Some(created.id.clone()),
            name: "Right Code 2".to_string(),
            ..sample_upsert_input(Some(&created.id), "right_code")
        },
    )
    .unwrap();
    let store = read_store(&store_file).unwrap();
    assert_eq!(store.providers.len(), 1);
    assert_eq!(updated.created_at, created.created_at);
    assert!(updated.updated_at >= created.updated_at);
}

#[test]
fn upsert_rejects_duplicate_provider_key() {
    let base_dir = temp_dir("duplicate");
    let store_file = base_dir.join(STORE_FILE_NAME);
    upsert_codex_provider_at(&store_file, sample_upsert_input(None, "right_code")).unwrap();
    let error = upsert_codex_provider_at(&store_file, sample_upsert_input(None, "right_code"))
        .err()
        .unwrap();
    assert!(error.to_string().contains("providerKey"));
}

#[test]
fn apply_merges_auth_and_provider_config() {
    let base_dir = temp_dir("apply");
    let store_file = base_dir.join(STORE_FILE_NAME);
    let auth_path = base_dir.join(AUTH_FILE_NAME);
    let config_path = base_dir.join(CONFIG_FILE_NAME);
    fs::write(&auth_path, serde_json::to_vec_pretty(&json!({ "OTHER": "keep" })).unwrap()).unwrap();
    fs::write(
        &config_path,
        "approval_policy = \"never\"\nmodel_provider = \"old\"\n[model_providers.old]\nbase_url = \"https://old.example\"\n",
    )
    .unwrap();
    let saved = upsert_codex_provider_at(&store_file, sample_upsert_input(None, "right_code")).unwrap();
    let result = apply_codex_provider_at(
        &store_file,
        &auth_path,
        &config_path,
        ApplyCodexProviderInput { id: saved.id.clone() },
    )
    .unwrap();
    let auth_text = fs::read_to_string(&auth_path).unwrap();
    let config_text = fs::read_to_string(&config_path).unwrap();
    assert_eq!(result.provider_key, "right_code");
    assert!(auth_text.contains("OTHER"));
    assert!(auth_text.contains("OPENAI_API_KEY"));
    assert!(config_text.contains("approval_policy"));
    assert!(config_text.contains("[model_providers.old]"));
    assert!(config_text.contains("[model_providers.right_code]"));
}

#[test]
fn write_live_files_rolls_back_auth_when_config_write_fails() {
    let base_dir = temp_dir("rollback");
    let auth_path = base_dir.join(AUTH_FILE_NAME);
    let config_dir = base_dir.join("config-dir");
    fs::create_dir_all(&config_dir).unwrap();
    fs::write(&auth_path, b"old-auth").unwrap();
    let error = write_live_files(&auth_path, b"new-auth", &config_dir, b"bad-config")
        .err()
        .unwrap();
    let restored = fs::read_to_string(&auth_path).unwrap();
    assert!(!error.to_string().is_empty());
    assert_eq!(restored, "old-auth");
}
