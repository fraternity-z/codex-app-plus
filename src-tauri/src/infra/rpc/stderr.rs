use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tauri::AppHandle;

use crate::error::AppResult;
use crate::events::emit_fatal;

const STDERR_TAIL_LINES: usize = 20;
const STDERR_SECTION_TITLE: &str = "Recent app-server stderr:";

#[derive(Clone)]
pub struct AppServerStderrLog {
    state: Arc<Mutex<StderrState>>,
}

struct StderrState {
    lines: VecDeque<String>,
    max_lines: usize,
}

impl Default for AppServerStderrLog {
    fn default() -> Self {
        Self::new()
    }
}

impl AppServerStderrLog {
    pub fn new() -> Self {
        Self::with_capacity(STDERR_TAIL_LINES)
    }

    fn with_capacity(max_lines: usize) -> Self {
        Self {
            state: Arc::new(Mutex::new(StderrState {
                lines: VecDeque::with_capacity(max_lines),
                max_lines,
            })),
        }
    }

    pub fn record_line(&self, line: impl Into<String>) {
        let line = line.into();
        if line.is_empty() {
            return;
        }
        let mut state = self.state.lock().expect("app-server stderr log poisoned");
        if state.lines.len() == state.max_lines {
            state.lines.pop_front();
        }
        state.lines.push_back(line);
    }

    pub fn format_fatal(&self, message: impl Into<String>) -> String {
        let message = message.into();
        let lines = self.recent_lines();
        if lines.is_empty() {
            return message;
        }
        format!("{message}\n\n{STDERR_SECTION_TITLE}\n{}", lines.join("\n"))
    }

    fn recent_lines(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("app-server stderr log poisoned")
            .lines
            .iter()
            .cloned()
            .collect()
    }
}

pub fn emit_app_server_fatal(
    app: &AppHandle,
    stderr_log: &AppServerStderrLog,
    message: impl Into<String>,
) -> AppResult<()> {
    emit_fatal(app, stderr_log.format_fatal(message))
}

#[cfg(test)]
mod tests {
    use super::AppServerStderrLog;

    #[test]
    fn keeps_only_the_recent_stderr_tail() {
        let stderr_log = AppServerStderrLog::with_capacity(2);

        stderr_log.record_line("line 1");
        stderr_log.record_line("line 2");
        stderr_log.record_line("line 3");

        assert_eq!(stderr_log.recent_lines(), vec!["line 2", "line 3"]);
    }

    #[test]
    fn formats_fatal_without_stderr_tail_when_empty() {
        let stderr_log = AppServerStderrLog::new();

        assert_eq!(
            stderr_log.format_fatal("app-server exited"),
            "app-server exited"
        );
    }

    #[test]
    fn appends_recent_stderr_tail_to_fatal_messages() {
        let stderr_log = AppServerStderrLog::new();

        stderr_log.record_line("command failed");
        stderr_log.record_line("write denied");

        let message = stderr_log.format_fatal("app-server exited");

        assert!(message.contains("app-server exited"));
        assert!(message.contains("Recent app-server stderr:"));
        assert!(message.contains("command failed"));
        assert!(message.contains("write denied"));
    }
}
