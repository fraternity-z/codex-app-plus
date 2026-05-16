use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use crate::error::AppResult;
use crate::models::GlobalAgentInstructionsOutput;

pub fn read_global_agent_instructions_at(
    display_path: String,
    host_path: &Path,
) -> AppResult<GlobalAgentInstructionsOutput> {
    let content = match fs::read_to_string(host_path) {
        Ok(content) => content,
        Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };

    Ok(GlobalAgentInstructionsOutput {
        path: display_path,
        content,
    })
}

#[cfg(test)]
mod tests {
    use super::read_global_agent_instructions_at;
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
    fn returns_empty_content_when_agents_file_is_missing() {
        let path = unique_path("missing-agents");
        let output = read_global_agent_instructions_at("~/.codex/AGENTS.md".to_string(), &path)
            .expect("missing AGENTS.md should load as empty");

        assert_eq!(output.path, "~/.codex/AGENTS.md");
        assert_eq!(output.content, "");
    }

    #[test]
    fn returns_file_content_when_agents_file_exists() {
        let path = unique_path("existing-agents");
        fs::write(&path, "优先给结论。\n").expect("write AGENTS.md");

        let output = read_global_agent_instructions_at("~/.codex/AGENTS.md".to_string(), &path)
            .expect("existing AGENTS.md should load");

        assert_eq!(output.content, "优先给结论。\n");
        cleanup(&path);
    }

    #[test]
    fn surfaces_non_not_found_io_errors() {
        let path = unique_path("agents-directory");
        fs::create_dir_all(&path).expect("create directory");

        let error = read_global_agent_instructions_at("~/.codex/AGENTS.md".to_string(), &path)
            .expect_err("directory reads should fail");

        assert!(error.to_string().contains("IO 错误"));
        cleanup(&path);
    }
}
