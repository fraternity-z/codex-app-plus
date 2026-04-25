use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tokio::io::AsyncWriteExt;

use crate::codex_cli::CodexCli;
use crate::command_utils::command_failure_detail;
use crate::error::{AppError, AppResult};
use crate::models::AppServerStartInput;

use super::models::{GitGenerateCommitMessageInput, GitGenerateCommitMessageOutput};
use super::process::run_git;
use super::repository::require_repository_context;
use super::runtime::RepositoryContextCache;

const DIFF_CHAR_LIMIT: usize = 120_000;
const CODEX_API_KEY_ENV_VAR: &str = "CODEX_API_KEY";
const OPENAI_API_KEY_ENV_VAR: &str = "OPENAI_API_KEY";

pub async fn generate_commit_message(
    input: GitGenerateCommitMessageInput,
    cache: &RepositoryContextCache,
) -> AppResult<GitGenerateCommitMessageOutput> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let stat = run_git(
        &context.repo_root,
        &[
            OsString::from("diff"),
            OsString::from("--cached"),
            OsString::from("--stat"),
        ],
    )?;
    let diff = run_git(
        &context.repo_root,
        &[
            OsString::from("diff"),
            OsString::from("--cached"),
            OsString::from("--"),
        ],
    )?;
    if diff.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "没有已暂存的更改可用于生成提交消息。".to_string(),
        ));
    }

    let prompt = build_commit_message_prompt(
        stat.trim(),
        &truncate_diff(&diff),
        input.instructions.as_deref().unwrap_or_default().trim(),
    );
    let schema_path = write_temp_file("schema", COMMIT_MESSAGE_SCHEMA)?;
    let message_path = write_temp_file("message", "")?;
    let cli = CodexCli::resolve(&AppServerStartInput {
        agent_environment: input.agent_environment,
        codex_path: None,
    })?;
    let result = run_codex_exec(
        &cli,
        &context.repo_root,
        &schema_path,
        &message_path,
        &prompt,
    )
    .await;
    let _ = fs::remove_file(&schema_path);
    let message_text = fs::read_to_string(&message_path).unwrap_or_default();
    let _ = fs::remove_file(&message_path);
    result?;

    Ok(GitGenerateCommitMessageOutput {
        message: parse_generated_message(&message_text)?,
    })
}

async fn run_codex_exec(
    cli: &CodexCli,
    repo_root: &Path,
    schema_path: &Path,
    message_path: &Path,
    prompt: &str,
) -> AppResult<()> {
    let schema_path_text = schema_path.to_string_lossy().to_string();
    let message_path_text = message_path.to_string_lossy().to_string();
    let exec_args = codex_exec_args(&schema_path_text, &message_path_text);
    let mut command = cli.command_for_args(&exec_args);
    remove_api_key_environment(&mut command);
    command.current_dir(repo_root);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(AppError::from)?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Protocol("无法写入 Codex exec stdin".to_string()))?;
    stdin
        .write_all(prompt.as_bytes())
        .await
        .map_err(AppError::from)?;
    stdin.shutdown().await.map_err(AppError::from)?;
    drop(stdin);

    let output = child.wait_with_output().await.map_err(AppError::from)?;
    if output.status.success() {
        return Ok(());
    }

    Err(AppError::Protocol(format!(
        "生成提交消息失败: {}",
        command_failure_detail(&output.stderr, &output.stdout, output.status.to_string())
    )))
}

fn remove_api_key_environment(command: &mut tokio::process::Command) {
    command.env_remove(CODEX_API_KEY_ENV_VAR);
    command.env_remove(OPENAI_API_KEY_ENV_VAR);
}

fn codex_exec_args<'a>(schema_path_text: &'a str, message_path_text: &'a str) -> Vec<&'a str> {
    vec![
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--output-schema",
        schema_path_text,
        "--output-last-message",
        message_path_text,
        "-",
    ]
}

fn build_commit_message_prompt(stat: &str, diff: &str, instructions: &str) -> String {
    let custom_instructions = if instructions.is_empty() {
        "无".to_string()
    } else {
        instructions.to_string()
    };
    format!(
        "Generate a git commit message for the staged changes below.\n\
Return JSON matching the provided schema. The `message` field must contain only the final commit message.\n\
Rules:\n\
- Prefer a concise Conventional Commit subject when it clearly fits.\n\
- Use imperative mood.\n\
- Keep the subject line under 72 characters when possible.\n\
- Add a body only when it materially improves clarity.\n\
- Do not wrap the message in Markdown or mention that it was generated.\n\n\
Custom instructions:\n{custom_instructions}\n\n\
Staged diff stat:\n{stat}\n\n\
Staged diff:\n```diff\n{diff}\n```"
    )
}

fn truncate_diff(diff: &str) -> String {
    if diff.chars().count() <= DIFF_CHAR_LIMIT {
        return diff.to_string();
    }
    let mut truncated = diff.chars().take(DIFF_CHAR_LIMIT).collect::<String>();
    truncated.push_str("\n\n[diff truncated]");
    truncated
}

fn parse_generated_message(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::Protocol("Codex 未返回提交消息。".to_string()));
    }

    let parsed = serde_json::from_str::<Value>(trimmed)
        .ok()
        .and_then(|value| match value {
            Value::Object(object) => object
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string),
            Value::String(value) => Some(value),
            _ => None,
        })
        .unwrap_or_else(|| trimmed.to_string());
    let cleaned = strip_markdown_fence(parsed.trim()).trim().to_string();
    if cleaned.is_empty() {
        return Err(AppError::Protocol("Codex 返回的提交消息为空。".to_string()));
    }
    Ok(cleaned)
}

fn strip_markdown_fence(value: &str) -> &str {
    let Some(rest) = value.strip_prefix("```") else {
        return value;
    };
    let content = rest
        .strip_prefix("text")
        .or_else(|| rest.strip_prefix("commit"))
        .unwrap_or(rest)
        .trim_start_matches(['\r', '\n']);
    content.strip_suffix("```").unwrap_or(content)
}

fn write_temp_file(label: &str, content: &str) -> AppResult<PathBuf> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::Protocol(error.to_string()))?
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "codex-app-plus-commit-message-{label}-{}-{stamp}.json",
        std::process::id()
    ));
    fs::write(&path, content).map_err(AppError::from)?;
    Ok(path)
}

const COMMIT_MESSAGE_SCHEMA: &str = r#"{
  "type": "object",
  "additionalProperties": false,
  "required": ["message"],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1
    }
  }
}"#;

#[cfg(test)]
mod tests {
    use super::{
        codex_exec_args, parse_generated_message, strip_markdown_fence, truncate_diff,
        DIFF_CHAR_LIMIT,
    };

    #[test]
    fn codex_exec_ignores_user_config_for_auth_mode_flexibility() {
        let args = codex_exec_args("schema.json", "message.json");

        assert!(args.contains(&"--ignore-user-config"));
    }

    #[test]
    fn parses_json_commit_message() {
        let message =
            parse_generated_message(r#"{"message":"feat: add commit flow"}"#).expect("message");

        assert_eq!(message, "feat: add commit flow");
    }

    #[test]
    fn strips_markdown_fence_from_fallback_message() {
        assert_eq!(
            strip_markdown_fence("```commit\nfeat: add commit flow\n```").trim(),
            "feat: add commit flow"
        );
    }

    #[test]
    fn truncates_large_diffs() {
        let diff = "a".repeat(DIFF_CHAR_LIMIT + 10);
        let truncated = truncate_diff(&diff);

        assert!(truncated.ends_with("[diff truncated]"));
    }
}
