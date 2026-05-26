use tauri::{AppHandle, State};

use crate::domains::app_server::models::{
    AppServerStartInput, RpcCancelInput, RpcNotifyInput, RpcRequestInput, RpcRequestOutput,
    SaveSshHostInput, ServerRequestResolveInput, SshHostConfig,
};
use crate::domains::app_server::service::ProcessManager;
use crate::infra::process::ssh_remote;

use super::to_result;

#[tauri::command]
pub async fn app_server_start(
    app: AppHandle,
    state: State<'_, ProcessManager>,
    input: AppServerStartInput,
) -> Result<(), String> {
    to_result(state.start(app, input).await)
}

#[tauri::command]
pub async fn app_server_stop(
    app: AppHandle,
    state: State<'_, ProcessManager>,
) -> Result<(), String> {
    to_result(state.stop(app).await)
}

#[tauri::command]
pub async fn app_server_restart(
    app: AppHandle,
    state: State<'_, ProcessManager>,
    input: AppServerStartInput,
) -> Result<(), String> {
    to_result(state.restart(app, input).await)
}

#[tauri::command]
pub async fn app_list_ssh_hosts() -> Result<Vec<SshHostConfig>, String> {
    to_result(ssh_remote::list_ssh_hosts().await)
}

#[tauri::command]
pub async fn app_save_ssh_host(input: SaveSshHostInput) -> Result<SshHostConfig, String> {
    to_result(ssh_remote::save_ssh_host(input).await)
}

#[tauri::command]
pub async fn rpc_request(
    state: State<'_, ProcessManager>,
    input: RpcRequestInput,
) -> Result<RpcRequestOutput, String> {
    to_result(state.rpc_request(input).await)
}

#[tauri::command]
pub async fn rpc_notify(
    state: State<'_, ProcessManager>,
    input: RpcNotifyInput,
) -> Result<(), String> {
    to_result(state.rpc_notify(input).await)
}

#[tauri::command]
pub async fn rpc_cancel(
    state: State<'_, ProcessManager>,
    input: RpcCancelInput,
) -> Result<(), String> {
    to_result(state.rpc_cancel(input).await)
}

#[tauri::command]
pub async fn server_request_resolve(
    state: State<'_, ProcessManager>,
    input: ServerRequestResolveInput,
) -> Result<(), String> {
    to_result(state.resolve_server_request(input).await)
}
