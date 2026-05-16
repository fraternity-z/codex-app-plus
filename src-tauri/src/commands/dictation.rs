use crate::domains::dictation::models::{
    DictationTranscriptionInput, DictationTranscriptionOutput,
};
use crate::domains::dictation::service::transcribe_dictation_audio;

#[tauri::command]
pub async fn app_transcribe_dictation_audio(
    input: DictationTranscriptionInput,
) -> Result<DictationTranscriptionOutput, String> {
    tokio::task::spawn_blocking(move || transcribe_dictation_audio(input))
        .await
        .map_err(|error| error.to_string())?
}
