use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::webview::{DownloadEvent, NewWindowResponse, WebviewBuilder, WebviewWindowBuilder};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, Url, Webview, WebviewUrl};

use crate::error::{AppError, AppResult};
use crate::models::{
    BrowserOpenInput, BrowserSidebarBoundsInput, BrowserSidebarOpenInput, BrowserUseApprovalMode,
    BrowserUseApprovalModeInput, BrowserUseOriginInput, BrowserUseOriginKind,
    BrowserUseSettingsOutput,
};

const APP_DIRECTORY: &str = "CodexAppPlus";
const BROWSER_DIRECTORY: &str = "browser";
const BROWSER_CONFIG_FILE: &str = "config.toml";
const BROWSER_DATA_DIRECTORY: &str = "data";
pub const BROWSER_SIDEBAR_LABEL: &str = "codex-browser-sidebar";
pub const BROWSER_WINDOW_LABEL: &str = "codex-browser";
const BROWSER_WINDOW_TITLE: &str = "Codex Browser";
const DEFAULT_BROWSER_URL: &str = "https://www.google.com";
const MAIN_WINDOW_LABEL: &str = "main";
const MIN_BROWSER_SIDEBAR_SIZE: f64 = 24.0;
static BROWSER_SIDEBAR_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct BrowserConfig {
    approval_mode: Option<String>,
    origins: Option<BrowserOrigins>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct BrowserOrigins {
    allowed: Option<Vec<String>>,
    denied: Option<Vec<String>>,
}

pub fn open_browser_window(app: AppHandle, input: BrowserOpenInput) -> AppResult<()> {
    let url = normalize_browser_url(input.url.as_deref())?;
    let data_directory = browser_data_directory()?;
    fs::create_dir_all(&data_directory)?;

    if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        window.show().map_err(AppError::from)?;
        window.unminimize().map_err(AppError::from)?;
        window.navigate(url).map_err(AppError::from)?;
        window.set_focus().map_err(AppError::from)?;
        return Ok(());
    }

    let app_for_new_windows = app.clone();
    let window = WebviewWindowBuilder::new(&app, BROWSER_WINDOW_LABEL, WebviewUrl::External(url))
        .title(BROWSER_WINDOW_TITLE)
        .inner_size(1100.0, 760.0)
        .min_inner_size(520.0, 420.0)
        .resizable(true)
        .data_directory(data_directory)
        .on_navigation(|url| is_allowed_browser_url(url))
        .on_new_window(move |url, _features| {
            if is_allowed_browser_url(&url) {
                if let Some(window) = app_for_new_windows.get_webview_window(BROWSER_WINDOW_LABEL) {
                    let _ = window.navigate(url);
                    let _ = window.set_focus();
                }
            }
            NewWindowResponse::Deny
        })
        .on_download(|_, event| !matches!(event, DownloadEvent::Requested { .. }))
        .on_document_title_changed(|window, title| {
            let trimmed = title.trim();
            if trimmed.is_empty() {
                let _ = window.set_title(BROWSER_WINDOW_TITLE);
                return;
            }
            let title = if trimmed.chars().count() > 80 {
                format!("{}...", trimmed.chars().take(80).collect::<String>())
            } else {
                trimmed.to_string()
            };
            let _ = window.set_title(&format!("{title} - {BROWSER_WINDOW_TITLE}"));
        })
        .build()
        .map_err(AppError::from)?;

    window.set_focus().map_err(AppError::from)?;
    Ok(())
}

pub fn open_browser_sidebar(app: AppHandle, input: BrowserSidebarOpenInput) -> AppResult<()> {
    let url = normalize_browser_url(input.url.as_deref())?;
    let bounds = sanitize_browser_sidebar_bounds(input.bounds)?;
    let _guard = browser_sidebar_open_lock()
        .lock()
        .map_err(|_| AppError::Protocol("浏览器侧栏打开状态锁已损坏".to_string()))?;
    let data_directory = browser_data_directory()?;
    fs::create_dir_all(&data_directory)?;

    if let Some(webview) = app.get_webview(BROWSER_SIDEBAR_LABEL) {
        apply_browser_sidebar_bounds(&webview, bounds)?;
        webview.show().map_err(AppError::from)?;
        webview.navigate(url).map_err(AppError::from)?;
        return Ok(());
    }

    let window = app
        .get_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| AppError::InvalidInput("主窗口不存在".to_string()))?;
    let app_for_new_windows = app.clone();
    let webview_builder = WebviewBuilder::new(BROWSER_SIDEBAR_LABEL, WebviewUrl::External(url))
        .data_directory(data_directory)
        .on_navigation(|url| is_allowed_browser_url(url))
        .on_new_window(move |url, _features| {
            if is_allowed_browser_url(&url) {
                if let Some(webview) = app_for_new_windows.get_webview(BROWSER_SIDEBAR_LABEL) {
                    let _ = webview.navigate(url);
                    let _ = webview.show();
                }
            }
            NewWindowResponse::Deny
        })
        .on_download(|_, event| !matches!(event, DownloadEvent::Requested { .. }));

    let webview = window
        .add_child(
            webview_builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(AppError::from)?;
    if bounds.visible {
        webview.show().map_err(AppError::from)?;
    } else {
        webview.hide().map_err(AppError::from)?;
    }
    Ok(())
}

pub fn update_browser_sidebar_bounds(
    app: AppHandle,
    input: BrowserSidebarBoundsInput,
) -> AppResult<()> {
    let Some(webview) = app.get_webview(BROWSER_SIDEBAR_LABEL) else {
        return Ok(());
    };
    apply_browser_sidebar_bounds(&webview, sanitize_browser_sidebar_bounds(input)?)
}

pub fn hide_browser_sidebar(app: AppHandle) -> AppResult<()> {
    if let Some(webview) = app.get_webview(BROWSER_SIDEBAR_LABEL) {
        webview.hide().map_err(AppError::from)?;
    }
    Ok(())
}

pub fn clear_browser_browsing_data(app: AppHandle) -> AppResult<()> {
    let mut cleared_active_browser = false;

    if let Some(webview) = app.get_webview(BROWSER_SIDEBAR_LABEL) {
        webview.clear_all_browsing_data().map_err(AppError::from)?;
        let _ = webview.reload();
        cleared_active_browser = true;
    }

    if let Some(window) = app.get_webview_window(BROWSER_WINDOW_LABEL) {
        window.clear_all_browsing_data().map_err(AppError::from)?;
        let _ = window.reload();
        cleared_active_browser = true;
    }

    if cleared_active_browser {
        return Ok(());
    }

    let root = browser_root()?;
    let data_directory = browser_data_directory()?;
    remove_browser_data_directory(&root, &data_directory)
}

pub fn read_browser_use_settings() -> AppResult<BrowserUseSettingsOutput> {
    let path = browser_config_path()?;
    let config = read_config(&path)?;
    Ok(settings_from_config(&config))
}

pub fn write_browser_use_approval_mode(
    input: BrowserUseApprovalModeInput,
) -> AppResult<BrowserUseSettingsOutput> {
    let path = browser_config_path()?;
    let mut config = read_config(&path)?;
    config.approval_mode = Some(approval_mode_to_config(input.approval_mode).to_string());
    write_config(&path, &config)?;
    Ok(settings_from_config(&config))
}

pub fn add_browser_use_origin(input: BrowserUseOriginInput) -> AppResult<BrowserUseSettingsOutput> {
    let path = browser_config_path()?;
    let mut config = read_config(&path)?;
    let origin = normalize_browser_use_origin(&input.origin)?;
    add_origin_to_config(&mut config, input.kind, origin);
    write_config(&path, &config)?;
    Ok(settings_from_config(&config))
}

pub fn remove_browser_use_origin(
    input: BrowserUseOriginInput,
) -> AppResult<BrowserUseSettingsOutput> {
    let path = browser_config_path()?;
    let mut config = read_config(&path)?;
    let origin = normalize_browser_use_origin(&input.origin)?;
    remove_origin_from_config(&mut config, input.kind, &origin);
    write_config(&path, &config)?;
    Ok(settings_from_config(&config))
}

fn browser_root() -> AppResult<PathBuf> {
    let local_data = dirs::data_local_dir()
        .ok_or_else(|| AppError::InvalidInput("无法解析 LOCALAPPDATA".to_string()))?;
    Ok(local_data.join(APP_DIRECTORY).join(BROWSER_DIRECTORY))
}

fn browser_sidebar_open_lock() -> &'static Mutex<()> {
    BROWSER_SIDEBAR_OPEN_LOCK.get_or_init(|| Mutex::new(()))
}

fn browser_config_path() -> AppResult<PathBuf> {
    Ok(browser_root()?.join(BROWSER_CONFIG_FILE))
}

fn browser_data_directory() -> AppResult<PathBuf> {
    Ok(browser_root()?.join(BROWSER_DATA_DIRECTORY))
}

fn read_config(path: &Path) -> AppResult<BrowserConfig> {
    if !path.exists() {
        return Ok(BrowserConfig::default());
    }

    let text = fs::read_to_string(path)?;
    toml::from_str::<BrowserConfig>(&text)
        .map_err(|error| AppError::InvalidInput(format!("browser/config.toml 解析失败: {error}")))
}

fn write_config(path: &Path, config: &BrowserConfig) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(config)
        .map_err(|error| AppError::Protocol(format!("browser/config.toml 序列化失败: {error}")))?;
    fs::write(path, text)?;
    Ok(())
}

fn sanitize_browser_sidebar_bounds(
    input: BrowserSidebarBoundsInput,
) -> AppResult<BrowserSidebarBoundsInput> {
    if !input.x.is_finite()
        || !input.y.is_finite()
        || !input.width.is_finite()
        || !input.height.is_finite()
    {
        return Err(AppError::InvalidInput("浏览器侧栏位置参数无效".to_string()));
    }
    Ok(BrowserSidebarBoundsInput {
        x: input.x.max(0.0),
        y: input.y.max(0.0),
        width: input.width.max(MIN_BROWSER_SIDEBAR_SIZE),
        height: input.height.max(MIN_BROWSER_SIDEBAR_SIZE),
        visible: input.visible,
    })
}

fn apply_browser_sidebar_bounds<R: Runtime>(
    webview: &Webview<R>,
    bounds: BrowserSidebarBoundsInput,
) -> AppResult<()> {
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(AppError::from)?;
    webview
        .set_size(LogicalSize::new(bounds.width, bounds.height))
        .map_err(AppError::from)?;
    if bounds.visible {
        webview.show().map_err(AppError::from)?;
    } else {
        webview.hide().map_err(AppError::from)?;
    }
    Ok(())
}

fn remove_browser_data_directory(root: &Path, data_directory: &Path) -> AppResult<()> {
    if !data_directory.exists() {
        return Ok(());
    }
    if !root.exists() {
        return Err(AppError::InvalidInput(
            "浏览器数据目录根路径不存在".to_string(),
        ));
    }

    let root = root.canonicalize()?;
    let data_directory = data_directory.canonicalize()?;
    if !data_directory.starts_with(&root) {
        return Err(AppError::InvalidInput(
            "拒绝清理浏览器数据目录之外的路径".to_string(),
        ));
    }

    fs::remove_dir_all(data_directory)?;
    Ok(())
}

fn normalize_browser_url(value: Option<&str>) -> AppResult<Url> {
    let trimmed = value.unwrap_or_default().trim();
    let raw = if trimmed.is_empty() {
        DEFAULT_BROWSER_URL.to_string()
    } else if trimmed.eq_ignore_ascii_case("about:blank") {
        "about:blank".to_string()
    } else if has_url_scheme(trimmed) {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&raw)
        .map_err(|error| AppError::InvalidInput(format!("浏览器地址无效: {error}")))?;
    if !is_allowed_browser_url(&url) {
        return Err(AppError::InvalidInput(
            "内置浏览器仅支持 http、https 和 about:blank".to_string(),
        ));
    }
    Ok(url)
}

fn is_allowed_browser_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        || (url.scheme() == "about" && url.as_str() == "about:blank")
}

fn normalize_browser_use_origin(value: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("域名不能为空".to_string()));
    }

    let raw = if has_url_scheme(trimmed) {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url =
        Url::parse(&raw).map_err(|error| AppError::InvalidInput(format!("域名无效: {error}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::InvalidInput(
            "仅支持 http 或 https 域名".to_string(),
        ));
    }
    Ok(url.origin().unicode_serialization())
}

fn has_url_scheme(value: &str) -> bool {
    let Some(index) = value.find("://") else {
        return false;
    };
    let scheme = &value[..index];
    !scheme.is_empty()
        && scheme.chars().enumerate().all(|(index, ch)| {
            if index == 0 {
                ch.is_ascii_alphabetic()
            } else {
                ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '.')
            }
        })
}

fn settings_from_config(config: &BrowserConfig) -> BrowserUseSettingsOutput {
    let origins = config.origins.as_ref();
    BrowserUseSettingsOutput {
        approval_mode: approval_mode_from_config(config.approval_mode.as_deref()),
        allowed_origins: normalize_origin_list(origins.and_then(|value| value.allowed.as_ref())),
        denied_origins: normalize_origin_list(origins.and_then(|value| value.denied.as_ref())),
    }
}

fn approval_mode_from_config(value: Option<&str>) -> BrowserUseApprovalMode {
    match value {
        Some("never_ask") => BrowserUseApprovalMode::NeverAsk,
        _ => BrowserUseApprovalMode::AlwaysAsk,
    }
}

fn approval_mode_to_config(mode: BrowserUseApprovalMode) -> &'static str {
    match mode {
        BrowserUseApprovalMode::AlwaysAsk => "always_ask",
        BrowserUseApprovalMode::NeverAsk => "never_ask",
    }
}

fn normalize_origin_list(values: Option<&Vec<String>>) -> Vec<String> {
    let Some(values) = values else {
        return Vec::new();
    };
    let mut result = Vec::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || result.iter().any(|item| item == trimmed) {
            continue;
        }
        result.push(trimmed.to_string());
    }
    result
}

fn add_origin_to_config(config: &mut BrowserConfig, kind: BrowserUseOriginKind, origin: String) {
    let origins = config.origins.get_or_insert_with(BrowserOrigins::default);
    let (target, opposite) = origin_lists_mut(origins, kind);
    *target = merge_origin(target.take(), &origin);
    *opposite = remove_origin(opposite.take(), &origin);
}

fn remove_origin_from_config(config: &mut BrowserConfig, kind: BrowserUseOriginKind, origin: &str) {
    let Some(origins) = config.origins.as_mut() else {
        return;
    };
    let (target, _) = origin_lists_mut(origins, kind);
    *target = remove_origin(target.take(), origin);
}

fn origin_lists_mut(
    origins: &mut BrowserOrigins,
    kind: BrowserUseOriginKind,
) -> (&mut Option<Vec<String>>, &mut Option<Vec<String>>) {
    match kind {
        BrowserUseOriginKind::Allowed => (&mut origins.allowed, &mut origins.denied),
        BrowserUseOriginKind::Denied => (&mut origins.denied, &mut origins.allowed),
    }
}

fn merge_origin(values: Option<Vec<String>>, origin: &str) -> Option<Vec<String>> {
    let mut values = normalize_origin_list(values.as_ref());
    if !values.iter().any(|value| value == origin) {
        values.push(origin.to_string());
    }
    Some(values)
}

fn remove_origin(values: Option<Vec<String>>, origin: &str) -> Option<Vec<String>> {
    let values: Vec<String> = normalize_origin_list(values.as_ref())
        .into_iter()
        .filter(|value| value != origin)
        .collect();
    Some(values)
}

#[cfg(test)]
mod tests {
    use super::{
        add_origin_to_config, normalize_browser_url, normalize_browser_use_origin,
        remove_origin_from_config, settings_from_config, BrowserConfig, BrowserOrigins,
    };
    use crate::models::{BrowserUseApprovalMode, BrowserUseOriginKind};

    #[test]
    fn normalizes_browser_urls_with_default_scheme() {
        let url = normalize_browser_url(Some("example.com/path")).expect("browser url");

        assert_eq!(url.as_str(), "https://example.com/path");
    }

    #[test]
    fn accepts_about_blank_browser_url() {
        let url = normalize_browser_url(Some("about:blank")).expect("browser url");

        assert_eq!(url.as_str(), "about:blank");
    }

    #[test]
    fn rejects_unsupported_browser_url_schemes() {
        let result = normalize_browser_url(Some("file:///C:/secret.txt"));

        assert!(result.is_err());
    }

    #[test]
    fn normalizes_origin_to_url_origin() {
        let origin = normalize_browser_use_origin("example.com/path?q=1").expect("origin");

        assert_eq!(origin, "https://example.com");
    }

    #[test]
    fn adding_origin_removes_it_from_opposite_list() {
        let mut config = BrowserConfig {
            approval_mode: Some("never_ask".to_string()),
            origins: Some(BrowserOrigins {
                allowed: None,
                denied: Some(vec![
                    "https://blocked.test".to_string(),
                    "https://example.com".to_string(),
                ]),
            }),
        };

        add_origin_to_config(
            &mut config,
            BrowserUseOriginKind::Allowed,
            "https://example.com".to_string(),
        );

        let settings = settings_from_config(&config);
        assert_eq!(settings.approval_mode, BrowserUseApprovalMode::NeverAsk);
        assert_eq!(settings.allowed_origins, vec!["https://example.com"]);
        assert_eq!(settings.denied_origins, vec!["https://blocked.test"]);
    }

    #[test]
    fn removing_origin_updates_selected_list_only() {
        let mut config = BrowserConfig {
            approval_mode: None,
            origins: Some(BrowserOrigins {
                allowed: Some(vec!["https://example.com".to_string()]),
                denied: Some(vec!["https://blocked.test".to_string()]),
            }),
        };

        remove_origin_from_config(
            &mut config,
            BrowserUseOriginKind::Denied,
            "https://blocked.test",
        );

        let settings = settings_from_config(&config);
        assert_eq!(settings.allowed_origins, vec!["https://example.com"]);
        assert!(settings.denied_origins.is_empty());
    }
}
