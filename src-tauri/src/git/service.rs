use std::ffi::OsString;
use std::path::Path;

use crate::error::{AppError, AppResult};

use super::diff::get_diff_preview;
use super::models::{
    GitBranchRef, GitCheckoutInput, GitCommitInput, GitDiffInput, GitDiffOutput, GitDiscardInput,
    GitPathsInput, GitPushInput, GitRemoteInput, GitRepoInput, GitStatusSnapshotOutput,
    GitWorkspaceDiffOutput, GitWorkspaceDiffsInput,
};
use super::parse::{parse_branch_refs, parse_status_output};
use super::process::{has_head, run_git};
use super::repository::{
    require_repository_context, resolve_workspace, to_args, validate_paths, validate_pathspec,
};
use super::runtime::RepositoryContextCache;
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
const FETCH_ARGS: [&str; 3] = ["fetch", "--all", "--prune"];
const PULL_ARGS: [&str; 1] = ["pull"];
const PUSH_ARGS: [&str; 1] = ["push"];
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

pub fn init_repository(
    input: GitRepoInput,
    cache: &RepositoryContextCache,
) -> AppResult<()> {
    let resolved = resolve_workspace(&input.repo_path, cache)?;
    if resolved.repo_root.is_some() {
        return Err(AppError::InvalidInput(
            "当前工作区已经是 Git 仓库。".to_string(),
        ));
    }
    run_git(&resolved.workspace_path, &to_args(&INIT_ARGS)).map(|_| ())
}

pub fn stage_paths(input: GitPathsInput, cache: &RepositoryContextCache) -> AppResult<()> {
    run_path_command(&input.repo_path, &cache, &["add", "--"], &input.paths)
}

pub fn unstage_paths(input: GitPathsInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let paths = validate_paths(&input.paths)?;
    let args = if has_head(&context.repo_root) {
        extend_args(&["reset", "HEAD", "--"], paths)
    } else {
        extend_args(&["rm", "--cached", "-r", "--"], paths)
    };
    run_git(&context.repo_root, &args).map(|_| ())
}

pub fn discard_paths(
    input: GitDiscardInput,
    cache: &RepositoryContextCache,
) -> AppResult<()> {
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
    run_repo_command(&input.repo_path, cache, &FETCH_ARGS)
}

pub fn pull(input: GitRepoInput, cache: &RepositoryContextCache) -> AppResult<()> {
    run_repo_command(&input.repo_path, cache, &PULL_ARGS)
}

pub fn push(input: GitPushInput, cache: &RepositoryContextCache) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let args = create_push_args(input.force_with_lease.unwrap_or(false));
    run_git(&context.repo_root, &args).map(|_| ())
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

fn run_repo_command(
    repo_path: &str,
    cache: &RepositoryContextCache,
    args: &[&str],
) -> AppResult<()> {
    let context = require_repository_context(repo_path, cache)?;
    run_git(&context.repo_root, &to_args(args)).map(|_| ())
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

fn create_push_args(force_with_lease: bool) -> Vec<OsString> {
    let mut args = to_args(&PUSH_ARGS);
    if force_with_lease {
        args.push(OsString::from("--force-with-lease"));
    }
    args
}

fn extract_remote_name(upstream: &str) -> Option<&str> {
    upstream.split_once('/').map(|(name, _)| name)
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;

    use super::{create_push_args, extract_remote_name};

    #[test]
    fn extracts_remote_name_from_upstream() {
        assert_eq!(extract_remote_name("origin/main"), Some("origin"));
        assert_eq!(extract_remote_name("fork/feature/test"), Some("fork"));
        assert_eq!(extract_remote_name("main"), None);
    }

    #[test]
    fn creates_push_args_with_force_with_lease() {
        let args = create_push_args(true);

        assert_eq!(args.len(), 2);
        assert_eq!(args[0], OsString::from("push"));
        assert_eq!(args[1], OsString::from("--force-with-lease"));
    }
}
