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
