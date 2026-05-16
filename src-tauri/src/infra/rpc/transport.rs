use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::models::{JsonRpcErrorBody, RequestId, ServerRequestResolveInput};

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
        id: RequestId,
        method: String,
        params: Value,
    },
}

fn parse_response_id(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn parse_request_id(value: &Value) -> Option<RequestId> {
    match value {
        Value::String(text) => Some(RequestId::String(text.clone())),
        Value::Number(number) => Some(RequestId::Number(number.clone())),
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

    let value = json!({ "id": request_id, "method": method, "params": params });
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn build_notification_line(method: &str, params: Option<Value>) -> AppResult<String> {
    if method.is_empty() {
        return Err(AppError::InvalidInput("method 不能为空".to_string()));
    }

    let value = match params {
        Some(params) => json!({ "method": method, "params": params }),
        None => json!({ "method": method }),
    };
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn build_cancel_line(request_id: &str) -> AppResult<String> {
    if request_id.is_empty() {
        return Err(AppError::InvalidInput("request_id 不能为空".to_string()));
    }

    let value = json!({ "method": "$/cancelRequest", "params": { "id": request_id } });
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
        json!({ "id": input.request_id, "result": input.result.clone().unwrap_or(Value::Null) })
    };
    serde_json::to_string(&value).map_err(Into::into)
}

pub fn parse_incoming_line(line: &str) -> AppResult<IncomingMessage> {
    let value: Value = serde_json::from_str(line)?;
    let object = value
        .as_object()
        .ok_or_else(|| AppError::Protocol("RPC 消息必须是对象".to_string()))?;

    let method = object.get("method").and_then(Value::as_str);
    let id_value = object.get("id");

    if let (Some(method), Some(id)) = (method, id_value.and_then(parse_request_id)) {
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

    if let Some(id) = id_value.and_then(parse_response_id) {
        let result = object.get("result").cloned();
        let error = object
            .get("error")
            .cloned()
            .map(serde_json::from_value)
            .transpose()?;
        return Ok(IncomingMessage::Response { id, result, error });
    }

    Err(AppError::Protocol(
        "无法识别的 RPC 消息：缺少 method 或 id".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_notification_line_without_id() {
        let line = build_notification_line("initialized", Some(json!({}))).unwrap();
        assert_eq!(line, r#"{"method":"initialized","params":{}}"#);
    }

    #[test]
    fn parses_server_request() {
        let line = r#"{"id":1,"method":"tool/request","params":{"ok":true}}"#;
        let message = parse_incoming_line(line).unwrap();

        match message {
            IncomingMessage::ServerRequest { id, method, params } => {
                assert!(matches!(id, RequestId::Number(_)));
                assert_eq!(method, "tool/request");
                assert_eq!(params, json!({ "ok": true }));
            }
            _ => panic!("expected server request"),
        }
    }

    #[test]
    fn preserves_numeric_server_request_id_in_response() {
        let line = build_server_response_line(&ServerRequestResolveInput {
            request_id: RequestId::Number(1.into()),
            result: Some(json!({ "ok": true })),
            error: None,
        })
        .unwrap();

        assert_eq!(line, r#"{"id":1,"result":{"ok":true}}"#);
    }

    #[test]
    fn preserves_string_server_request_id_in_response() {
        let line = build_server_response_line(&ServerRequestResolveInput {
            request_id: RequestId::String("request-1".to_string()),
            result: Some(json!({ "ok": true })),
            error: None,
        })
        .unwrap();

        assert_eq!(line, r#"{"id":"request-1","result":{"ok":true}}"#);
    }
}
