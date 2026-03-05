use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::models::{JsonRpcErrorBody, ServerRequestResolveInput};

#[derive(Debug)]
pub enum IncomingMessage {
    Response {
        id: String,
        result: Option<Value>,
        error: Option<JsonRpcErrorBody>,
    },
    Notification {
        method: String,
        params: Value,
    },
    ServerRequest {
        id: String,
        method: String,
        params: Value,
    },
}

fn parse_id(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

pub fn build_request_line(request_id: &str, method: &str, params: Value) -> AppResult<String> {
    if request_id.is_empty() {
        return Err(AppError::InvalidInput("request_id 不能为空".to_string()));
    }
    if method.is_empty() {
        return Err(AppError::InvalidInput("method 不能为空".to_string()));
    }
    let value = json!({
        "id": request_id,
        "method": method,
        "params": params
    });
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn build_cancel_line(request_id: &str) -> AppResult<String> {
    if request_id.is_empty() {
        return Err(AppError::InvalidInput("request_id 不能为空".to_string()));
    }
    let value = json!({
        "method": "$/cancelRequest",
        "params": {
            "id": request_id
        }
    });
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn build_server_response_line(input: &ServerRequestResolveInput) -> AppResult<String> {
    if input.request_id.is_empty() {
        return Err(AppError::InvalidInput("request_id 不能为空".to_string()));
    }
    if input.result.is_none() && input.error.is_none() {
        return Err(AppError::InvalidInput(
            "serverRequest.resolve 必须提供 result 或 error".to_string(),
        ));
    }
    let value = if let Some(error) = &input.error {
        json!({
            "id": input.request_id,
            "error": {
                "code": error.code,
                "message": error.message,
                "data": error.data
            }
        })
    } else {
        json!({
            "id": input.request_id,
            "result": input.result.clone().unwrap_or(Value::Null)
        })
    };
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn parse_incoming_line(line: &str) -> AppResult<IncomingMessage> {
    let value: Value = serde_json::from_str(line)?;
    let object = value
        .as_object()
        .ok_or_else(|| AppError::Protocol("RPC 消息必须是对象".to_string()))?;

    let method = object.get("method").and_then(Value::as_str);
    let id = object.get("id").and_then(parse_id);

    if let (Some(method), Some(id)) = (method, id.clone()) {
        return Ok(IncomingMessage::ServerRequest {
            id,
            method: method.to_string(),
            params: object.get("params").cloned().unwrap_or(Value::Null),
        });
    }

    if let Some(method) = method {
        return Ok(IncomingMessage::Notification {
            method: method.to_string(),
            params: object.get("params").cloned().unwrap_or(Value::Null),
        });
    }

    if let Some(id) = id {
        let result = object.get("result").cloned();
        let error = object
            .get("error")
            .cloned()
            .map(serde_json::from_value)
            .transpose()?;
        return Ok(IncomingMessage::Response { id, result, error });
    }

    Err(AppError::Protocol(
        "无法识别的 RPC 消息: 缺少 method 或 id".to_string(),
    ))
}
