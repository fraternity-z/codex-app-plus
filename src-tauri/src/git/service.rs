use std::ffi::OsString;
use std::path::Path;

use crate::error::{AppError, AppResult};

use super::diff::{get_diff_preview_with_options, GitDiffPreviewOptions};
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
use super::worktree;

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
    let options = GitDiffPreviewOptions {
        ignore_whitespace_changes: input.ignore_whitespace_changes.unwrap_or(false),
    };
    Ok(GitDiffOutput {
        path: path.clone(),
        staged: input.staged,
        diff: get_diff_preview_with_options(&context.repo_root, &path, input.staged, options)?,
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
    worktree::get_worktrees(input, cache)
}

pub fn add_worktree(
    input: GitWorktreeAddInput,
    cache: &RepositoryContextCache,
) -> AppResult<GitWorktreeEntry> {
    worktree::add_worktree(input, cache)
}

pub fn remove_worktree(
    input: GitWorktreeRemoveInput,
    cache: &RepositoryContextCache,
) -> AppResult<()> {
    worktree::remove_worktree(input, cache)
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
    let upstream = snapshot
        .branch
        .as_ref()
        .and_then(|branch| branch.upstream.as_deref());
    run_fetch(&context.repo_root, upstream)
}

pub fn pull(input: GitRepoInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    run_pull(&context.repo_root)
}

pub fn push(input: GitPushInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let snapshot = get_status_snapshot_for_repo_root(&context.repo_root)?;
    let upstream = snapshot
        .branch
        .as_ref()
        .and_then(|branch| branch.upstream.as_deref());
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
        return Err(AppError::InvalidInput(
            "不能删除当前检出的分支。".to_string(),
        ));
    }
    let delete_flag = if input.force.unwrap_or(false) {
        "-D"
    } else {
        "-d"
    };
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
        extract_remote_name, get_status_snapshot_for_repo_root, get_workspace_diffs, stage_paths,
    };
    use crate::git::models::{GitPathsInput, GitWorkspaceDiffScope, GitWorkspaceDiffsInput};
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
        fn create(name: &str) -> Self {
            let path = unique_temp_dir("codex-app-plus", name);
            fs::create_dir_all(&path).expect("create temp repo");
            run_git_cmd(&path, &["init"]);
            run_git_cmd(&path, &["config", "user.email", "test@example.com"]);
            run_git_cmd(&path, &["config", "user.name", "Test User"]);
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
    fn keeps_unicode_paths_usable_for_diff_and_stage_operations() {
        let repo = TestRepo::create("git-service-unicode-中文");
        let tracked_path = "中文文件.txt";
        let untracked_path = "子目录/新文件.txt";
        let repo_path = repo.path.to_string_lossy().to_string();
        let cache = RepositoryContextCache::default();

        fs::write(repo.path.join(tracked_path), "hello\n").expect("write tracked file");
        run_git_cmd(&repo.path, &["add", "--", tracked_path]);
        run_git_cmd(&repo.path, &["commit", "-m", "init"]);
        fs::write(repo.path.join(tracked_path), "hello\nworld\n").expect("modify tracked file");
        fs::create_dir_all(repo.path.join("子目录")).expect("create nested dir");
        fs::write(repo.path.join(untracked_path), "new\n").expect("write untracked file");

        let snapshot =
            get_status_snapshot_for_repo_root(&repo.path).expect("load unicode status snapshot");

        assert_eq!(snapshot.unstaged[0].path, tracked_path);
        assert_eq!(snapshot.untracked[0].path, untracked_path);

        let diffs = get_workspace_diffs(
            GitWorkspaceDiffsInput {
                repo_path: repo_path.clone(),
                scope: GitWorkspaceDiffScope::Unstaged,
                ignore_whitespace_changes: None,
            },
            &cache,
        )
        .expect("load unicode workspace diffs");

        assert!(diffs.iter().any(|item| item.path == tracked_path));
        assert!(diffs.iter().any(|item| item.path == untracked_path));

        let paths = snapshot
            .unstaged
            .iter()
            .chain(snapshot.untracked.iter())
            .map(|entry| entry.path.clone())
            .collect::<Vec<_>>();

        stage_paths(GitPathsInput { repo_path, paths }, &cache)
            .expect("stage unicode paths from status snapshot");
    }
}
