use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppServerStartInput {
    pub codex_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestInput {
    pub method: String,
    pub params: Value,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcNotifyInput {
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequestOutput {
    pub request_id: String,
    pub result: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcCancelInput {
    pub request_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JsonRpcErrorBody {
    pub code: i64,
    pub message: String,
    pub data: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerRequestResolveInput {
    pub request_id: String,
    pub result: Option<Value>,
    pub error: Option<JsonRpcErrorBody>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ShowNotificationInput {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ShowContextMenuInput {
    pub x: i32,
    pub y: i32,
    pub items: Vec<ContextMenuItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOfficialDataInput {
    pub source_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalAgentInstructionsOutput {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGlobalAgentInstructionsInput {
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSummary {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionReadInput {
    pub thread_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionMessage {
    pub id: String,
    pub role: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionReadOutput {
    pub thread_id: String,
    pub messages: Vec<CodexSessionMessage>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceOpener {
    Vscode,
    VisualStudio,
    GithubDesktop,
    Explorer,
    Terminal,
    GitBash,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkspaceInput {
    pub path: String,
    pub opener: WorkspaceOpener,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum EmbeddedTerminalShell {
    PowerShell,
    CommandPrompt,
    GitBash,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateInput {
    pub cwd: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub shell: Option<EmbeddedTerminalShell>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateOutput {
    pub session_id: String,
    pub shell: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalWriteInput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeInput {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCloseInput {
    pub session_id: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConnectionChangedPayload {
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct NotificationPayload {
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct ServerRequestPayload {
    pub id: String,
    pub method: String,
    pub params: Value,
}

#[derive(Debug, Serialize, Clone)]
pub struct FatalErrorPayload {
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitPayload {
    pub session_id: String,
    pub exit_code: Option<u32>,
}
