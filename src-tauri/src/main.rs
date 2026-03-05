#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod events;
mod models;
mod process_manager;
mod rpc_transport;

use commands::{
    app_import_official_data, app_open_codex_config_toml, app_open_external, app_server_restart,
    app_server_start, app_server_stop, app_show_context_menu, app_show_notification, rpc_cancel,
    rpc_request, server_request_resolve,
};
use process_manager::ProcessManager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessManager::new())
        .invoke_handler(tauri::generate_handler![
            app_server_start,
            app_server_stop,
            app_server_restart,
            rpc_request,
            rpc_cancel,
            server_request_resolve,
            app_open_external,
            app_open_codex_config_toml,
            app_show_notification,
            app_show_context_menu,
            app_import_official_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
