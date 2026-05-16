use std::fs;
use std::path::Path;

use super::*;
use crate::test_support::unique_temp_dir;

fn sample_tokens() -> UpdateChatgptAuthTokensInput {
    UpdateChatgptAuthTokensInput {
        access_token: "token-123".to_string(),
        chatgpt_account_id: "account-123".to_string(),
        chatgpt_plan_type: Some("plus".to_string()),
    }
}

fn write_imported_tokens(root: &Path) {
    let imported = imported_official_path_for_root(root);
    fs::create_dir_all(&imported).unwrap();
    fs::write(
        imported.join("tokens.json"),
        r#"{"accessToken":"imported-token","chatgptAccountId":"imported-account","chatgptPlanType":"plus"}"#,
    )
    .unwrap();
}

#[test]
fn clear_chatgpt_auth_state_removes_cache_and_sets_marker() {
    let root = unique_temp_dir("codex-app-plus", "clear-auth-state");
    let cache_path = chatgpt_auth_cache_path_for_root(&root);
    fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
    fs::write(&cache_path, b"{}").unwrap();

    clear_chatgpt_auth_state_in_root(&root).unwrap();

    assert!(!cache_path.exists());
    assert!(chatgpt_auth_logout_marker_path_for_root(&root).exists());
}

#[test]
fn logged_out_marker_blocks_imported_token_fallback() {
    let root = unique_temp_dir("codex-app-plus", "logout-marker");
    write_imported_tokens(&root);
    clear_chatgpt_auth_state_in_root(&root).unwrap();

    let result = read_chatgpt_auth_tokens_from_root(&root);

    assert!(result.is_err());
    assert!(result
        .err()
        .unwrap()
        .to_string()
        .contains("cleared on logout"));
}

#[test]
fn write_chatgpt_auth_tokens_clears_logout_marker() {
    let root = unique_temp_dir("codex-app-plus", "write-auth-state");
    clear_chatgpt_auth_state_in_root(&root).unwrap();

    let output = write_chatgpt_auth_tokens_to_root(&root, sample_tokens()).unwrap();

    assert_eq!(output.source, "cache");
    assert!(!chatgpt_auth_logout_marker_path_for_root(&root).exists());
    assert!(chatgpt_auth_cache_path_for_root(&root).exists());
}

#[test]
fn import_official_data_clears_logout_marker() {
    let root = unique_temp_dir("codex-app-plus", "import-auth-state");
    let source = unique_temp_dir("codex-app-plus", "import-source");
    fs::create_dir_all(&source).unwrap();
    fs::write(
        source.join("tokens.json"),
        r#"{"accessToken":"source-token","chatgptAccountId":"source-account"}"#,
    )
    .unwrap();
    clear_chatgpt_auth_state_in_root(&root).unwrap();

    import_official_data_into_root(&source, &root).unwrap();
    let output = read_chatgpt_auth_tokens_from_root(&root).unwrap();

    assert_eq!(output.source, "imported");
    assert_eq!(output.access_token, "source-token");
    assert!(!chatgpt_auth_logout_marker_path_for_root(&root).exists());
}
