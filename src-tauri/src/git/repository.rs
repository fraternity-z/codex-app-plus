use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

use super::process::rev_parse;
use super::runtime::{RepositoryCacheEntry, RepositoryContextCache};

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
    entry.workspace_path.is_dir() && is_repository_path(&entry.repo_root)
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
    rev_parse(workspace_path, "--show-toplevel")
        .ok()
        .map(PathBuf::from)
        .and_then(|path| std::fs::canonicalize(path).ok())
}

fn is_repository_path(path: &Path) -> bool {
    path.is_dir() && rev_parse(path, "--show-toplevel").is_ok()
}

#[cfg(test)]
mod tests {
    use super::{require_repository_context, resolve_workspace};
    use crate::git::runtime::RepositoryContextCache;
    use crate::test_support::unique_temp_dir;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    const GIT_PROGRAM: &str = "git";

    struct TestWorkspace {
        root: PathBuf,
        child: PathBuf,
    }

    impl TestWorkspace {
        fn create() -> Self {
            let root = unique_temp_dir("codex-app-plus", "git-repository-workspace");
            let child = root.join("packages/app");
            fs::create_dir_all(&child).expect("create child dir");
            run_git_cmd(&root, &["init"]);
            run_git_cmd(&root, &["config", "user.email", "test@example.com"]);
            run_git_cmd(&root, &["config", "user.name", "Test User"]);
            fs::write(root.join("README.md"), "hello\n").expect("write readme");
            run_git_cmd(&root, &["add", "README.md"]);
            run_git_cmd(&root, &["commit", "-m", "init"]);
            Self { root, child }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    struct RealGitRepo {
        path: PathBuf,
    }

    impl RealGitRepo {
        fn create() -> Self {
            let path = unique_temp_dir("codex-app-plus", "git-repository-root");
            fs::create_dir_all(&path).expect("create temp repo");
            run_git_cmd(&path, &["init"]);
            run_git_cmd(&path, &["config", "user.email", "test@example.com"]);
            run_git_cmd(&path, &["config", "user.name", "Test User"]);
            fs::write(path.join("README.md"), "hello\n").expect("write readme");
            run_git_cmd(&path, &["add", "README.md"]);
            run_git_cmd(&path, &["commit", "-m", "init"]);
            Self { path }
        }
    }

    impl Drop for RealGitRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn run_git_cmd(repo: &Path, args: &[&str]) {
        let output = Command::new(GIT_PROGRAM)
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .expect("run git command");
        assert!(
            output.status.success(),
            "git command failed: {:?} {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn caches_repository_context_and_reuses_entry() {
        let workspace = TestWorkspace::create();
        let cache = RepositoryContextCache::default();
        let repo_path = workspace.child.to_string_lossy().to_string();
        let canonical_root = fs::canonicalize(&workspace.root).expect("canonical root");

        let first = resolve_workspace(&repo_path, &cache).expect("first resolve");
        let second = resolve_workspace(&repo_path, &cache).expect("second resolve");

        assert_eq!(cache.len(), 1);
        assert_eq!(first.repo_root, Some(canonical_root.clone()));
        assert_eq!(second.repo_root, Some(canonical_root));
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

    #[test]
    fn resolves_main_repo_root_for_linked_worktree_path() {
        let repo = RealGitRepo::create();
        let cache = RepositoryContextCache::default();
        let worktree_path = repo.path.join(".worktrees").join("feature-a");
        fs::create_dir_all(worktree_path.parent().expect("worktree parent"))
            .expect("create worktree parent");
        run_git_cmd(
            &repo.path,
            &[
                "worktree",
                "add",
                "-b",
                "feature-a",
                worktree_path.to_string_lossy().as_ref(),
            ],
        );

        let resolved = resolve_workspace(worktree_path.to_string_lossy().as_ref(), &cache)
            .expect("resolve linked worktree");

        assert_eq!(
            resolved.repo_root,
            Some(fs::canonicalize(&worktree_path).expect("canonical worktree root"))
        );
    }
}
