use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

use super::diff::get_diff_preview;
use super::models::{
    GitBranchRef, GitCheckoutInput, GitCommitInput, GitDeleteBranchInput, GitDiffInput,
    GitDiffOutput, GitDiscardInput, GitPathsInput, GitPushInput, GitRemoteInput, GitRepoInput,
    GitStatusSnapshotOutput, GitWorkspaceDiffOutput, GitWorkspaceDiffsInput, GitWorktreeAddInput,
    GitWorktreeEntry, GitWorktreeRemoveInput,
};
use super::parse::{parse_branch_refs, parse_status_output};
use super::process::{has_head, run_git};
use super::repository::{
    require_repository_context, resolve_workspace, to_args, validate_paths, validate_pathspec,
};
use super::runtime::RepositoryContextCache;
use super::sync::{run_fetch, run_pull, run_push};
use super::workspace_diffs::load_workspace_diffs;

const STATUS_ARGS: [&str; 4] = [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
];
const BRANCH_ARGS: [&str; 3] = [
    "branch",
    "--list",
    "--format=%(refname:short)%09%(upstream:short)%09%(HEAD)",
];
const INIT_ARGS: [&str; 1] = ["init"];
const WORKTREE_LIST_ARGS: [&str; 4] = ["worktree", "list", "--porcelain", "-z"];

pub fn get_status_snapshot_for_repo_root(repo_root: &Path) -> AppResult<GitStatusSnapshotOutput> {
    let status_output = run_git(repo_root, &to_args(&STATUS_ARGS))?;
    let parsed_status = parse_status_output(&status_output)?;

    Ok(GitStatusSnapshotOutput {
        is_repository: true,
        repo_root: Some(repo_root.to_string_lossy().to_string()),
        branch: Some(parsed_status.branch.clone()),
        remote_name: resolve_remote_name(&parsed_status.branch),
        staged: parsed_status.staged.clone(),
        unstaged: parsed_status.unstaged.clone(),
        untracked: parsed_status.untracked.clone(),
        conflicted: parsed_status.conflicted.clone(),
        is_clean: is_clean_snapshot(&parsed_status),
    })
}

pub fn get_branch_refs(
    input: GitRepoInput,
    cache: &RepositoryContextCache,
) -> AppResult<Vec<GitBranchRef>> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let branch_output = run_git(&context.repo_root, &to_args(&BRANCH_ARGS))?;
    parse_branch_refs(&branch_output)
}

pub fn get_remote_url(
    input: GitRemoteInput,
    cache: &RepositoryContextCache,
) -> AppResult<Option<String>> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let remote_name = validate_remote_name(&input.remote_name)?;
    let args = create_remote_url_args(&remote_name);
    run_git(&context.repo_root, &args).map(Some)
}

pub fn get_diff(input: GitDiffInput, cache: &RepositoryContextCache) -> AppResult<GitDiffOutput> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let path = validate_pathspec(&input.path)?;
    Ok(GitDiffOutput {
        path: path.clone(),
        staged: input.staged,
        diff: get_diff_preview(&context.repo_root, &path, input.staged)?,
    })
}

pub fn get_workspace_diffs(
    input: GitWorkspaceDiffsInput,
    cache: &RepositoryContextCache,
) -> AppResult<Vec<GitWorkspaceDiffOutput>> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let snapshot = get_status_snapshot_for_repo_root(&context.repo_root)?;
    load_workspace_diffs(
        &context.repo_root,
        &snapshot,
        input.scope,
        super::diff::GitDiffPreviewOptions {
            ignore_whitespace_changes: input.ignore_whitespace_changes.unwrap_or(false),
        },
    )
}

pub fn get_worktrees(
    input: GitRepoInput,
    cache: &RepositoryContextCache,
) -> AppResult<Vec<GitWorktreeEntry>> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let output = run_git(&context.repo_root, &to_args(&WORKTREE_LIST_ARGS))?;
    parse_worktree_list_output(&output)
}

pub fn add_worktree(
    input: GitWorktreeAddInput,
    cache: &RepositoryContextCache,
) -> AppResult<GitWorktreeEntry> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let branch_name = input.branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::InvalidInput("分支名称不能为空。".to_string()));
    }

    let safe_name = sanitize_worktree_name(input.name.as_deref().unwrap_or(branch_name));
    if safe_name.is_empty() {
        return Err(AppError::InvalidInput("工作树目录名称不能为空。".to_string()));
    }

    let worktree_path = unique_worktree_path(&context.repo_root, &safe_name);
    let worktree_path_text = worktree_path.to_string_lossy().to_string();

    let branch_exists = local_branch_exists(&context.repo_root, branch_name)?;
    let args = if branch_exists {
        vec![
            OsString::from("worktree"),
            OsString::from("add"),
            OsString::from(&worktree_path_text),
            OsString::from(branch_name),
        ]
    } else {
        vec![
            OsString::from("worktree"),
            OsString::from("add"),
            OsString::from("-b"),
            OsString::from(branch_name),
            OsString::from(&worktree_path_text),
        ]
    };
    run_git(&context.repo_root, &args)?;

    let mut created = parse_worktree_list_output(&run_git(&context.repo_root, &to_args(&WORKTREE_LIST_ARGS))?)?
        .into_iter()
        .find(|entry| same_path_text(&entry.path, &worktree_path_text));
    if let Some(entry) = created.take() {
        return Ok(entry);
    }

    Ok(GitWorktreeEntry {
        path: worktree_path_text,
        branch: Some(branch_name.to_string()),
        head: None,
        is_current: false,
        is_locked: false,
        prunable: false,
    })
}

pub fn remove_worktree(
    input: GitWorktreeRemoveInput,
    cache: &RepositoryContextCache,
) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let worktree_path = input.worktree_path.trim();
    if worktree_path.is_empty() {
        return Err(AppError::InvalidInput("worktreePath 不能为空。".to_string()));
    }

    let worktree = PathBuf::from(worktree_path);
    if same_canonical_path(&context.repo_root, &worktree)? {
        return Err(AppError::InvalidInput("不能删除主工作目录。".to_string()));
    }

    let mut args = vec![OsString::from("worktree"), OsString::from("remove")];
    if input.force.unwrap_or(false) {
        args.push(OsString::from("--force"));
    }
    args.push(OsString::from(worktree_path));
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn init_repository(input: GitRepoInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let resolved = resolve_workspace(&input.repo_path, cache)?;
    if resolved.repo_root.is_some() {
        return Err(AppError::InvalidInput(
            "当前工作区已经是 Git 仓库。".to_string(),
        ));
    }
    run_git(&resolved.workspace_path, &to_args(&INIT_ARGS)).map(|_| ())
}

pub fn stage_paths(input: GitPathsInput, cache: &RepositoryContextCache) -> AppResult<()> {
    run_path_command(&input.repo_path, cache, &["add", "--"], &input.paths)
}

pub fn unstage_paths(input: GitPathsInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let paths = validate_paths(&input.paths)?;
    let args = if has_head(&context.repo_root)? {
        extend_args(&["reset", "HEAD", "--"], paths)
    } else {
        extend_args(&["rm", "--cached", "-r", "--"], paths)
    };
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn discard_paths(input: GitDiscardInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let prefix_args = if input.delete_untracked {
        &["clean", "-f", "--"][..]
    } else {
        &["restore", "--worktree", "--"][..]
    };
    let args = extend_args(prefix_args, validate_paths(&input.paths)?);
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn commit(input: GitCommitInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let message = input.message.trim();
    if message.is_empty() {
        return Err(AppError::InvalidInput("提交说明不能为空。".to_string()));
    }
    let args = vec![
        OsString::from("commit"),
        OsString::from("-m"),
        OsString::from(message),
    ];
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn fetch(input: GitRepoInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let snapshot = get_status_snapshot_for_repo_root(&context.repo_root)?;
    let upstream = snapshot.branch.as_ref().and_then(|branch| branch.upstream.as_deref());
    run_fetch(&context.repo_root, upstream)
}

pub fn pull(input: GitRepoInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    run_pull(&context.repo_root)
}

pub fn push(input: GitPushInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let snapshot = get_status_snapshot_for_repo_root(&context.repo_root)?;
    let upstream = snapshot.branch.as_ref().and_then(|branch| branch.upstream.as_deref());
    run_push(
        &context.repo_root,
        upstream,
        input.force_with_lease.unwrap_or(false),
    )
}

pub fn checkout(input: GitCheckoutInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let branch_name = input.branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::InvalidInput("分支名称不能为空。".to_string()));
    }
    let args = if input.create {
        vec![
            OsString::from("checkout"),
            OsString::from("-b"),
            OsString::from(branch_name),
        ]
    } else {
        vec![OsString::from("checkout"), OsString::from(branch_name)]
    };
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn delete_branch(input: GitDeleteBranchInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let branch_name = input.branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::InvalidInput("分支名称不能为空。".to_string()));
    }
    let snapshot = get_status_snapshot_for_repo_root(&context.repo_root)?;
    if snapshot
        .branch
        .as_ref()
        .and_then(|branch| branch.head.as_deref())
        == Some(branch_name)
    {
        return Err(AppError::InvalidInput("不能删除当前检出的分支。".to_string()));
    }
    let delete_flag = if input.force.unwrap_or(false) { "-D" } else { "-d" };
    let args = vec![
        OsString::from("branch"),
        OsString::from(delete_flag),
        OsString::from(branch_name),
    ];
    run_git(&context.repo_root, &args).map(|_| ())
}

fn run_path_command(
    repo_path: &str,
    cache: &RepositoryContextCache,
    prefix_args: &[&str],
    paths: &[String],
) -> AppResult<()> {
    let context = require_repository_context(repo_path, cache)?;
    let args = extend_args(prefix_args, validate_paths(paths)?);
    run_git(&context.repo_root, &args).map(|_| ())
}

fn extend_args(prefix_args: &[&str], paths: Vec<OsString>) -> Vec<OsString> {
    let mut args = to_args(prefix_args);
    args.extend(paths);
    args
}

fn parse_worktree_list_output(output: &str) -> AppResult<Vec<GitWorktreeEntry>> {
    let mut entries = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut current_head: Option<String> = None;
    let mut current_is_current = false;
    let mut current_is_locked = false;
    let mut current_prunable = false;

    for field in output.split('\0').filter(|value| !value.is_empty()) {
        if let Some(path) = field.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                entries.push(GitWorktreeEntry {
                    path,
                    branch: current_branch.take(),
                    head: current_head.take(),
                    is_current: current_is_current,
                    is_locked: current_is_locked,
                    prunable: current_prunable,
                });
            }
            current_path = Some(path.to_string());
            current_branch = None;
            current_head = None;
            current_is_current = false;
            current_is_locked = false;
            current_prunable = false;
            continue;
        }
        if let Some(head) = field.strip_prefix("HEAD ") {
            current_head = Some(head.to_string());
            continue;
        }
        if let Some(branch) = field.strip_prefix("branch ") {
            current_branch = Some(branch.rsplit('/').next().unwrap_or(branch).to_string());
            continue;
        }
        if field == "current" {
            current_is_current = true;
            continue;
        }
        if field.starts_with("locked") {
            current_is_locked = true;
            continue;
        }
        if field.starts_with("prunable") {
            current_prunable = true;
            continue;
        }
    }

    if let Some(path) = current_path.take() {
        entries.push(GitWorktreeEntry {
            path,
            branch: current_branch,
            head: current_head,
            is_current: current_is_current,
            is_locked: current_is_locked,
            prunable: current_prunable,
        });
    }

    Ok(entries)
}

fn sanitize_worktree_name(name: &str) -> String {
    name.trim()
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-")
        .replace(' ', "-")
        .trim_matches('-')
        .to_string()
}

fn unique_worktree_path(repo_root: &Path, name: &str) -> PathBuf {
    let root_name = repo_root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("repo");
    let worktree_root = std::env::temp_dir().join(format!("codex-app-plus-worktrees-{root_name}"));
    let _ = std::fs::create_dir_all(&worktree_root);
    let mut candidate = worktree_root.join(name);
    let mut index = 1;
    while candidate.exists() {
        candidate = worktree_root.join(format!("{name}-{index}"));
        index += 1;
    }
    candidate
}

fn local_branch_exists(repo_root: &Path, branch_name: &str) -> AppResult<bool> {
    let args = vec![
        OsString::from("branch"),
        OsString::from("--list"),
        OsString::from(branch_name),
    ];
    let output = run_git(repo_root, &args)?;
    Ok(output.lines().any(|line| !line.trim().is_empty()))
}

fn same_canonical_path(left: &Path, right: &Path) -> AppResult<bool> {
    let left = std::fs::canonicalize(left)?;
    let right = std::fs::canonicalize(right)?;
    Ok(left == right)
}

fn same_path_text(left: &str, right: &str) -> bool {
    left.replace('\\', "/").eq_ignore_ascii_case(&right.replace('\\', "/"))
}

fn is_clean_snapshot(parsed_status: &super::parse::ParsedGitStatus) -> bool {
    parsed_status.staged.is_empty()
        && parsed_status.unstaged.is_empty()
        && parsed_status.untracked.is_empty()
        && parsed_status.conflicted.is_empty()
}

fn resolve_remote_name(branch: &super::models::GitBranchSummary) -> Option<String> {
    branch
        .upstream
        .as_deref()
        .and_then(extract_remote_name)
        .map(str::to_string)
}

fn validate_remote_name(remote_name: &str) -> AppResult<String> {
    let trimmed = remote_name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("remoteName 不能为空。".to_string()));
    }
    Ok(trimmed.to_string())
}

fn create_remote_url_args(remote_name: &str) -> Vec<OsString> {
    vec![
        OsString::from("remote"),
        OsString::from("get-url"),
        OsString::from(remote_name),
    ]
}

fn extract_remote_name(upstream: &str) -> Option<&str> {
    upstream.split_once('/').map(|(name, _)| name)
}

#[cfg(test)]
mod tests {
    use super::{
        add_worktree, extract_remote_name, get_worktrees, remove_worktree, same_path_text,
        GitRepoInput, GitWorktreeAddInput, GitWorktreeRemoveInput,
    };
    use crate::git::runtime::RepositoryContextCache;
    use crate::test_support::unique_temp_dir;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    const GIT_PROGRAM: &str = "git";

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn create() -> Self {
            let path = unique_temp_dir("codex-app-plus", "git-worktree-service");
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

    impl Drop for TestRepo {
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
    fn extracts_remote_name_from_upstream() {
        assert_eq!(extract_remote_name("origin/main"), Some("origin"));
        assert_eq!(extract_remote_name("fork/feature/test"), Some("fork"));
        assert_eq!(extract_remote_name("main"), None);
    }

    #[test]
    fn lists_and_removes_created_worktree() {
        let repo = TestRepo::create();
        let cache = RepositoryContextCache::default();
        let repo_path = repo.path.to_string_lossy().to_string();

        let created = add_worktree(
            GitWorktreeAddInput {
                repo_path: repo_path.clone(),
                branch_name: "feature/worktree-test".to_string(),
                name: None,
            },
            &cache,
        )
        .expect("create worktree");

        let listed = get_worktrees(
            GitRepoInput {
                repo_path: repo_path.clone(),
            },
            &cache,
        )
        .expect("list worktrees");
        assert!(listed.iter().any(|entry| same_path_text(&entry.path, &created.path)));

        remove_worktree(
            GitWorktreeRemoveInput {
                repo_path,
                worktree_path: created.path.clone(),
                force: Some(true),
            },
            &cache,
        )
        .expect("remove worktree");

        let listed_again = get_worktrees(
            GitRepoInput {
                repo_path: repo.path.to_string_lossy().to_string(),
            },
            &cache,
        )
        .expect("list worktrees again");
        assert!(!listed_again.iter().any(|entry| same_path_text(&entry.path, &created.path)));
    }
}
