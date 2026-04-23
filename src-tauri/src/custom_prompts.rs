use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use toml_edit::DocumentMut;

use crate::agent_environment::resolve_codex_home_relative_path;
use crate::error::{AppError, AppResult};
use crate::models::{
    CustomPromptOutput, DeleteManagedPromptInput, ListCustomPromptsInput, ListManagedPromptsInput,
    ManagedPromptOutput, SetUserModelInstructionsFileInput, UpsertManagedPromptInput,
};

const USER_CONFIG_PATH: &str = ".codex/config.toml";
const MODEL_INSTRUCTIONS_FILE_KEY: &str = "model_instructions_file";

const PROMPTS_DIR: &str = ".codex/prompts";
const MANAGED_PROMPTS_DIR: &str = ".codex/prompts/codex-app-plus";
const MANAGED_PROMPTS_DISPLAY_DIR: &str = "~/.codex/prompts/codex-app-plus";

pub fn list_custom_prompts(input: ListCustomPromptsInput) -> AppResult<Vec<CustomPromptOutput>> {
    let prompts_dir = resolve_codex_home_relative_path(input.agent_environment, PROMPTS_DIR)?;
    discover_prompts_in(&prompts_dir.display_path, &prompts_dir.host_path)
}

pub fn list_managed_prompts(input: ListManagedPromptsInput) -> AppResult<Vec<ManagedPromptOutput>> {
    let prompts_dir =
        resolve_codex_home_relative_path(input.agent_environment, MANAGED_PROMPTS_DIR)?;
    list_managed_prompts_in(MANAGED_PROMPTS_DISPLAY_DIR, &prompts_dir.host_path)
}

pub fn upsert_managed_prompt(input: UpsertManagedPromptInput) -> AppResult<ManagedPromptOutput> {
    let prompts_dir =
        resolve_codex_home_relative_path(input.agent_environment, MANAGED_PROMPTS_DIR)?;
    upsert_managed_prompt_in(
        MANAGED_PROMPTS_DISPLAY_DIR,
        &prompts_dir.host_path,
        input.previous_name.as_deref(),
        &input.name,
        &input.content,
    )
}

pub fn delete_managed_prompt(input: DeleteManagedPromptInput) -> AppResult<()> {
    let prompts_dir =
        resolve_codex_home_relative_path(input.agent_environment, MANAGED_PROMPTS_DIR)?;
    delete_managed_prompt_in(&prompts_dir.host_path, &input.name)
}

pub fn set_user_model_instructions_file(input: SetUserModelInstructionsFileInput) -> AppResult<()> {
    let config_path = resolve_codex_home_relative_path(input.agent_environment, USER_CONFIG_PATH)?;
    let normalized = input
        .path
        .as_deref()
        .map(normalize_config_value_path)
        .transpose()?;
    set_user_model_instructions_file_in(&config_path.host_path, normalized.as_deref())
}

fn set_user_model_instructions_file_in(
    config_path: &Path,
    new_value: Option<&str>,
) -> AppResult<()> {
    let original = match fs::read_to_string(config_path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };

    let updated = update_model_instructions_file_field(&original, new_value)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(config_path, updated)?;
    Ok(())
}

fn normalize_config_value_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("路径不能为空".to_string()));
    }
    // Use forward slashes so toml_edit emits a basic string ("...") even for
    // Windows paths that originally used backslashes.
    Ok(trimmed.replace('\\', "/"))
}

fn update_model_instructions_file_field(
    toml_str: &str,
    new_value: Option<&str>,
) -> AppResult<String> {
    let mut doc = toml_str
        .parse::<DocumentMut>()
        .map_err(|error| AppError::InvalidInput(format!("config.toml 解析失败: {error}")))?;

    match new_value {
        Some(value_str) => {
            doc[MODEL_INSTRUCTIONS_FILE_KEY] = toml_edit::value(value_str);
        }
        None => {
            doc.as_table_mut().remove(MODEL_INSTRUCTIONS_FILE_KEY);
        }
    }

    Ok(doc.to_string())
}

fn discover_prompts_in(display_dir: &str, host_dir: &Path) -> AppResult<Vec<CustomPromptOutput>> {
    let mut prompts = Vec::new();
    let entries = match fs::read_dir(host_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(prompts),
        Err(error) => return Err(error.into()),
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() || !is_markdown_file(&path) {
            continue;
        }

        let Some(name) = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
        else {
            continue;
        };

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let (description, argument_hint, body) = parse_frontmatter(&content);
        prompts.push(CustomPromptOutput {
            name,
            path: join_display_path(display_dir, entry.file_name()),
            content: body,
            description,
            argument_hint,
        });
    }

    prompts.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(prompts)
}

fn list_managed_prompts_in(
    display_dir: &str,
    host_dir: &Path,
) -> AppResult<Vec<ManagedPromptOutput>> {
    fs::create_dir_all(host_dir)?;
    let mut prompts = Vec::new();
    for entry in fs::read_dir(host_dir)? {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() || !is_markdown_file(&path) {
            continue;
        }
        let Some(name) = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        prompts.push(ManagedPromptOutput {
            name,
            path: join_display_path(display_dir, entry.file_name()),
            content,
        });
    }
    prompts.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(prompts)
}

fn upsert_managed_prompt_in(
    display_dir: &str,
    host_dir: &Path,
    previous_name: Option<&str>,
    name: &str,
    content: &str,
) -> AppResult<ManagedPromptOutput> {
    let normalized_name = normalize_managed_prompt_name(name)?;
    let previous_name = previous_name
        .map(normalize_managed_prompt_name)
        .transpose()?;
    fs::create_dir_all(host_dir)?;
    let path = managed_prompt_file_path(host_dir, &normalized_name);
    fs::write(&path, content)?;

    if let Some(previous_name) = previous_name {
        if previous_name != normalized_name {
            remove_managed_prompt_file(host_dir, &previous_name)?;
        }
    }

    Ok(ManagedPromptOutput {
        name: normalized_name.clone(),
        path: join_display_path(display_dir, format!("{normalized_name}.md").into()),
        content: content.to_string(),
    })
}

fn delete_managed_prompt_in(host_dir: &Path, name: &str) -> AppResult<()> {
    let normalized_name = normalize_managed_prompt_name(name)?;
    remove_managed_prompt_file(host_dir, &normalized_name)
}

fn remove_managed_prompt_file(host_dir: &Path, name: &str) -> AppResult<()> {
    match fs::remove_file(managed_prompt_file_path(host_dir, name)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn managed_prompt_file_path(host_dir: &Path, name: &str) -> PathBuf {
    host_dir.join(format!("{name}.md"))
}

fn normalize_managed_prompt_name(input: &str) -> AppResult<String> {
    let trimmed = input.trim();
    let without_extension = if trimmed.to_ascii_lowercase().ends_with(".md") {
        &trimmed[..trimmed.len() - 3]
    } else {
        trimmed
    };
    let name = without_extension.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput("prompt 名称不能为空".to_string()));
    }
    if name == "." || name == ".." {
        return Err(AppError::InvalidInput(
            "prompt 名称不能是 . 或 ..".to_string(),
        ));
    }
    if name.len() > 120 {
        return Err(AppError::InvalidInput(
            "prompt 名称不能超过 120 个字符".to_string(),
        ));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(AppError::InvalidInput(
            "prompt 名称不能以点号或空格结尾".to_string(),
        ));
    }
    if name.chars().any(is_invalid_prompt_name_char) {
        return Err(AppError::InvalidInput(
            "prompt 名称不能包含路径分隔符或 Windows 保留字符".to_string(),
        ));
    }

    let reserved_base = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    if matches!(
        reserved_base.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        return Err(AppError::InvalidInput(
            "prompt 名称不能使用 Windows 保留设备名".to_string(),
        ));
    }

    Ok(name.to_string())
}

fn is_invalid_prompt_name_char(value: char) -> bool {
    value.is_control() || matches!(value, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn join_display_path(display_dir: &str, file_name: std::ffi::OsString) -> String {
    let name = file_name.to_string_lossy();
    if display_dir.ends_with('/') || display_dir.ends_with('\\') {
        return format!("{display_dir}{name}");
    }
    let separator = if display_dir.contains('/') { "/" } else { "\\" };
    format!("{display_dir}{separator}{name}")
}

fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>, String) {
    let mut segments = content.split_inclusive('\n');
    let Some(first_segment) = segments.next() else {
        return (None, None, String::new());
    };
    if first_segment.trim_end_matches(['\r', '\n']).trim() != "---" {
        return (None, None, content.to_string());
    }

    let mut description = None;
    let mut argument_hint = None;
    let mut consumed = first_segment.len();
    let mut closed = false;

    for segment in segments {
        let trimmed = segment.trim_end_matches(['\r', '\n']).trim();
        if trimmed == "---" {
            consumed += segment.len();
            closed = true;
            break;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            consumed += segment.len();
            continue;
        }

        if let Some((key, value)) = trimmed.split_once(':') {
            let normalized_key = key.trim().to_ascii_lowercase();
            let normalized_value = trim_wrapping_quotes(value.trim());
            match normalized_key.as_str() {
                "description" => description = Some(normalized_value),
                "argument-hint" | "argument_hint" => argument_hint = Some(normalized_value),
                _ => {}
            }
        }
        consumed += segment.len();
    }

    if !closed {
        return (None, None, content.to_string());
    }

    let body = if consumed >= content.len() {
        String::new()
    } else {
        content[consumed..].to_string()
    };
    (description, argument_hint, body)
}

fn trim_wrapping_quotes(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
    {
        return value[1..value.len() - 1].to_string();
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        delete_managed_prompt_in, discover_prompts_in, list_managed_prompts_in,
        normalize_config_value_path, parse_frontmatter, set_user_model_instructions_file_in,
        update_model_instructions_file_field, upsert_managed_prompt_in,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("codex-app-plus-{name}-{timestamp}"))
    }

    fn cleanup(path: &Path) {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
            return;
        }
        let _ = fs::remove_file(path);
    }

    #[test]
    fn parse_frontmatter_reads_supported_keys() {
        let input = "---\n\
description: Review current branch\n\
argument-hint: USER BRANCH\n\
---\n\
Review $USER changes on $BRANCH\n";

        let (description, argument_hint, body) = parse_frontmatter(input);

        assert_eq!(description.as_deref(), Some("Review current branch"));
        assert_eq!(argument_hint.as_deref(), Some("USER BRANCH"));
        assert_eq!(body, "Review $USER changes on $BRANCH\n");
    }

    #[test]
    fn parse_frontmatter_keeps_original_text_when_unterminated() {
        let input = "---\n\
description: Broken\n";

        let (description, argument_hint, body) = parse_frontmatter(input);

        assert_eq!(description, None);
        assert_eq!(argument_hint, None);
        assert_eq!(body, input);
    }

    #[test]
    fn discover_prompts_returns_sorted_markdown_prompts() {
        let dir = unique_path("custom-prompts");
        fs::create_dir_all(&dir).expect("create prompts dir");
        fs::write(
            dir.join("review.md"),
            "---\n\
description: Review current branch\n\
argument_hint: USER BRANCH\n\
---\n\
Review $USER changes on $BRANCH\n",
        )
        .expect("write review prompt");
        fs::write(dir.join("zzz.md"), "Plain body\n").expect("write second prompt");
        fs::write(dir.join("notes.txt"), "ignore").expect("write ignored file");

        let prompts =
            discover_prompts_in("~/.codex/prompts", &dir).expect("discover custom prompts");

        assert_eq!(prompts.len(), 2);
        assert_eq!(prompts[0].name, "review");
        assert_eq!(prompts[0].path, "~/.codex/prompts/review.md");
        assert_eq!(
            prompts[0].description.as_deref(),
            Some("Review current branch")
        );
        assert_eq!(prompts[0].argument_hint.as_deref(), Some("USER BRANCH"));
        assert_eq!(prompts[0].content, "Review $USER changes on $BRANCH\n");
        assert_eq!(prompts[1].name, "zzz");
        cleanup(&dir);
    }

    #[test]
    fn discover_prompts_returns_empty_when_directory_is_missing() {
        let dir = unique_path("missing-custom-prompts");
        let prompts =
            discover_prompts_in("~/.codex/prompts", &dir).expect("missing dir should not fail");

        assert!(prompts.is_empty());
    }

    #[test]
    fn list_managed_prompts_creates_directory_and_reads_raw_markdown() {
        let dir = unique_path("managed-prompts");

        let prompts = list_managed_prompts_in("~/.codex/prompts/codex-app-plus", &dir)
            .expect("missing managed prompts dir should be created");

        assert!(dir.is_dir());
        assert!(prompts.is_empty());

        fs::write(
            dir.join("system-prompt.md"),
            "---\nraw frontmatter\n---\nBody\n",
        )
        .expect("write prompt");
        fs::write(dir.join("notes.txt"), "ignore").expect("write ignored file");

        let prompts = list_managed_prompts_in("~/.codex/prompts/codex-app-plus", &dir)
            .expect("discover managed prompts");

        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].name, "system-prompt");
        assert_eq!(
            prompts[0].path,
            "~/.codex/prompts/codex-app-plus/system-prompt.md"
        );
        assert_eq!(prompts[0].content, "---\nraw frontmatter\n---\nBody\n");
        cleanup(&dir);
    }

    #[test]
    fn upsert_managed_prompt_writes_and_renames_markdown_file() {
        let dir = unique_path("managed-prompt-upsert");

        let created = upsert_managed_prompt_in(
            "~/.codex/prompts/codex-app-plus",
            &dir,
            None,
            "review-system",
            "Always review risks.\n",
        )
        .expect("create prompt");

        assert_eq!(created.name, "review-system");
        assert_eq!(
            fs::read_to_string(dir.join("review-system.md")).expect("read created prompt"),
            "Always review risks.\n"
        );

        let updated = upsert_managed_prompt_in(
            "~/.codex/prompts/codex-app-plus",
            &dir,
            Some("review-system"),
            "system-prompt.md",
            "Use concise Chinese.\n",
        )
        .expect("rename prompt");

        assert_eq!(updated.name, "system-prompt");
        assert!(!dir.join("review-system.md").exists());
        assert_eq!(
            fs::read_to_string(dir.join("system-prompt.md")).expect("read renamed prompt"),
            "Use concise Chinese.\n"
        );
        cleanup(&dir);
    }

    #[test]
    fn delete_managed_prompt_ignores_missing_files_but_rejects_unsafe_names() {
        let dir = unique_path("managed-prompt-delete");
        fs::create_dir_all(&dir).expect("create prompt dir");
        fs::write(dir.join("temporary.md"), "tmp").expect("write prompt");

        delete_managed_prompt_in(&dir, "temporary").expect("delete existing prompt");
        delete_managed_prompt_in(&dir, "temporary").expect("ignore missing prompt");
        let error = delete_managed_prompt_in(&dir, "../outside")
            .expect_err("path traversal should be rejected");

        assert!(error.to_string().contains("保留字符"));
        cleanup(&dir);
    }

    #[test]
    fn normalize_config_value_path_forces_forward_slashes() {
        assert_eq!(
            normalize_config_value_path("C:\\Users\\me\\.codex\\prompts\\sys.md")
                .expect("normalize Windows path"),
            "C:/Users/me/.codex/prompts/sys.md",
        );
        assert_eq!(
            normalize_config_value_path("  ~/.codex/prompts/sys.md  ")
                .expect("trim and keep forward slashes"),
            "~/.codex/prompts/sys.md",
        );
        assert!(normalize_config_value_path("   ").is_err());
    }

    #[test]
    fn update_model_instructions_file_places_key_before_provider_section() {
        let input = "model_provider = \"packycode\"\n\
model = \"gpt-5.4\"\n\
\n\
[model_providers.packycode]\n\
name = \"packycode\"\n";

        let output = update_model_instructions_file_field(
            input,
            Some("~/.codex/prompts/codex-app-plus/system-prompt.md"),
        )
        .expect("write key");

        assert!(output.contains(
            "model_instructions_file = \"~/.codex/prompts/codex-app-plus/system-prompt.md\"\n"
        ));
        assert!(
            output.find("model_instructions_file").unwrap()
                < output.find("[model_providers.packycode]").unwrap(),
            "new key must sit above the first table header",
        );

        let parsed: toml::Value = toml::from_str(&output).expect("valid TOML");
        assert_eq!(
            parsed
                .get("model_instructions_file")
                .and_then(|v| v.as_str()),
            Some("~/.codex/prompts/codex-app-plus/system-prompt.md"),
        );
        assert_eq!(
            parsed
                .get("model_providers")
                .and_then(|v| v.get("packycode"))
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str()),
            Some("packycode"),
        );
    }

    #[test]
    fn update_model_instructions_file_replaces_existing_value_and_preserves_comments() {
        let input = "# My Codex config\n\
model = \"gpt-5\"\n\
model_instructions_file = \"~/.codex/prompts/old.md\"\n\
\n\
[model_providers.packycode]\n\
name = \"packycode\"\n";

        let output = update_model_instructions_file_field(
            input,
            Some("~/.codex/prompts/codex-app-plus/new.md"),
        )
        .expect("replace key");

        assert!(output.contains("# My Codex config"));
        assert!(output.contains("model_instructions_file = \"~/.codex/prompts/codex-app-plus/new.md\"\n"));
        assert!(!output.contains("old.md"));
    }

    #[test]
    fn update_model_instructions_file_removes_key_when_given_none() {
        let input = "model = \"gpt-5\"\n\
model_instructions_file = \"~/.codex/prompts/old.md\"\n\
\n\
[model_providers.packycode]\n\
name = \"packycode\"\n";

        let output = update_model_instructions_file_field(input, None).expect("clear key");

        assert!(!output.contains("model_instructions_file"));
        assert!(output.contains("[model_providers.packycode]"));
    }

    #[test]
    fn set_user_model_instructions_file_in_round_trips_on_disk() {
        let dir = unique_path("set-user-mi-file");
        fs::create_dir_all(&dir).expect("create dir");
        let config_path = dir.join("config.toml");
        fs::write(
            &config_path,
            "model_provider = \"packycode\"\n\
model = \"gpt-5.4\"\n\
\n\
[model_providers.packycode]\n\
name = \"packycode\"\n",
        )
        .expect("seed config");

        set_user_model_instructions_file_in(
            &config_path,
            Some("~/.codex/prompts/codex-app-plus/system-prompt.md"),
        )
        .expect("write key");

        let on_disk = fs::read_to_string(&config_path).expect("read back config");
        assert!(on_disk.contains(
            "model_instructions_file = \"~/.codex/prompts/codex-app-plus/system-prompt.md\"\n"
        ));
        assert!(
            on_disk.find("model_instructions_file").unwrap()
                < on_disk.find("[model_providers.packycode]").unwrap(),
            "key must appear above the first table header"
        );

        set_user_model_instructions_file_in(&config_path, None).expect("clear key");
        let cleared = fs::read_to_string(&config_path).expect("read back cleared config");
        assert!(!cleared.contains("model_instructions_file"));
        cleanup(&dir);
    }
}
