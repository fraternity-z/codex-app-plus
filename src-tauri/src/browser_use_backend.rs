#[cfg(target_os = "windows")]
pub fn start(app: tauri::AppHandle) {
    imp::start(app);
}

#[cfg(not(target_os = "windows"))]
pub fn start(_app: tauri::AppHandle) {}

#[cfg(target_os = "windows")]
mod imp {
    use std::collections::{HashMap, HashSet};
    use std::ffi::OsStr;
    use std::io;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::{Duration, Instant};

    use serde::Deserialize;
    use serde_json::{json, Value};
    use tauri::{AppHandle, Manager};
    use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
    use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
    use tokio::sync::{mpsc, oneshot};
    use webview2_com::{
        take_pwstr, CallDevToolsProtocolMethodCompletedHandler,
        DevToolsProtocolEventReceivedEventHandler,
    };
    use windows::core::{PCWSTR, PWSTR};

    use crate::browser::BROWSER_SIDEBAR_LABEL;
    use crate::error::{AppError, AppResult};
    use crate::events::emit_browser_sidebar_open_requested;

    const PIPE_NAME: &str = r"\\.\pipe\codex-browser-use-iab";
    const TAB_ID: u64 = 1;
    const MAX_FRAME_BYTES: usize = 64 * 1024 * 1024;
    const CDP_RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
    const SIDEBAR_OPEN_TIMEOUT: Duration = Duration::from_secs(5);
    const SIDEBAR_OPEN_POLL_INTERVAL: Duration = Duration::from_millis(50);
    const BLANK_URL: &str = "about:blank";
    const CDP_EVENTS: &[&str] = &[
        "Page.frameStartedLoading",
        "Page.frameNavigated",
        "Page.navigatedWithinDocument",
        "Page.domContentEventFired",
        "Page.loadEventFired",
        "Page.fileChooserOpened",
        "Runtime.consoleAPICalled",
        "Runtime.exceptionThrown",
    ];

    static STARTED: OnceLock<()> = OnceLock::new();

    pub fn start(app: AppHandle) {
        if STARTED.set(()).is_err() {
            return;
        }

        let backend = Arc::new(BrowserUseBackend::new(app));
        tauri::async_runtime::spawn(async move {
            if let Err(error) = backend.run().await {
                eprintln!("browser-use IAB backend stopped: {error}");
            }
        });
    }

    struct BrowserUseBackend {
        app: AppHandle,
        next_connection_id: AtomicU64,
        connections: Mutex<Vec<ConnectionSender>>,
        session_claims: Mutex<HashMap<String, u64>>,
        cdp_events_registered: Mutex<HashSet<u64>>,
    }

    struct ConnectionSender {
        id: u64,
        tx: mpsc::UnboundedSender<Value>,
    }

    #[derive(Debug, Deserialize)]
    struct JsonRpcIncoming {
        id: Option<Value>,
        method: Option<String>,
        params: Option<Value>,
    }

    impl BrowserUseBackend {
        fn new(app: AppHandle) -> Self {
            Self {
                app,
                next_connection_id: AtomicU64::new(1),
                connections: Mutex::new(Vec::new()),
                session_claims: Mutex::new(HashMap::new()),
                cdp_events_registered: Mutex::new(HashSet::new()),
            }
        }

        async fn run(self: Arc<Self>) -> io::Result<()> {
            let mut server = ServerOptions::new()
                .first_pipe_instance(true)
                .create(PIPE_NAME)?;

            loop {
                server.connect().await?;
                let connected = server;
                server = ServerOptions::new().create(PIPE_NAME)?;

                let backend = self.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = backend.handle_connection(connected).await {
                        eprintln!("browser-use IAB connection closed with error: {error}");
                    }
                });
            }
        }

        async fn handle_connection(self: Arc<Self>, pipe: NamedPipeServer) -> io::Result<()> {
            let connection_id = self.next_connection_id.fetch_add(1, Ordering::Relaxed);
            let (mut reader, mut writer) = tokio::io::split(pipe);
            let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
            self.add_connection(connection_id, tx.clone());

            let writer_task = tauri::async_runtime::spawn(async move {
                while let Some(message) = rx.recv().await {
                    let frame = encode_framed_message(&message)?;
                    writer.write_all(&frame).await?;
                    writer.flush().await?;
                }
                Ok::<(), io::Error>(())
            });

            let read_result = self.read_loop(connection_id, &mut reader, tx.clone()).await;
            self.remove_connection(connection_id);
            self.release_session_claims(connection_id);
            drop(tx);

            match writer_task.await {
                Ok(Ok(())) | Err(_) => {}
                Ok(Err(error)) => return Err(error),
            }

            read_result
        }

        async fn read_loop<R>(
            self: &Arc<Self>,
            connection_id: u64,
            reader: &mut R,
            tx: mpsc::UnboundedSender<Value>,
        ) -> io::Result<()>
        where
            R: AsyncRead + Unpin,
        {
            loop {
                let Some(message) = read_framed_message(reader).await? else {
                    return Ok(());
                };
                let response = self.handle_message(connection_id, message).await;
                if let Some(response) = response {
                    if tx.send(response).is_err() {
                        return Ok(());
                    }
                }
            }
        }

        async fn handle_message(
            self: &Arc<Self>,
            connection_id: u64,
            message: Value,
        ) -> Option<Value> {
            let request_id = message.get("id").cloned();
            let request = match serde_json::from_value::<JsonRpcIncoming>(message) {
                Ok(request) => request,
                Err(error) => return request_id.map(|id| rpc_error(id, error.to_string())),
            };

            let Some(id) = request.id else {
                return None;
            };
            let method = request.method.unwrap_or_default();
            let params = request.params.unwrap_or_else(|| json!({}));

            let result = match method.as_str() {
                "ping" => Ok(json!("pong")),
                "getInfo" => self.get_info(connection_id, &params),
                "getTabs" | "getUserTabs" => self.get_tabs(),
                "claimUserTab" => self.claim_user_tab(&params),
                "createTab" => self.create_tab().await,
                "finalizeTabs" => Ok(json!({})),
                "nameSession" => Ok(json!({})),
                "attach" => self.attach(&params).await,
                "detach" => Ok(json!({})),
                "executeCdp" => self.execute_cdp(&params).await,
                "moveMouse" => Ok(json!({})),
                _ => Err(AppError::Protocol(format!(
                    "unknown browser-use backend method: {method}"
                ))),
            };

            Some(match result {
                Ok(result) => rpc_result(id, result),
                Err(error) => rpc_error(id, error.to_string()),
            })
        }

        fn get_info(&self, connection_id: u64, params: &Value) -> AppResult<Value> {
            let session_id = params
                .get("session_id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty());
            let metadata = match session_id {
                Some(session_id) if self.claim_session(session_id, connection_id)? => {
                    json!({ "codexSessionId": session_id })
                }
                _ => json!({}),
            };

            Ok(json!({
                "name": "Codex App Plus Browser",
                "version": env!("CARGO_PKG_VERSION"),
                "type": "iab",
                "metadata": metadata,
                "capabilities": {
                    "downloads": false,
                    "fileUploads": false,
                    "mediaDownloads": false
                }
            }))
        }

        fn get_tabs(&self) -> AppResult<Value> {
            let tabs = match self.current_tab()? {
                Some(tab) => vec![tab],
                None => Vec::new(),
            };
            Ok(Value::Array(tabs))
        }

        fn claim_user_tab(&self, params: &Value) -> AppResult<Value> {
            self.validate_tab_id(params.get("tabId").and_then(Value::as_u64))?;
            self.current_tab()?
                .ok_or_else(|| AppError::InvalidInput("浏览器标签页尚未打开".to_string()))
        }

        async fn create_tab(self: &Arc<Self>) -> AppResult<Value> {
            self.ensure_browser_sidebar(true).await?;
            self.register_cdp_events(TAB_ID)?;
            self.current_tab()?
                .ok_or_else(|| AppError::Protocol("浏览器侧栏创建失败".to_string()))
        }

        async fn attach(self: &Arc<Self>, params: &Value) -> AppResult<Value> {
            self.validate_tab_id(params.get("tabId").and_then(Value::as_u64))?;
            self.ensure_browser_sidebar(true).await?;
            self.register_cdp_events(TAB_ID)?;
            Ok(json!({}))
        }

        async fn execute_cdp(self: &Arc<Self>, params: &Value) -> AppResult<Value> {
            let tab_id = params
                .get("target")
                .and_then(|target| target.get("tabId"))
                .and_then(Value::as_u64);
            self.validate_tab_id(tab_id)?;

            let method = params
                .get("method")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::InvalidInput("executeCdp 缺少 method".to_string()))?;

            if method == "Page.close" {
                if let Some(webview) = self.app.get_webview(BROWSER_SIDEBAR_LABEL) {
                    webview.hide().map_err(AppError::from)?;
                }
                return Ok(json!({}));
            }

            let command_params = params
                .get("commandParams")
                .cloned()
                .unwrap_or_else(|| json!({}));
            self.ensure_browser_sidebar(false).await?;
            self.register_cdp_events(TAB_ID)?;
            self.call_devtools_protocol_method(method, command_params)
                .await
        }

        async fn call_devtools_protocol_method(
            &self,
            method: &str,
            command_params: Value,
        ) -> AppResult<Value> {
            let webview = self
                .app
                .get_webview(BROWSER_SIDEBAR_LABEL)
                .ok_or_else(|| AppError::InvalidInput("浏览器侧栏尚未打开".to_string()))?;
            let params = serde_json::to_string(&command_params)?;
            let method = method.to_string();
            let method_for_webview = method.clone();
            let (tx, rx) = oneshot::channel::<Result<String, String>>();
            let tx = Arc::new(Mutex::new(Some(tx)));
            let tx_for_webview = tx.clone();

            webview
                .with_webview(move |webview| unsafe {
                    let send_error = |message: String| {
                        send_cdp_result(&tx_for_webview, Err(message));
                    };

                    let Ok(webview) = webview.controller().CoreWebView2() else {
                        send_error("无法获取 WebView2 CoreWebView2 句柄".to_string());
                        return;
                    };

                    let method_wide = to_wide(&method_for_webview);
                    let params_wide = to_wide(&params);
                    let tx_for_handler = tx_for_webview.clone();
                    let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                        move |result, response| {
                            let response =
                                result.map(|_| response).map_err(|error| error.to_string());
                            send_cdp_result(&tx_for_handler, response);
                            Ok(())
                        },
                    ));

                    if let Err(error) = webview.CallDevToolsProtocolMethod(
                        PCWSTR(method_wide.as_ptr()),
                        PCWSTR(params_wide.as_ptr()),
                        &handler,
                    ) {
                        send_error(error.to_string());
                    }
                })
                .map_err(AppError::from)?;

            let response = tokio::time::timeout(CDP_RESPONSE_TIMEOUT, rx)
                .await
                .map_err(|_| AppError::Timeout(format!("CDP 调用超时: {method}")))?
                .map_err(|_| AppError::Protocol(format!("CDP 调用被取消: {method}")))?
                .map_err(|error| AppError::Protocol(format!("CDP 调用失败 {method}: {error}")))?;

            if response.trim().is_empty() {
                return Ok(json!({}));
            }
            serde_json::from_str(&response).map_err(AppError::from)
        }

        fn register_cdp_events(self: &Arc<Self>, tab_id: u64) -> AppResult<()> {
            {
                let mut registered = self.cdp_events_registered.lock().map_err(|_| {
                    AppError::Protocol("Browser Use CDP 事件状态锁已损坏".to_string())
                })?;
                if !registered.insert(tab_id) {
                    return Ok(());
                }
            }

            let webview = self
                .app
                .get_webview(BROWSER_SIDEBAR_LABEL)
                .ok_or_else(|| AppError::InvalidInput("浏览器侧栏尚未打开".to_string()))?;
            let backend = self.clone();
            webview
                .with_webview(move |webview| unsafe {
                    let Ok(webview) = webview.controller().CoreWebView2() else {
                        eprintln!("failed to read WebView2 core handle for Browser Use CDP events");
                        return;
                    };

                    for event_name in CDP_EVENTS {
                        let event_name_owned = event_name.to_string();
                        let event_wide = to_wide(&event_name_owned);
                        let Ok(receiver) =
                            webview.GetDevToolsProtocolEventReceiver(PCWSTR(event_wide.as_ptr()))
                        else {
                            eprintln!(
                                "failed to get WebView2 CDP event receiver: {event_name_owned}"
                            );
                            continue;
                        };

                        let backend_for_event = backend.clone();
                        let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(
                            move |_, args| {
                                let params = match args {
                                    Some(args) => event_params_json(&args),
                                    None => json!({}),
                                };
                                backend_for_event.broadcast(json!({
                                    "jsonrpc": "2.0",
                                    "method": "onCDPEvent",
                                    "params": {
                                        "source": { "tabId": tab_id },
                                        "method": event_name_owned,
                                        "params": params
                                    }
                                }));
                                Ok(())
                            },
                        ));
                        let mut token = 0;
                        if let Err(error) =
                            receiver.add_DevToolsProtocolEventReceived(&handler, &mut token)
                        {
                            eprintln!(
                                "failed to subscribe WebView2 CDP event {event_name}: {error}"
                            );
                        }
                    }
                })
                .map_err(AppError::from)
        }

        async fn ensure_browser_sidebar(&self, request_sidebar_tab: bool) -> AppResult<()> {
            if let Some(webview) = self.app.get_webview(BROWSER_SIDEBAR_LABEL) {
                if request_sidebar_tab {
                    let url = webview
                        .url()
                        .ok()
                        .map(|url| url.as_str().to_string())
                        .unwrap_or_else(|| BLANK_URL.to_string());
                    emit_browser_sidebar_open_requested(&self.app, Some(url))?;
                }
                return Ok(());
            }
            emit_browser_sidebar_open_requested(&self.app, Some(BLANK_URL.to_string()))?;
            let deadline = Instant::now() + SIDEBAR_OPEN_TIMEOUT;
            while Instant::now() < deadline {
                if self.app.get_webview(BROWSER_SIDEBAR_LABEL).is_some() {
                    return Ok(());
                }
                tokio::time::sleep(SIDEBAR_OPEN_POLL_INTERVAL).await;
            }
            Err(AppError::Timeout("等待浏览器侧栏打开超时".to_string()))
        }

        fn current_tab(&self) -> AppResult<Option<Value>> {
            let Some(webview) = self.app.get_webview(BROWSER_SIDEBAR_LABEL) else {
                return Ok(None);
            };

            let mut tab = serde_json::Map::new();
            tab.insert("id".to_string(), json!(TAB_ID));
            tab.insert("active".to_string(), json!(true));
            if let Ok(url) = webview.url() {
                tab.insert("url".to_string(), json!(url.as_str()));
            }
            Ok(Some(Value::Object(tab)))
        }

        fn validate_tab_id(&self, tab_id: Option<u64>) -> AppResult<()> {
            match tab_id {
                Some(TAB_ID) => Ok(()),
                Some(value) => Err(AppError::InvalidInput(format!("未知浏览器标签页: {value}"))),
                None => Err(AppError::InvalidInput("缺少浏览器标签页 id".to_string())),
            }
        }

        fn add_connection(&self, id: u64, tx: mpsc::UnboundedSender<Value>) {
            if let Ok(mut connections) = self.connections.lock() {
                connections.push(ConnectionSender { id, tx });
            }
        }

        fn remove_connection(&self, id: u64) {
            if let Ok(mut connections) = self.connections.lock() {
                connections.retain(|connection| connection.id != id);
            }
        }

        fn broadcast(&self, message: Value) {
            if let Ok(mut connections) = self.connections.lock() {
                connections.retain(|connection| connection.tx.send(message.clone()).is_ok());
            }
        }

        fn claim_session(&self, session_id: &str, connection_id: u64) -> AppResult<bool> {
            let mut claims = self
                .session_claims
                .lock()
                .map_err(|_| AppError::Protocol("Browser Use 会话状态锁已损坏".to_string()))?;
            match claims.get(session_id).copied() {
                Some(owner) if owner == connection_id => Ok(true),
                Some(_) => Ok(false),
                None => {
                    claims.insert(session_id.to_string(), connection_id);
                    Ok(true)
                }
            }
        }

        fn release_session_claims(&self, connection_id: u64) {
            if let Ok(mut claims) = self.session_claims.lock() {
                claims.retain(|_, owner| *owner != connection_id);
            }
        }
    }

    fn event_params_json(
        args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DevToolsProtocolEventReceivedEventArgs,
    ) -> Value {
        unsafe {
            let mut raw = PWSTR::null();
            if args.ParameterObjectAsJson(&mut raw).is_err() {
                return json!({});
            }
            let text = take_pwstr(raw);
            serde_json::from_str(&text).unwrap_or_else(|_| json!({}))
        }
    }

    fn send_cdp_result(
        tx: &Arc<Mutex<Option<oneshot::Sender<Result<String, String>>>>>,
        result: Result<String, String>,
    ) {
        if let Ok(mut tx) = tx.lock() {
            if let Some(tx) = tx.take() {
                let _ = tx.send(result);
            }
        }
    }

    async fn read_framed_message<R>(reader: &mut R) -> io::Result<Option<Value>>
    where
        R: AsyncRead + Unpin,
    {
        let mut header = [0; 4];
        match reader.read_exact(&mut header).await {
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(error) if error.kind() == io::ErrorKind::BrokenPipe => return Ok(None),
            Err(error) => return Err(error),
        }

        let length = u32::from_ne_bytes(header) as usize;
        if length > MAX_FRAME_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("browser-use frame too large: {length} bytes"),
            ));
        }

        let mut body = vec![0; length];
        reader.read_exact(&mut body).await?;
        serde_json::from_slice(&body).map(Some).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("invalid browser-use JSON frame: {error}"),
            )
        })
    }

    fn encode_framed_message(message: &Value) -> io::Result<Vec<u8>> {
        let body = serde_json::to_vec(message).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("failed to encode browser-use JSON frame: {error}"),
            )
        })?;
        let length = u32::try_from(body.len()).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "browser-use JSON frame exceeds u32 length",
            )
        })?;
        let mut frame = Vec::with_capacity(4 + body.len());
        frame.extend_from_slice(&length.to_ne_bytes());
        frame.extend_from_slice(&body);
        Ok(frame)
    }

    fn rpc_result(id: Value, result: Value) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        })
    }

    fn rpc_error(id: Value, message: String) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": 1,
                "message": message
            }
        })
    }

    fn to_wide(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    #[cfg(test)]
    mod tests {
        use super::{encode_framed_message, rpc_result};
        use serde_json::{json, Value};

        #[test]
        fn encodes_native_endian_length_prefixed_json() {
            let message = rpc_result(json!(7), json!({ "ok": true }));
            let frame = encode_framed_message(&message).expect("encoded frame");

            let length = u32::from_ne_bytes(frame[0..4].try_into().expect("header")) as usize;
            assert_eq!(length, frame.len() - 4);

            let decoded: Value = serde_json::from_slice(&frame[4..]).expect("decoded json");
            assert_eq!(decoded["id"], json!(7));
            assert_eq!(decoded["result"]["ok"], json!(true));
        }
    }
}
