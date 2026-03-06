const AGENTS_PREFIX: &str = "# AGENTS.md instructions for ";
const ENVIRONMENT_CONTEXT_CLOSE_TAG: &str = "</environment_context>";
const ENVIRONMENT_CONTEXT_OPEN_TAG: &str = "<environment_context>";
const INSTRUCTIONS_CLOSE_TAG: &str = "</INSTRUCTIONS>";
const INSTRUCTIONS_OPEN_TAG: &str = "<INSTRUCTIONS>";
const MAX_TITLE_CHARS: usize = 48;

pub fn summarize_user_message(text: &str) -> Option<String> {
    let normalized = strip_injected_user_context(text);
    if normalized.is_empty() {
        return None;
    }

    let first_line = normalized
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(normalized.as_str());
    Some(truncate_text(first_line, MAX_TITLE_CHARS))
}

fn strip_injected_user_context(text: &str) -> String {
    let mut next_text = text.trim_start().to_string();

    loop {
        let stripped = strip_known_injected_block(&next_text);
        if stripped == next_text {
            return next_text.trim().to_string();
        }
        next_text = stripped.trim_start().to_string();
    }
}

fn strip_known_injected_block(text: &str) -> String {
    if text.starts_with(AGENTS_PREFIX) && text.contains(INSTRUCTIONS_OPEN_TAG) {
        return strip_tagged_block(text, INSTRUCTIONS_CLOSE_TAG);
    }
    if text.starts_with(ENVIRONMENT_CONTEXT_OPEN_TAG) {
        return strip_tagged_block(text, ENVIRONMENT_CONTEXT_CLOSE_TAG);
    }
    text.to_string()
}

fn strip_tagged_block(text: &str, close_tag: &str) -> String {
    let Some(close_index) = text.find(close_tag) else {
        return text.to_string();
    };
    text[(close_index + close_tag.len())..].to_string()
}

fn truncate_text(text: &str, max_chars: usize) -> String {
    let truncated = text.chars().take(max_chars).collect::<String>();
    if text.chars().count() > max_chars {
        return format!("{truncated}...");
    }
    truncated
}

#[cfg(test)]
mod tests {
    use super::summarize_user_message;

    #[test]
    fn summarizes_first_meaningful_user_line() {
        let text = "Fix login issue\nDetailed description";
        assert_eq!(summarize_user_message(text), Some("Fix login issue".to_string()));
    }

    #[test]
    fn strips_agents_and_environment_prefix_before_summarizing() {
        let text = [
            "# AGENTS.md instructions for E:\\code\\boai",
            "",
            "<INSTRUCTIONS>",
            "Global Agent Rules",
            "</INSTRUCTIONS>",
            "<environment_context>",
            "  <cwd>E:\\code\\boai</cwd>",
            "</environment_context>",
            "请优化时间线接口性能",
        ]
        .join("\n");

        assert_eq!(
            summarize_user_message(&text),
            Some("请优化时间线接口性能".to_string())
        );
    }
}
