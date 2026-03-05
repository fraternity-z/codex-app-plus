use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("app-server 已在运行")]
    AlreadyRunning,
    #[error("app-server 未运行")]
    NotRunning,
    #[error("参数错误: {0}")]
    InvalidInput(String),
    #[error("IO 错误: {0}")]
    Io(String),
    #[error("JSON 错误: {0}")]
    Json(String),
    #[error("协议错误: {0}")]
    Protocol(String),
    #[error("请求超时: {0}")]
    Timeout(String),
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value.to_string())
    }
}
