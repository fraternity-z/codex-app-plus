use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

const LOCK_WAIT_TIMEOUT: Duration = Duration::from_secs(2);
const STALE_LOCK_TIMEOUT: Duration = Duration::from_secs(30);

pub(crate) fn append_prefix_rule(path: &Path, pattern: &[String]) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("empty command pattern".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let _lock = acquire_rules_lock(path)?;
    let existing = fs::read_to_string(path).unwrap_or_default();
    if rule_already_present(&existing, pattern) {
        return Ok(());
    }

    let mut updated = existing;
    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    if !updated.is_empty() {
        updated.push('\n');
    }
    updated.push_str(&format_prefix_rule(pattern));
    if !updated.ends_with('\n') {
        updated.push('\n');
    }

    fs::write(path, updated).map_err(|error| error.to_string())
}

struct RulesFileLock {
    path: PathBuf,
}

impl Drop for RulesFileLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn acquire_rules_lock(path: &Path) -> Result<RulesFileLock, String> {
    let lock_path = path.with_extension("lock");
    let deadline = Instant::now() + LOCK_WAIT_TIMEOUT;
    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_) => return Ok(RulesFileLock { path: lock_path }),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if is_lock_stale(&lock_path) {
                    let _ = fs::remove_file(&lock_path);
                    continue;
                }
                if Instant::now() >= deadline {
                    return Err("timed out waiting for rules file lock".to_string());
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn format_prefix_rule(pattern: &[String]) -> String {
    let items = pattern
        .iter()
        .map(|item| format!("\"{}\"", escape_string(item)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("prefix_rule(\n    pattern = [{items}],\n    decision = \"allow\",\n)\n")
}

fn escape_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn rule_already_present(contents: &str, pattern: &[String]) -> bool {
    let target_pattern = normalize_rule_value(&format_prefix_rule(pattern));
    let mut current_rule = String::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("prefix_rule(") {
            current_rule.clear();
        }
        if current_rule.is_empty() && !trimmed.starts_with("prefix_rule(") {
            continue;
        }
        current_rule.push_str(trimmed);
        if trimmed.starts_with(')') {
            let normalized = normalize_rule_value(&current_rule);
            if normalized.contains(&normalize_rule_value("decision = \"allow\""))
                && normalized.contains(&normalize_rule_value(&target_pattern))
            {
                return true;
            }
            current_rule.clear();
        }
    }
    false
}

fn normalize_rule_value(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

fn is_lock_stale(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    let Ok(age) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    age > STALE_LOCK_TIMEOUT
}

#[cfg(test)]
mod tests {
    use super::append_prefix_rule;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_rules_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("codex-app-plus-rules-{name}-{timestamp}"))
            .join("default.rules")
    }

    #[test]
    fn append_prefix_rule_writes_rule_once() {
        let path = unique_rules_path("dedupe");
        let pattern = vec!["Get-ChildItem".to_string()];

        append_prefix_rule(&path, &pattern).unwrap();
        append_prefix_rule(&path, &pattern).unwrap();

        let contents = fs::read_to_string(&path).unwrap();
        assert_eq!(contents.matches("prefix_rule(").count(), 1);
        let _ = fs::remove_dir_all(path.parent().unwrap().parent().unwrap());
    }

    #[test]
    fn append_prefix_rule_escapes_special_characters() {
        let path = unique_rules_path("escape");
        let pattern = vec![
            "Get-ChildItem".to_string(),
            "C:\\Program Files\\Example".to_string(),
            "quoted\"value".to_string(),
        ];

        append_prefix_rule(&path, &pattern).unwrap();

        let contents = fs::read_to_string(&path).unwrap();
        assert!(contents.contains("\"C:\\\\Program Files\\\\Example\""));
        assert!(contents.contains("\"quoted\\\"value\""));
        let _ = fs::remove_dir_all(path.parent().unwrap().parent().unwrap());
    }

    #[test]
    fn append_prefix_rule_rejects_empty_pattern() {
        let path = unique_rules_path("empty");
        let result = append_prefix_rule(&path, &[]);
        assert!(result.is_err());
    }
}
