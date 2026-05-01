use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use crate::windows_child_process::configure_background_std_command;

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

#[tauri::command]
pub async fn app_transcribe_dictation_audio(
    input: DictationTranscriptionInput,
) -> Result<DictationTranscriptionOutput, String> {
    tokio::task::spawn_blocking(move || transcribe_dictation_audio(input))
        .await
        .map_err(|error| error.to_string())?
}

fn transcribe_dictation_audio(
    input: DictationTranscriptionInput,
) -> Result<DictationTranscriptionOutput, String> {
    let audio = general_purpose::STANDARD
        .decode(input.audio_base64.trim())
        .map_err(|error| format!("录音数据解码失败: {error}"))?;
    validate_wav_audio(&audio)?;

    let audio_path = unique_temp_path("wav");
    let script_path = unique_temp_path("ps1");
    fs::write(&audio_path, &audio).map_err(|error| format!("写入录音文件失败: {error}"))?;
    fs::write(&script_path, POWERSHELL_TRANSCRIBE_SCRIPT)
        .map_err(|error| format!("写入转写脚本失败: {error}"))?;

    let result = run_system_speech_transcription(&script_path, &audio_path, &input.locale);
    let _ = fs::remove_file(&audio_path);
    let _ = fs::remove_file(&script_path);

    result.map(|text| DictationTranscriptionOutput { text })
}

fn validate_wav_audio(audio: &[u8]) -> Result<(), String> {
    if audio.len() <= 44 {
        return Err("录音为空，无法转写。".to_string());
    }
    if audio.get(0..4) != Some(b"RIFF") || audio.get(8..12) != Some(b"WAVE") {
        return Err("录音格式无效，必须是 WAV。".to_string());
    }
    Ok(())
}

fn run_system_speech_transcription(
    script_path: &Path,
    audio_path: &Path,
    locale: &str,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (script_path, audio_path, locale);
        return Err("系统语音转写当前只支持 Windows。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell.exe");
        configure_background_std_command(&mut command);
        let output = command
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(script_path)
            .arg(audio_path)
            .arg(locale)
            .output()
            .map_err(|error| format!("启动系统语音转写失败: {error}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if output.status.success() {
            return Ok(stdout);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("系统语音转写失败。".to_string());
        }
        Err(stderr)
    }
}

fn unique_temp_path(extension: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    std::env::temp_dir().join(format!(
        "codex-app-plus-dictation-{}-{millis}.{extension}",
        std::process::id()
    ))
}

const POWERSHELL_TRANSCRIBE_SCRIPT: &str = r#"
param(
  [Parameter(Mandatory=$true)][string]$AudioPath,
  [string]$Locale = "en-US"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech

function Read-WavPcmAudio([string]$Path) {
  $fileStream = [System.IO.File]::OpenRead($Path)
  $reader = [System.IO.BinaryReader]::new($fileStream)
  try {
    $riff = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    if ($riff -ne "RIFF") {
      throw "Invalid WAV: missing RIFF header."
    }
    [void]$reader.ReadUInt32()
    $wave = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    if ($wave -ne "WAVE") {
      throw "Invalid WAV: missing WAVE header."
    }

    $audioFormat = 0
    $channels = 0
    $sampleRate = 0
    $bitsPerSample = 0
    $dataBytes = $null

    while ($fileStream.Position -lt $fileStream.Length) {
      $chunkNameBytes = $reader.ReadBytes(4)
      if ($chunkNameBytes.Length -lt 4) {
        break
      }
      $chunkName = [System.Text.Encoding]::ASCII.GetString($chunkNameBytes)
      $chunkSize = [int]$reader.ReadUInt32()

      if ($chunkName -eq "fmt ") {
        $audioFormat = [int]$reader.ReadUInt16()
        $channels = [int]$reader.ReadUInt16()
        $sampleRate = [int]$reader.ReadUInt32()
        [void]$reader.ReadUInt32()
        [void]$reader.ReadUInt16()
        $bitsPerSample = [int]$reader.ReadUInt16()
        $remaining = $chunkSize - 16
        if ($remaining -gt 0) {
          [void]$fileStream.Seek($remaining, [System.IO.SeekOrigin]::Current)
        }
      } elseif ($chunkName -eq "data") {
        $dataBytes = $reader.ReadBytes($chunkSize)
      } else {
        [void]$fileStream.Seek($chunkSize, [System.IO.SeekOrigin]::Current)
      }

      if (($chunkSize % 2) -eq 1 -and $fileStream.Position -lt $fileStream.Length) {
        [void]$fileStream.Seek(1, [System.IO.SeekOrigin]::Current)
      }
    }

    if ($audioFormat -ne 1 -or $channels -ne 1 -or $bitsPerSample -ne 16) {
      throw "Invalid WAV: expected 16-bit mono PCM."
    }
    if ($sampleRate -le 0) {
      throw "Invalid WAV: sample rate is missing."
    }
    if ($null -eq $dataBytes -or $dataBytes.Length -eq 0) {
      throw "Invalid WAV: audio data is empty."
    }
    $minimumBytes = [Math]::Floor($sampleRate * 2 * 1.25)
    if ($dataBytes.Length -lt $minimumBytes) {
      $paddedBytes = New-Object byte[] $minimumBytes
      [Array]::Copy($dataBytes, $paddedBytes, $dataBytes.Length)
      $dataBytes = $paddedBytes
    }

    $audioStream = [System.IO.MemoryStream]::new($dataBytes)
    $audioFormatInfo = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
      $sampleRate,
      [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
      [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    return [PSCustomObject]@{
      Stream = $audioStream
      Format = $audioFormatInfo
    }
  }
  finally {
    $reader.Dispose()
    $fileStream.Dispose()
  }
}

function New-DictationRecognizer([string]$LocaleName) {
  $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $target = $null
  if (![string]::IsNullOrWhiteSpace($LocaleName)) {
    $target = $installed | Where-Object { $_.Culture.Name -ieq $LocaleName } | Select-Object -First 1
    if ($null -eq $target -and $LocaleName.StartsWith("zh")) {
      $target = $installed | Where-Object { $_.Culture.Name.StartsWith("zh") } | Select-Object -First 1
    }
    if ($null -eq $target -and $LocaleName.StartsWith("en")) {
      $target = $installed | Where-Object { $_.Culture.Name.StartsWith("en") } | Select-Object -First 1
    }
  }

  if ($null -ne $target) {
    return New-Object System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $target
  }
  return New-Object System.Speech.Recognition.SpeechRecognitionEngine
}

$recognizer = New-DictationRecognizer $Locale
$audio = Read-WavPcmAudio $AudioPath
try {
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $audio.Stream.Position = 0
  $recognizer.SetInputToAudioStream($audio.Stream, $audio.Format)
  $parts = New-Object System.Collections.Generic.List[string]
  while ($true) {
    try {
      $result = $recognizer.Recognize([TimeSpan]::FromSeconds(8))
    }
    catch [System.InvalidOperationException] {
      $message = $_.Exception.Message
      if ($message -like "*No audio input is supplied*" -or $message -like "*没有*音频输入*") {
        break
      }
      throw
    }
    if ($null -eq $result) {
      break
    }
    if (![string]::IsNullOrWhiteSpace($result.Text)) {
      $parts.Add($result.Text)
    }
  }
  [string]::Join(" ", $parts)
}
finally {
  $audio.Stream.Dispose()
  $recognizer.Dispose()
}
"#;
