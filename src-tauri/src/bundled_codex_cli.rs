use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::command_utils::command_failure_detail;
use crate::error::{AppError, AppResult};
use crate::windows_child_process::configure_background_std_command;
use crate::wsl_support::WslContext;

const MODULE_RESOURCE_PATH: &str = "bundled/codex-cli";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const ENV_BUNDLED_CODEX_ROOT: &str = "CODEX_APP_PLUS_BUNDLED_CODEX_ROOT";
const ENV_ALLOW_SYSTEM_CODEX: &str = "CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX";
const CODEX_NPM_PACKAGE_NAME: &str = "@openai/codex";
const WINDOWS_X64_TRIPLE: &str = "x86_64-pc-windows-msvc";
const WINDOWS_ARM64_TRIPLE: &str = "aarch64-pc-windows-msvc";
const LINUX_X64_TRIPLE: &str = "x86_64-unknown-linux-musl";
const LINUX_ARM64_TRIPLE: &str = "aarch64-unknown-linux-musl";
const WSL_INSTALL_ROOT: &str = ".codex-app-plus/npm-codex";
const WSL_SYNC_SHELL: &str = "bash";
const WSL_SYNC_FLAG: &str = "-lc";
const WSL_SYNC_ARG0: &str = "codex-app-plus";
const WSL_SYNC_SCRIPT: &str = r#"set -e
source_dir=$(wslpath -u "$1" 2>/dev/null || printf '%s' "$1")
dest_dir="$2"
binary_rel="$3"
tmp_dir="${dest_dir}.tmp"
if [ ! -f "${dest_dir}/${binary_rel}" ] || ! cmp -s "${source_dir}/${binary_rel}" "${dest_dir}/${binary_rel}"; then
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"
  cp -R "${source_dir}/." "$tmp_dir/"
  if [ -f "${tmp_dir}/${binary_rel}" ]; then
    chmod 755 "${tmp_dir}/${binary_rel}"
  fi
  if [ -f "${tmp_dir}/path/rg" ]; then
    chmod 755 "${tmp_dir}/path/rg"
  fi
  rm -rf "$dest_dir"
  mv "$tmp_dir" "$dest_dir"
fi
printf '%s\n' "${dest_dir}/${binary_rel}"
if [ -d "${dest_dir}/path" ]; then
  printf '%s\n' "${dest_dir}/path"
fi
"#;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BundledCodexCli {
    pub(crate) path: PathBuf,
    pub(crate) version: String,
    pub(crate) path_dirs: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BundledWslCodexCli {
    pub(crate) linux_path: String,
    pub(crate) version: String,
    pub(crate) path_dirs: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    version: String,
    npm_package: ManifestNpmPackage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestNpmPackage {
    name: Option<String>,
    root: String,
    platform_packages: ManifestPlatformPackages,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestPlatformPackages {
    windows_x64: Option<String>,
    windows_arm64: Option<String>,
    linux_x64: Option<String>,
    linux_arm64: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BundledPlatform {
    Windows,
    Linux,
}

#[derive(Debug, Clone)]
struct NpmBinaryLocation {
    binary_path: PathBuf,
    target_root: PathBuf,
    binary_relative_path: PathBuf,
}

pub(crate) fn allow_system_codex_fallback() -> bool {
    env::var(ENV_ALLOW_SYSTEM_CODEX)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

pub(crate) fn resolve_windows_cli(app: Option<&AppHandle>) -> AppResult<Option<BundledCodexCli>> {
    let Some(root) = resolve_bundle_root(app)? else {
        return Ok(None);
    };
    let manifest = read_manifest(&root)?;
    let location = resolve_npm_binary_location(&root, &manifest, BundledPlatform::Windows)?;
    Ok(Some(BundledCodexCli {
        path: location.binary_path,
        version: manifest.version,
        path_dirs: bundled_path_dirs(&location.target_root),
    }))
}

pub(crate) fn ensure_wsl_cli(
    app: Option<&AppHandle>,
    wsl_program: &Path,
    context: &WslContext,
) -> AppResult<Option<BundledWslCodexCli>> {
    let Some(root) = resolve_bundle_root(app)? else {
        return Ok(None);
    };
    let manifest = read_manifest(&root)?;
    let location = resolve_npm_binary_location(&root, &manifest, BundledPlatform::Linux)?;
    let destination_root =
        build_wsl_install_root(context, &manifest.version, linux_target_triple());
    let sync = sync_linux_target_to_wsl(
        wsl_program,
        context,
        &location.target_root,
        &destination_root,
        &location.binary_relative_path,
    )?;

    Ok(Some(BundledWslCodexCli {
        linux_path: sync.binary_path,
        version: manifest.version,
        path_dirs: sync.path_dirs,
    }))
}

pub(crate) fn windows_environment(cli: &BundledCodexCli) -> Vec<(String, Option<String>)> {
    let mut environment = vec![("CODEX_MANAGED_BY_NPM".to_string(), Some("1".to_string()))];
    if let Some(path) = prepend_path_dirs(&cli.path_dirs) {
        environment.push(("PATH".to_string(), Some(path)));
    }
    environment
}

fn resolve_bundle_root(app: Option<&AppHandle>) -> AppResult<Option<PathBuf>> {
    if let Ok(root) = env::var(ENV_BUNDLED_CODEX_ROOT) {
        let root = PathBuf::from(root);
        if is_bundle_root(&root) {
            return Ok(Some(root));
        }
        return Err(AppError::InvalidInput(format!(
            "内置 Codex CLI npm 目录无效: {}",
            root.display()
        )));
    }

    if let Some(app) = app {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let candidate = resource_dir.join(MODULE_RESOURCE_PATH);
            if is_bundle_root(&candidate) {
                return Ok(Some(candidate));
            }
        }
    }

    let dev_candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(MODULE_RESOURCE_PATH);
    if is_bundle_root(&dev_candidate) {
        return Ok(Some(dev_candidate));
    }

    Ok(None)
}

fn is_bundle_root(path: &Path) -> bool {
    path.join(MANIFEST_FILE_NAME).is_file()
}

fn read_manifest(root: &Path) -> AppResult<Manifest> {
    let manifest_path = root.join(MANIFEST_FILE_NAME);
    let text = fs::read_to_string(&manifest_path)?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|error| {
        AppError::InvalidInput(format!(
            "内置 Codex CLI npm manifest 解析失败: {}: {error}",
            manifest_path.display()
        ))
    })?;
    if manifest.version.trim().is_empty() {
        return Err(AppError::InvalidInput(format!(
            "内置 Codex CLI npm manifest 缺少 version: {}",
            manifest_path.display()
        )));
    }
    if manifest
        .npm_package
        .name
        .as_deref()
        .unwrap_or(CODEX_NPM_PACKAGE_NAME)
        != CODEX_NPM_PACKAGE_NAME
    {
        return Err(AppError::InvalidInput(format!(
            "内置 Codex CLI npm 包名必须是 {CODEX_NPM_PACKAGE_NAME}: {}",
            manifest_path.display()
        )));
    }
    Ok(manifest)
}

fn resolve_npm_binary_location(
    root: &Path,
    manifest: &Manifest,
    platform: BundledPlatform,
) -> AppResult<NpmBinaryLocation> {
    let target_triple = target_triple(platform);
    let binary_name = binary_name(platform);
    let binary_relative_path = PathBuf::from("codex").join(binary_name);
    let package_root = resolve_manifest_directory(root, &manifest.npm_package.root)?;
    validate_meta_package_root(&package_root)?;

    let mut candidates = Vec::new();
    if let Some(platform_package) = manifest.npm_package.platform_package_for(platform) {
        if let Some(platform_root) = resolve_optional_manifest_directory(root, platform_package)? {
            candidates.push(platform_root);
        }
    }
    candidates.push(package_root);

    for package_root in candidates {
        let target_root = package_root.join("vendor").join(target_triple);
        let binary_path = target_root.join(&binary_relative_path);
        if binary_path.is_file() {
            return Ok(NpmBinaryLocation {
                binary_path,
                target_root,
                binary_relative_path,
            });
        }
    }

    Err(AppError::InvalidInput(format!(
        "内置官方 npm 包缺少 {target_triple} Codex 二进制。请重新同步 @openai/codex 及对应平台包。"
    )))
}

fn validate_meta_package_root(path: &Path) -> AppResult<()> {
    if path.join("package.json").is_file() && path.join("bin/codex.js").is_file() {
        return Ok(());
    }
    Err(AppError::InvalidInput(format!(
        "内置 @openai/codex npm 包不完整: {}",
        path.display()
    )))
}

fn resolve_manifest_directory(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let relative = validate_relative_manifest_path(relative_path)?;
    let path = root.join(relative);
    if path.is_dir() {
        return Ok(path);
    }
    Err(AppError::InvalidInput(format!(
        "内置 Codex CLI npm 目录不存在: {}",
        path.display()
    )))
}

fn resolve_optional_manifest_directory(
    root: &Path,
    relative_path: &str,
) -> AppResult<Option<PathBuf>> {
    let relative = validate_relative_manifest_path(relative_path)?;
    let path = root.join(relative);
    if path.is_dir() {
        return Ok(Some(path));
    }
    Ok(None)
}

fn validate_relative_manifest_path(path: &str) -> AppResult<PathBuf> {
    let value = path.trim();
    if value.is_empty() {
        return Err(AppError::InvalidInput(
            "内置 Codex CLI npm manifest 中的路径为空".to_string(),
        ));
    }

    let candidate = PathBuf::from(value);
    if candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(AppError::InvalidInput(format!(
            "内置 Codex CLI npm manifest 只能使用相对路径: {value}"
        )));
    }
    Ok(candidate)
}

fn target_triple(platform: BundledPlatform) -> &'static str {
    match platform {
        BundledPlatform::Windows => windows_target_triple(),
        BundledPlatform::Linux => linux_target_triple(),
    }
}

fn windows_target_triple() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        WINDOWS_ARM64_TRIPLE
    } else {
        WINDOWS_X64_TRIPLE
    }
}

fn linux_target_triple() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        LINUX_ARM64_TRIPLE
    } else {
        LINUX_X64_TRIPLE
    }
}

fn binary_name(platform: BundledPlatform) -> &'static str {
    match platform {
        BundledPlatform::Windows => "codex.exe",
        BundledPlatform::Linux => "codex",
    }
}

fn bundled_path_dirs(target_root: &Path) -> Vec<PathBuf> {
    let path_dir = target_root.join("path");
    if path_dir.is_dir() {
        vec![path_dir]
    } else {
        Vec::new()
    }
}

fn prepend_path_dirs(path_dirs: &[PathBuf]) -> Option<String> {
    if path_dirs.is_empty() {
        return None;
    }
    let existing = env::var_os("PATH");
    let paths = path_dirs
        .iter()
        .cloned()
        .chain(existing.as_deref().into_iter().flat_map(env::split_paths));
    env::join_paths(paths)
        .ok()
        .map(|value| value.to_string_lossy().to_string())
}

fn build_wsl_install_root(context: &WslContext, version: &str, target_triple: &str) -> String {
    format!(
        "{}/{}/{}/{}",
        context.home_path.trim_end_matches('/'),
        WSL_INSTALL_ROOT,
        sanitize_version_segment(version),
        target_triple
    )
}

fn sanitize_version_segment(version: &str) -> String {
    let sanitized = version
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "current".to_string()
    } else {
        sanitized
    }
}

struct WslSyncResult {
    binary_path: String,
    path_dirs: Vec<String>,
}

fn sync_linux_target_to_wsl(
    wsl_program: &Path,
    context: &WslContext,
    source_target_root: &Path,
    destination_root: &str,
    binary_relative_path: &Path,
) -> AppResult<WslSyncResult> {
    let binary_relative_text = binary_relative_path
        .to_str()
        .ok_or_else(|| AppError::InvalidInput("Codex CLI binary path is not UTF-8".to_string()))?
        .replace('\\', "/");
    let mut command = Command::new(wsl_program);
    configure_background_std_command(&mut command);
    let output = command
        .args([
            OsStr::new("--distribution"),
            OsStr::new(context.distro_name.as_str()),
            OsStr::new("--cd"),
            OsStr::new(context.home_path.as_str()),
            OsStr::new("--exec"),
            OsStr::new(WSL_SYNC_SHELL),
            OsStr::new(WSL_SYNC_FLAG),
            OsStr::new(WSL_SYNC_SCRIPT),
            OsStr::new(WSL_SYNC_ARG0),
            source_target_root.as_os_str(),
            OsStr::new(destination_root),
            OsStr::new(&binary_relative_text),
        ])
        .output()
        .map_err(|error| {
            AppError::Io(format!(
                "无法同步内置官方 npm Codex CLI 到 WSL 发行版 {}: {error}",
                context.distro_name
            ))
        })?;

    if !output.status.success() {
        return Err(AppError::Protocol(format!(
            "同步内置官方 npm Codex CLI 到 WSL 发行版 {} 失败: {}",
            context.distro_name,
            command_failure_detail(&output.stderr, &output.stdout, output.status.to_string())
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let binary_path = lines.next().ok_or_else(|| {
        AppError::Protocol("同步内置官方 npm Codex CLI 后未返回 WSL 二进制路径".to_string())
    })?;
    Ok(WslSyncResult {
        binary_path: binary_path.to_string(),
        path_dirs: lines.map(str::to_string).collect(),
    })
}

impl ManifestNpmPackage {
    fn platform_package_for(&self, platform: BundledPlatform) -> Option<&str> {
        match platform {
            BundledPlatform::Windows => if cfg!(target_arch = "aarch64") {
                self.platform_packages.windows_arm64.as_deref()
            } else {
                self.platform_packages.windows_x64.as_deref()
            }
            .or(self.platform_packages.windows_x64.as_deref()),
            BundledPlatform::Linux => if cfg!(target_arch = "aarch64") {
                self.platform_packages.linux_arm64.as_deref()
            } else {
                self.platform_packages.linux_x64.as_deref()
            }
            .or(self.platform_packages.linux_x64.as_deref()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_wsl_install_root, sanitize_version_segment, validate_relative_manifest_path,
    };
    use crate::wsl_support::WslContext;

    #[test]
    fn rejects_manifest_paths_that_escape_bundle_root() {
        assert!(validate_relative_manifest_path("../node_modules/@openai/codex").is_err());
        assert!(validate_relative_manifest_path("/tmp/codex").is_err());
        assert!(validate_relative_manifest_path("C:/tmp/codex").is_err());
    }

    #[test]
    fn accepts_manifest_relative_paths() {
        let path = validate_relative_manifest_path("npm/node_modules/@openai/codex").unwrap();

        assert_eq!(
            path,
            std::path::PathBuf::from("npm/node_modules/@openai/codex")
        );
    }

    #[test]
    fn builds_stable_wsl_install_root() {
        let context = WslContext {
            distro_name: "Ubuntu".to_string(),
            home_path: "/home/me".to_string(),
        };

        assert_eq!(
            build_wsl_install_root(&context, "0.43.1+official", "x86_64-unknown-linux-musl"),
            "/home/me/.codex-app-plus/npm-codex/0.43.1_official/x86_64-unknown-linux-musl"
        );
    }

    #[test]
    fn sanitizes_empty_version_to_current() {
        assert_eq!(sanitize_version_segment(""), "current");
    }
}
