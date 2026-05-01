#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_environment;
mod agents_config;
mod app_approval_rules;
mod app_server_io;
mod app_server_stderr;
mod app_support;
mod browser;
mod browser_commands;
mod bundled_computer_use;
mod codex_auth;
mod codex_cli;
mod codex_data;
mod codex_session_text;
mod command_utils;
mod commands;
mod custom_prompts;
mod dictation_transcription;
mod error;
mod events;
mod git;
mod global_agent_instructions;
mod media_permissions;
mod models;
mod process_manager;
mod process_supervisor;
mod proxy_environment;
mod proxy_settings;
mod rpc_transport;
mod rules;
mod terminal_commands;
mod terminal_manager;
#[cfg(test)]
mod test_support;
mod window_theme;
mod windows_child_process;
mod workspace_launcher;
mod workspace_state;
mod wsl_support;

use browser_commands::{
    app_browser_clear_browsing_data, app_browser_open, app_browser_sidebar_hide,
    app_browser_sidebar_open, app_browser_sidebar_update_bounds,
    app_browser_use_approval_mode_write, app_browser_use_origin_add, app_browser_use_origin_remove,
    app_browser_use_settings_read,
};
use commands::{
    app_activate_codex_chatgpt, app_capture_codex_oauth_snapshot, app_clear_chatgpt_auth_state,
    app_control_window, app_create_agent, app_delete_agent, app_delete_codex_session,
    app_delete_managed_prompt, app_get_agents_settings, app_get_codex_auth_mode_state,
    app_import_official_data, app_list_codex_sessions, app_list_custom_prompts,
    app_list_managed_prompts, app_open_codex_config_toml, app_open_external,
    app_open_file_in_editor, app_open_workspace, app_read_agent_config,
    app_read_chatgpt_auth_tokens, app_read_codex_session, app_read_global_agent_instructions,
    app_read_proxy_settings, app_read_workspace_state, app_remember_command_approval_rule,
    app_reveal_path_in_folder, app_search_codex_sessions, app_server_restart, app_server_start,
    app_server_stop, app_set_agents_core, app_set_user_model_instructions_file,
    app_set_window_theme, app_show_context_menu, app_show_notification, app_start_window_dragging,
    app_update_agent, app_upsert_managed_prompt, app_write_agent_config,
    app_write_chatgpt_auth_tokens, app_write_global_agent_instructions, app_write_proxy_settings,
    app_write_workspace_state, rpc_cancel, rpc_notify, rpc_request, server_request_resolve,
};
use dictation_transcription::app_transcribe_dictation_audio;
use git::commands::{
    git_add_worktree, git_checkout, git_commit, git_delete_branch, git_discard_paths, git_fetch,
    git_generate_commit_message, git_get_branch_refs, git_get_diff, git_get_remote_url,
    git_get_status_snapshot, git_get_workspace_diffs, git_get_worktrees, git_init_repository,
    git_pull, git_push, git_remove_worktree, git_stage_paths, git_unstage_paths,
};
use git::runtime::GitRuntimeState;
use process_manager::ProcessManager;
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{Manager, RunEvent, WindowEvent};
use terminal_commands::{
    terminal_close_session, terminal_create_session, terminal_resize, terminal_write,
};
use terminal_manager::TerminalManager;

fn main() {
    #[cfg(target_os = "windows")]
    windows_child_process::ensure_hidden_parent_console();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            #[cfg(desktop)]
            setup_system_tray(app)?;
            #[cfg(target_os = "windows")]
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.set_decorations(false);
                media_permissions::allow_microphone_capture(&main_window);
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
            app_open_file_in_editor,
            app_browser_open,
            app_browser_sidebar_open,
            app_browser_sidebar_update_bounds,
            app_browser_sidebar_hide,
            app_browser_clear_browsing_data,
            app_browser_use_settings_read,
            app_browser_use_approval_mode_write,
            app_browser_use_origin_add,
            app_browser_use_origin_remove,
            app_open_codex_config_toml,
            app_reveal_path_in_folder,
            app_read_workspace_state,
            app_write_workspace_state,
            app_get_agents_settings,
            app_set_agents_core,
            app_create_agent,
            app_update_agent,
            app_delete_agent,
            app_read_agent_config,
            app_write_agent_config,
            app_read_global_agent_instructions,
            app_list_custom_prompts,
            app_list_managed_prompts,
            app_upsert_managed_prompt,
            app_delete_managed_prompt,
            app_set_user_model_instructions_file,
            app_write_global_agent_instructions,
            app_read_proxy_settings,
            app_write_proxy_settings,
            app_get_codex_auth_mode_state,
            app_activate_codex_chatgpt,
            app_capture_codex_oauth_snapshot,
            app_read_chatgpt_auth_tokens,
            app_write_chatgpt_auth_tokens,
            app_clear_chatgpt_auth_state,
            app_show_notification,
            app_transcribe_dictation_audio,
            app_show_context_menu,
            app_import_official_data,
            app_list_codex_sessions,
            app_read_codex_session,
            app_search_codex_sessions,
            app_delete_codex_session,
            app_remember_command_approval_rule,
            git_get_status_snapshot,
            git_get_branch_refs,
            git_get_remote_url,
            git_get_diff,
            git_get_workspace_diffs,
            git_get_worktrees,
            git_add_worktree,
            git_remove_worktree,
            git_init_repository,
            git_stage_paths,
            git_unstage_paths,
            git_discard_paths,
            git_commit,
            git_generate_commit_message,
            git_fetch,
            git_pull,
            git_push,
            git_checkout,
            git_delete_branch,
            terminal_create_session,
            terminal_write,
            terminal_resize,
            terminal_close_session
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => {
            api.prevent_close();
            hide_main_window(app_handle);
        }
        RunEvent::ExitRequested { .. } => {
            cleanup_managed_processes(app_handle);
        }
        _ => {}
    });
}

#[cfg(desktop)]
fn setup_system_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "显示 Codex App Plus", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let mut tray_builder = TrayIconBuilder::with_id("main")
        .tooltip("Codex App Plus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            "show" => show_main_window(app_handle),
            "quit" => app_handle.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn cleanup_managed_processes(app: &tauri::AppHandle) {
    tauri::async_runtime::block_on(async {
        app.state::<ProcessManager>()
            .shutdown_all(app.clone())
            .await;
    });
    app.state::<TerminalManager>().shutdown_all();
}
