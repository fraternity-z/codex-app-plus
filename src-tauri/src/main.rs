#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_environment;
mod app_approval_rules;
mod app_server_io;
mod app_server_stderr;
mod app_support;
mod codex_auth;
mod codex_cli;
mod codex_data;
mod codex_provider;
mod codex_session_text;
mod commands;
mod error;
mod events;
mod git;
mod global_agent_instructions;
mod models;
mod process_manager;
mod process_supervisor;
mod rpc_transport;
mod rules;
mod terminal_commands;
mod terminal_manager;
mod window_theme;
mod windows_child_process;
mod workspace_launcher;
mod wsl_support;

use commands::{
    app_activate_codex_chatgpt, app_apply_codex_provider, app_capture_codex_oauth_snapshot,
    app_clear_chatgpt_auth_state, app_control_window, app_delete_codex_provider,
    app_delete_codex_session, app_get_codex_auth_mode_state, app_import_official_data,
    app_list_codex_providers, app_list_codex_sessions, app_open_codex_config_toml,
    app_open_external, app_open_workspace, app_read_chatgpt_auth_tokens, app_read_codex_session,
    app_read_global_agent_instructions, app_remember_command_approval_rule, app_server_restart,
    app_server_start, app_server_stop, app_set_window_theme, app_show_context_menu,
    app_show_notification, app_start_window_dragging, app_upsert_codex_provider,
    app_write_chatgpt_auth_tokens, app_write_global_agent_instructions, rpc_cancel, rpc_notify,
    rpc_request, server_request_resolve,
};
use git::commands::{
    git_checkout, git_commit, git_discard_paths, git_fetch, git_get_branch_refs, git_get_diff,
    git_get_remote_url, git_get_status_snapshot, git_get_workspace_diffs, git_init_repository,
    git_pull, git_push, git_stage_paths, git_unstage_paths,
};
use git::runtime::GitRuntimeState;
use process_manager::ProcessManager;
use tauri::{Manager, RunEvent};
use terminal_commands::{
    terminal_close_session, terminal_create_session, terminal_resize, terminal_write,
};
use terminal_manager::TerminalManager;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            #[cfg(target_os = "windows")]
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_decorations(false);
            }
            Ok(())
        })
        .manage(ProcessManager::new())
        .manage(TerminalManager::new())
        .manage(GitRuntimeState::new())
        .invoke_handler(tauri::generate_handler![
            app_server_start,
            app_server_stop,
            app_server_restart,
            rpc_request,
            rpc_notify,
            rpc_cancel,
            server_request_resolve,
            app_set_window_theme,
            app_start_window_dragging,
            app_control_window,
            app_open_external,
            app_open_workspace,
            app_open_codex_config_toml,
            app_read_global_agent_instructions,
            app_write_global_agent_instructions,
            app_list_codex_providers,
            app_upsert_codex_provider,
            app_delete_codex_provider,
            app_apply_codex_provider,
            app_get_codex_auth_mode_state,
            app_activate_codex_chatgpt,
            app_capture_codex_oauth_snapshot,
            app_read_chatgpt_auth_tokens,
            app_write_chatgpt_auth_tokens,
            app_clear_chatgpt_auth_state,
            app_show_notification,
            app_show_context_menu,
            app_import_official_data,
            app_list_codex_sessions,
            app_read_codex_session,
            app_delete_codex_session,
            app_remember_command_approval_rule,
            git_get_status_snapshot,
            git_get_branch_refs,
            git_get_remote_url,
            git_get_diff,
            git_get_workspace_diffs,
            git_init_repository,
            git_stage_paths,
            git_unstage_paths,
            git_discard_paths,
            git_commit,
            git_fetch,
            git_pull,
            git_push,
            git_checkout,
            terminal_create_session,
            terminal_write,
            terminal_resize,
            terminal_close_session
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. }) {
            cleanup_managed_processes(app_handle);
        }
    });
}

fn cleanup_managed_processes(app: &tauri::AppHandle) {
    tauri::async_runtime::block_on(async {
        app.state::<ProcessManager>()
            .shutdown_all(app.clone())
            .await;
    });
    app.state::<TerminalManager>().shutdown_all();
}
