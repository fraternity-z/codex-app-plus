use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTranscriptionInput {
    pub audio_base64: String,
    pub locale: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationTranscriptionOutput {
    pub text: String,
}
