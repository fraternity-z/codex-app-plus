use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

use super::runtime::{RepositoryCacheEntry, RepositoryContextCache};

const GIT_DIR_NAME: &str = ".git";

#[derive(Debug, Clone)]
pub(crate) struct RepositoryContext {
    pub repo_root: PathBuf,
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedWorkspace {
    pub workspace_path: PathBuf,
    pub repo_root: Option<PathBuf>,
}

pub(crate) fn resolve_workspace(
    repo_path: &str,
    cache: &RepositoryContextCache,
) -> AppResult<ResolvedWorkspace> {
    let cache_key = repo_path.trim().to_string();
    if let Some(cached) = cache.get(&cache_key) {
        if is_cache_entry_valid(&cached) {
            return Ok(ResolvedWorkspace {
                workspace_path: cached.workspace_path,
                repo_root: Some(cached.repo_root),
            });
        }
        cache.remove(&cache_key);
    }

    let workspace_path = resolve_workspace_path(repo_path)?;
    let repo_root = find_repository_root(&workspace_path);
    if let Some(repo_root) = repo_root.clone() {
        cache.insert(
            cache_key,
            RepositoryCacheEntry {
                workspace_path: workspace_path.clone(),
                repo_root,
            },
        );
    }

    Ok(ResolvedWorkspace {
        workspace_path,
        repo_root,
    })
}

pub(crate) fn require_repository_context(
    repo_path: &str,
    cache: &RepositoryContextCache,
) -> AppResult<RepositoryContext> {
    let resolved = resolve_workspace(repo_path, cache)?;
    let repo_root = resolved
        .repo_root
        .ok_or_else(|| AppError::InvalidInput("当前工作区不是 Git 仓库。".to_string()))?;
    Ok(RepositoryContext { repo_root })
}

pub(crate) fn validate_paths(paths: &[String]) -> AppResult<Vec<OsString>> {
    let validated = paths
        .iter()
        .map(|path| validate_pathspec(path).map(OsString::from))
        .collect::<AppResult<Vec<_>>>()?;
    if validated.is_empty() {
        return Err(AppError::InvalidInput("paths 不能为空。".to_string()));
    }
    Ok(validated)
}

pub(crate) fn validate_pathspec(path: &str) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("path 不能为空。".to_string()));
    }
    Ok(trimmed.to_string())
}

pub(crate) fn to_args(args: &[&str]) -> Vec<OsString> {
    args.iter().map(OsString::from).collect()
}

fn is_cache_entry_valid(entry: &RepositoryCacheEntry) -> bool {
    entry.workspace_path.is_dir() && entry.repo_root.join(GIT_DIR_NAME).exists()
}

fn resolve_workspace_path(repo_path: &str) -> AppResult<PathBuf> {
    let trimmed_path = repo_path.trim();
    if trimmed_path.is_empty() {
        return Err(AppError::InvalidInput("repoPath 不能为空。".to_string()));
    }
    let path = PathBuf::from(trimmed_path);
    if !path.exists() {
        return Err(AppError::InvalidInput(format!(
            "工作区不存在: {trimmed_path}"
        )));
    }
    if !path.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "工作区不是目录: {trimmed_path}"
        )));
    }
    std::fs::canonicalize(path).map_err(AppError::from)
}

fn find_repository_root(workspace_path: &Path) -> Option<PathBuf> {
    workspace_path
        .ancestors()
        .find(|candidate| candidate.join(GIT_DIR_NAME).exists())
        .map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::{require_repository_context, resolve_workspace};
    use crate::git::runtime::RepositoryContextCache;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestWorkspace {
        root: PathBuf,
        child: PathBuf,
    }

    impl TestWorkspace {
        fn create() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos();
            let root = std::env::temp_dir().join(format!("codex-git-repo-test-{suffix}"));
            let child = root.join("packages/app");
            fs::create_dir_all(root.join(".git")).expect("create git dir");
            fs::create_dir_all(&child).expect("create child dir");
            Self { root, child }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn caches_repository_context_and_reuses_entry() {
        let workspace = TestWorkspace::create();
        let cache = RepositoryContextCache::default();
        let repo_path = workspace.child.to_string_lossy().to_string();

        let first = resolve_workspace(&repo_path, &cache).expect("first resolve");
        let second = resolve_workspace(&repo_path, &cache).expect("second resolve");

        assert_eq!(cache.len(), 1);
        assert_eq!(first.repo_root, Some(workspace.root.clone()));
        assert_eq!(second.repo_root, Some(workspace.root.clone()));
    }

    #[test]
    fn invalidates_stale_cache_before_returning_repository_error() {
        let workspace = TestWorkspace::create();
        let cache = RepositoryContextCache::default();
        let repo_path = workspace.child.to_string_lossy().to_string();
        let _ = require_repository_context(&repo_path, &cache).expect("prime cache");

        fs::remove_dir_all(workspace.root.join(".git")).expect("remove git dir");

        let error = require_repository_context(&repo_path, &cache)
            .expect_err("expected invalid repository");

        assert_eq!(cache.len(), 0);
        assert!(error.to_string().contains("当前工作区不是 Git 仓库"));
    }
}
