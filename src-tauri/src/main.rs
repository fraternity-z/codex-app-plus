#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_server_io;
mod codex_cli;
mod codex_data;
mod codex_session_text;
mod commands;
mod error;
mod events;
mod git;
mod models;
mod process_manager;
mod rpc_transport;
mod terminal_manager;

use commands::{
    app_import_official_data, app_list_codex_sessions, app_open_codex_config_toml,
    app_open_external, app_open_workspace, app_read_codex_session,
    app_read_chatgpt_auth_tokens, app_read_global_agent_instructions, app_server_restart,
    app_server_start, app_server_stop, app_show_context_menu, app_show_notification,
    app_write_chatgpt_auth_tokens, app_write_global_agent_instructions, rpc_cancel,
    rpc_notify, rpc_request, server_request_resolve, terminal_close_session,
    terminal_create_session, terminal_resize, terminal_write,
};
use git::commands::{
    git_checkout, git_commit, git_discard_paths, git_fetch, git_get_diff, git_get_status,
    git_init_repository, git_pull, git_push, git_stage_paths, git_unstage_paths,
};
use process_manager::ProcessManager;
use terminal_manager::TerminalManager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessManager::new())
        .manage(TerminalManager::new())
        .invoke_handler(tauri::generate_handler![
            app_server_start,
            app_server_stop,
            app_server_restart,
            rpc_request,
            rpc_notify,
            rpc_cancel,
            server_request_resolve,
            app_open_external,
            app_open_workspace,
            app_open_codex_config_toml,
            app_read_global_agent_instructions,
            app_write_global_agent_instructions,
            app_read_chatgpt_auth_tokens,
            app_write_chatgpt_auth_tokens,
            app_show_notification,
            app_show_context_menu,
            app_import_official_data,
            app_list_codex_sessions,
            app_read_codex_session,
            git_get_status,
            git_get_diff,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
