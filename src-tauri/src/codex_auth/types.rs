use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexOauthSnapshot {
    pub(crate) auth_json_text: String,
    pub(crate) config_toml_text: String,
    pub(crate) updated_at: i64,
}
