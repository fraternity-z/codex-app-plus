use std::collections::HashMap;
#[path = "terminal_environment.rs"]
mod terminal_environment;
#[path = "terminal_output_decoder.rs"]
mod terminal_output_decoder;
#[path = "terminal_shell.rs"]
mod terminal_shell;
use crate::error::{AppError, AppResult};
use crate::events::{emit_fatal, emit_terminal_exit, emit_terminal_output};
use crate::models::{
    TerminalCloseInput, TerminalCreateInput, TerminalCreateOutput, TerminalResizeInput,
    TerminalWriteInput,
};
use crate::process_supervisor::ProcessSupervisor;
use crate::proxy_environment::apply_terminal_proxy_environment;
use crate::proxy_settings::load_proxy_settings;
use portable_pty::{native_pty_system, Child, ChildKiller, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use terminal_environment::apply_utf8_environment;
use terminal_output_decoder::Utf8ChunkDecoder;
use terminal_shell::{build_shell_command, resolve_shell_config, ShellConfig};
const DEFAULT_COLUMNS: u16 = 120;
const DEFAULT_ROWS: u16 = 32;
const OUTPUT_BUFFER_SIZE: usize = 4096;
const OUTPUT_CHANNEL_CAPACITY: usize = 64;
const OUTPUT_THROTTLE_MS: u64 = 16;
const ZERO_PIXELS: u16 = 0;
type SessionMap = Arc<Mutex<HashMap<String, Arc<TerminalSession>>>>;
struct TerminalSession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    supervisor: ProcessSupervisor,
    shell_label: String,
}
impl TerminalSession {
    fn new(
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        killer: Box<dyn ChildKiller + Send + Sync>,
        supervisor: ProcessSupervisor,
        shell_label: String,
    ) -> Self {
        Self {
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            supervisor,
            shell_label,
        }
    }
}
#[derive(Clone)]
pub struct TerminalManager {
    sessions: SessionMap,
}
impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    pub async fn create_session(
        &self,
        app: AppHandle,
        input: TerminalCreateInput,
    ) -> AppResult<TerminalCreateOutput> {
        let sessions = self.sessions.clone();
        tokio::task::spawn_blocking(move || create_session_blocking(app, sessions, input))
            .await
            .map_err(map_join_error)?
    }
    pub async fn write(&self, input: TerminalWriteInput) -> AppResult<()> {
        if input.data.is_empty() {
            return Ok(());
        }
        let session = get_session(&self.sessions, &input.session_id)?;
        tokio::task::spawn_blocking(move || {
            let mut writer = lock_mutex(&session.writer, "terminal writer")?;
            writer.write_all(input.data.as_bytes())?;
            writer.flush()?;
            Ok(())
        })
        .await
        .map_err(map_join_error)?
    }
    pub async fn resize(&self, input: TerminalResizeInput) -> AppResult<()> {
        let session = get_session(&self.sessions, &input.session_id)?;
        let size = to_pty_size(input.cols, input.rows);
        tokio::task::spawn_blocking(move || {
            let master = lock_mutex(&session.master, "terminal master")?;
            master.resize(size).map_err(map_terminal_error)
        })
        .await
        .map_err(map_join_error)?
    }
    pub async fn close(&self, input: TerminalCloseInput) -> AppResult<()> {
        let Some(session) = take_session(&self.sessions, &input.session_id)? else {
            return Ok(());
        };
        tokio::task::spawn_blocking(move || kill_session(session))
            .await
            .map_err(map_join_error)?
    }

    pub fn shutdown_all(&self) {
        let sessions = drain_sessions(&self.sessions);
        for session in sessions {
            let _ = kill_session(session);
        }
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

fn create_session_blocking(
    app: AppHandle,
    sessions: SessionMap,
    input: TerminalCreateInput,
) -> AppResult<TerminalCreateOutput> {
    let TerminalCreateInput {
        root_key,
        terminal_id,
        cwd,
        cols,
        rows,
        shell: requested_shell,
        enforce_utf8,
    } = input;
    let session_id = terminal_session_key(&root_key, &terminal_id)?;
    if let Some(existing) = find_session_if_present(&sessions, &session_id)? {
        return Ok(TerminalCreateOutput {
            session_id,
            shell: existing.shell_label.clone(),
        });
    }
    let shell = resolve_shell_config(requested_shell)?;
    let pty_pair = create_pty_pair(cols, rows)?;
    let supervisor = ProcessSupervisor::new("terminal-session")?;
    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(map_terminal_error)?;
    let writer = pty_pair.master.take_writer().map_err(map_terminal_error)?;
    let mut child = spawn_shell_process(pty_pair.slave, &shell, cwd, enforce_utf8.unwrap_or(true))?;
    if let Err(error) = supervisor.assign_portable_child(child.as_ref()) {
        terminate_portable_child(&mut child);
        return Err(error);
    }
    let killer = child.clone_killer();
    let session = Arc::new(TerminalSession::new(
        pty_pair.master,
        writer,
        killer,
        supervisor,
        shell.label.clone(),
    ));
    if let Some(existing) =
        insert_session_if_absent(&sessions, session_id.clone(), session.clone())?
    {
        terminate_portable_child(&mut child);
        return Ok(TerminalCreateOutput {
            session_id,
            shell: existing.shell_label.clone(),
        });
    }
    spawn_output_thread(
        app.clone(),
        sessions.clone(),
        session_id.clone(),
        session.clone(),
        reader,
    );
    spawn_wait_thread(app, sessions, session_id.clone(), session, child);
    Ok(TerminalCreateOutput {
        session_id,
        shell: shell.label,
    })
}

fn create_pty_pair(cols: Option<u16>, rows: Option<u16>) -> AppResult<portable_pty::PtyPair> {
    let size = to_pty_size(
        cols.unwrap_or(DEFAULT_COLUMNS),
        rows.unwrap_or(DEFAULT_ROWS),
    );
    native_pty_system()
        .openpty(size)
        .map_err(map_terminal_error)
}

fn spawn_shell_process(
    slave: Box<dyn portable_pty::SlavePty + Send>,
    shell: &ShellConfig,
    cwd: Option<String>,
    enforce_utf8: bool,
) -> AppResult<Box<dyn Child + Send + Sync>> {
    let cwd = normalize_cwd(cwd)?;
    let mut command = build_shell_command(shell);
    if let Some(path) = cwd {
        command.cwd(path);
    }
    let proxy_settings = load_proxy_settings(crate::models::AgentEnvironment::WindowsNative)?;
    apply_terminal_proxy_environment(&mut command, &proxy_settings);
    apply_utf8_environment(&mut command, enforce_utf8);
    slave.spawn_command(command).map_err(map_terminal_error)
}

fn normalize_cwd(cwd: Option<String>) -> AppResult<Option<PathBuf>> {
    let Some(value) = cwd.map(|item| item.trim().to_string()) else {
        return Ok(None);
    };
    if value.is_empty() {
        return Ok(None);
    }
    let path = PathBuf::from(value);
    if !path.exists() {
        return Err(AppError::InvalidInput(format!(
            "terminal cwd does not exist: {}",
            path.display()
        )));
    }
    if !path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "terminal cwd is not a directory: {}",
            path.display()
        )));
    }
    Ok(Some(path))
}

fn spawn_output_thread(
    app: AppHandle,
    sessions: SessionMap,
    session_id: String,
    session: Arc<TerminalSession>,
    mut reader: Box<dyn Read + Send>,
) {
    let (output_tx, output_rx) = mpsc::sync_channel::<String>(OUTPUT_CHANNEL_CAPACITY);
    let emit_app = app.clone();
    let emit_sessions = sessions.clone();
    let emit_session_id = session_id.clone();
    let emit_session = session.clone();
    std::thread::spawn(move || {
        emit_terminal_output_loop(
            emit_app,
            emit_sessions,
            emit_session_id,
            emit_session,
            output_rx,
        );
    });
    std::thread::spawn(move || {
        let mut buffer = [0_u8; OUTPUT_BUFFER_SIZE];
        let mut decoder = Utf8ChunkDecoder::new();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(bytes_read) => {
                    if let Some(chunk) = decoder.decode(&buffer[..bytes_read]) {
                        if output_tx.send(chunk).is_err() {
                            break;
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }

        if let Some(chunk) = decoder.finish() {
            let _ = output_tx.send(chunk);
        }
    });
}

fn emit_terminal_output_loop(
    app: AppHandle,
    sessions: SessionMap,
    session_id: String,
    session: Arc<TerminalSession>,
    output_rx: mpsc::Receiver<String>,
) {
    let throttle = Duration::from_millis(OUTPUT_THROTTLE_MS);
    let mut pending_output = String::new();
    let mut last_emit = Instant::now()
        .checked_sub(throttle)
        .unwrap_or_else(Instant::now);

    loop {
        if !pending_output.is_empty()
            && (pending_output.len() >= OUTPUT_BUFFER_SIZE || last_emit.elapsed() >= throttle)
        {
            flush_terminal_output(
                &app,
                &sessions,
                &session_id,
                &session,
                &mut pending_output,
                &mut last_emit,
            );
            continue;
        }

        let receive_result = if pending_output.is_empty() {
            output_rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
        } else {
            let remaining = throttle
                .checked_sub(last_emit.elapsed())
                .unwrap_or(Duration::ZERO);
            output_rx.recv_timeout(remaining)
        };

        match receive_result {
            Ok(chunk) => pending_output.push_str(&chunk),
            Err(RecvTimeoutError::Timeout) => {
                flush_terminal_output(
                    &app,
                    &sessions,
                    &session_id,
                    &session,
                    &mut pending_output,
                    &mut last_emit,
                );
            }
            Err(RecvTimeoutError::Disconnected) => {
                flush_terminal_output(
                    &app,
                    &sessions,
                    &session_id,
                    &session,
                    &mut pending_output,
                    &mut last_emit,
                );
                break;
            }
        }
    }
}

fn flush_terminal_output(
    app: &AppHandle,
    sessions: &SessionMap,
    session_id: &str,
    session: &Arc<TerminalSession>,
    pending_output: &mut String,
    last_emit: &mut Instant,
) {
    if pending_output.is_empty() {
        return;
    }
    let chunk = std::mem::take(pending_output);
    emit_if_session_current(app, sessions, session_id, session, chunk);
    *last_emit = Instant::now();
}

fn spawn_wait_thread(
    app: AppHandle,
    sessions: SessionMap,
    session_id: String,
    session: Arc<TerminalSession>,
    mut child: Box<dyn Child + Send + Sync>,
) {
    std::thread::spawn(move || match child.wait() {
        Ok(status) => {
            if remove_session_if_current(&sessions, &session_id, &session) {
                let _ = emit_terminal_exit(&app, session_id, Some(status.exit_code()));
            }
        }
        Err(error) => {
            if remove_session_if_current(&sessions, &session_id, &session) {
                let _ = emit_fatal(&app, format!("terminal process wait failed: {error}"));
                let _ = emit_terminal_exit(&app, session_id, None);
            }
        }
    });
}

fn get_session(sessions: &SessionMap, session_id: &str) -> AppResult<Arc<TerminalSession>> {
    let map = lock_mutex(sessions, "terminal session map")?;
    map.get(session_id)
        .cloned()
        .ok_or_else(|| AppError::InvalidInput(format!("terminal session not found: {session_id}")))
}

fn find_session_if_present(
    sessions: &SessionMap,
    session_id: &str,
) -> AppResult<Option<Arc<TerminalSession>>> {
    let map = lock_mutex(sessions, "terminal session map")?;
    Ok(map.get(session_id).cloned())
}

fn insert_session_if_absent(
    sessions: &SessionMap,
    session_id: String,
    session: Arc<TerminalSession>,
) -> AppResult<Option<Arc<TerminalSession>>> {
    let mut map = lock_mutex(sessions, "terminal session map")?;
    if let Some(existing) = map.get(&session_id) {
        return Ok(Some(existing.clone()));
    }
    map.insert(session_id, session);
    Ok(None)
}

fn take_session(
    sessions: &SessionMap,
    session_id: &str,
) -> AppResult<Option<Arc<TerminalSession>>> {
    let mut map = lock_mutex(sessions, "terminal session map")?;
    Ok(map.remove(session_id))
}

fn remove_session_if_current(
    sessions: &SessionMap,
    session_id: &str,
    session: &Arc<TerminalSession>,
) -> bool {
    let Ok(mut map) = sessions.lock() else {
        return false;
    };
    let should_remove = map
        .get(session_id)
        .is_some_and(|current| Arc::ptr_eq(current, session));
    if should_remove {
        map.remove(session_id);
    }
    should_remove
}

fn is_session_current(
    sessions: &SessionMap,
    session_id: &str,
    session: &Arc<TerminalSession>,
) -> bool {
    let Ok(map) = sessions.lock() else {
        return false;
    };
    map.get(session_id)
        .is_some_and(|current| Arc::ptr_eq(current, session))
}

fn emit_if_session_current(
    app: &AppHandle,
    sessions: &SessionMap,
    session_id: &str,
    session: &Arc<TerminalSession>,
    chunk: String,
) {
    if !chunk.is_empty() && is_session_current(sessions, session_id, session) {
        let _ = emit_terminal_output(app, session_id.to_string(), chunk);
    }
}

fn drain_sessions(sessions: &SessionMap) -> Vec<Arc<TerminalSession>> {
    if let Ok(mut map) = sessions.lock() {
        return map.drain().map(|(_, session)| session).collect();
    }
    Vec::new()
}

fn lock_mutex<'a, T>(mutex: &'a Mutex<T>, name: &str) -> AppResult<MutexGuard<'a, T>> {
    mutex
        .lock()
        .map_err(|_| AppError::Protocol(format!("{name} lock poisoned")))
}

fn map_terminal_error(error: impl std::fmt::Display) -> AppError {
    AppError::Io(error.to_string())
}

fn map_join_error(error: tokio::task::JoinError) -> AppError {
    AppError::Protocol(format!("terminal task failed: {error}"))
}

fn terminal_session_key(root_key: &str, terminal_id: &str) -> AppResult<String> {
    let root_key = root_key.trim();
    let terminal_id = terminal_id.trim();
    if root_key.is_empty() {
        return Err(AppError::InvalidInput(
            "terminal root key is required".to_string(),
        ));
    }
    if terminal_id.is_empty() {
        return Err(AppError::InvalidInput(
            "terminal id is required".to_string(),
        ));
    }
    Ok(format!("{root_key}:{terminal_id}"))
}

fn terminate_portable_child(child: &mut Box<dyn Child + Send + Sync>) {
    let _ = child.clone_killer().kill();
    let _ = child.wait();
}

fn kill_session(session: Arc<TerminalSession>) -> AppResult<()> {
    {
        let mut killer = lock_mutex(&session.killer, "terminal killer")?;
        match killer.kill() {
            Ok(()) => {}
            Err(error) if is_terminal_closed_error(&error) => {}
            Err(error) => return Err(map_terminal_error(error)),
        }
    }
    session.supervisor.terminate()
}

fn is_terminal_closed_error(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::NotFound || error.raw_os_error() == Some(0)
}

fn to_pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.max(1),
        rows: rows.max(1),
        pixel_width: ZERO_PIXELS,
        pixel_height: ZERO_PIXELS,
    }
}

#[cfg(test)]
mod tests {
    use super::terminal_session_key;

    #[test]
    fn builds_session_key_from_root_and_terminal_id() {
        assert_eq!(
            terminal_session_key("E:/code/project", "terminal-1").unwrap(),
            "E:/code/project:terminal-1"
        );
    }

    #[test]
    fn rejects_missing_session_key_parts() {
        assert!(terminal_session_key("", "terminal-1").is_err());
        assert!(terminal_session_key("root-1", "").is_err());
    }
}
