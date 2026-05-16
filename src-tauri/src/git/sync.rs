use std::ffi::OsString;
use std::path::Path;

use crate::error::{AppError, AppResult};

use super::process::run_git;
use super::repository::to_args;

const FETCH_ALL_ARGS: [&str; 3] = ["fetch", "--all", "--prune"];
const PULL_ARGS: [&str; 2] = ["pull", "--autostash"];
const PULL_FALLBACK_ARGS: [&str; 1] = ["pull"];
const PULL_MERGE_ARGS: [&str; 3] = ["pull", "--no-rebase", "--autostash"];
const PULL_MERGE_FALLBACK_ARGS: [&str; 2] = ["pull", "--no-rebase"];
const PUSH_ARGS: [&str; 1] = ["push"];
const FETCH_ARGS: [&str; 2] = ["fetch", "--prune"];

pub(super) fn run_fetch(repo_root: &Path, upstream: Option<&str>) -> AppResult<()> {
    let args = build_fetch_args(upstream);
    run_git(repo_root, &args).map(|_| ())
}

pub(super) fn run_pull(repo_root: &Path) -> AppResult<()> {
    match run_git(repo_root, &to_args(&PULL_ARGS)) {
        Ok(_) => Ok(()),
        Err(error) => retry_pull(repo_root, error.to_string()),
    }
}

pub(super) fn run_push(
    repo_root: &Path,
    upstream: Option<&str>,
    force_with_lease: bool,
) -> AppResult<()> {
    if let Some((remote_name, _)) = split_upstream(upstream) {
        let _ = run_fetch(repo_root, Some(remote_name));
    }

    let args = build_push_args(upstream, force_with_lease);
    run_git(repo_root, &args).map(|_| ())
}

fn retry_pull(repo_root: &Path, error_text: String) -> AppResult<()> {
    let lowered = error_text.to_lowercase();
    if autostash_unsupported(&lowered) {
        return retry_without_autostash(repo_root);
    }
    if pull_needs_reconcile_strategy(&lowered) {
        return retry_with_merge_strategy(repo_root);
    }
    Err(AppError::Protocol(error_text))
}

fn retry_without_autostash(repo_root: &Path) -> AppResult<()> {
    match run_git(repo_root, &to_args(&PULL_FALLBACK_ARGS)) {
        Ok(_) => Ok(()),
        Err(error) => {
            if pull_needs_reconcile_strategy(&error.to_string().to_lowercase()) {
                run_git(repo_root, &to_args(&PULL_MERGE_FALLBACK_ARGS)).map(|_| ())
            } else {
                Err(error)
            }
        }
    }
}

fn retry_with_merge_strategy(repo_root: &Path) -> AppResult<()> {
    match run_git(repo_root, &to_args(&PULL_MERGE_ARGS)) {
        Ok(_) => Ok(()),
        Err(error) => {
            if autostash_unsupported(&error.to_string().to_lowercase()) {
                run_git(repo_root, &to_args(&PULL_MERGE_FALLBACK_ARGS)).map(|_| ())
            } else {
                Err(error)
            }
        }
    }
}

fn build_fetch_args(upstream: Option<&str>) -> Vec<OsString> {
    let Some((remote_name, _)) = split_upstream(upstream) else {
        return to_args(&FETCH_ALL_ARGS);
    };

    let mut args = to_args(&FETCH_ARGS);
    args.push(OsString::from(remote_name));
    args
}

fn build_push_args(upstream: Option<&str>, force_with_lease: bool) -> Vec<OsString> {
    let mut args = to_args(&PUSH_ARGS);
    if force_with_lease {
        args.push(OsString::from("--force-with-lease"));
    }

    let Some((remote_name, branch_name)) = split_upstream(upstream) else {
        return args;
    };

    args.push(OsString::from(remote_name));
    args.push(OsString::from(format!("HEAD:{branch_name}")));
    args
}

fn split_upstream(upstream: Option<&str>) -> Option<(&str, &str)> {
    let upstream = upstream?;
    let (remote_name, branch_name) = upstream.split_once('/')?;
    if remote_name.is_empty() || branch_name.is_empty() {
        return None;
    }
    Some((remote_name, branch_name))
}

fn autostash_unsupported(error_text: &str) -> bool {
    let lowered = error_text.to_lowercase();
    lowered.contains("unknown option") && lowered.contains("autostash")
}

fn pull_needs_reconcile_strategy(error_text: &str) -> bool {
    let lowered = error_text.to_lowercase();
    lowered.contains("need to specify how to reconcile divergent branches")
        || lowered.contains("you have divergent branches")
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;

    use super::{
        autostash_unsupported, build_fetch_args, build_push_args, pull_needs_reconcile_strategy,
        split_upstream,
    };

    #[test]
    fn parses_upstream_remote_and_branch() {
        assert_eq!(
            split_upstream(Some("origin/main")),
            Some(("origin", "main"))
        );
        assert_eq!(
            split_upstream(Some("fork/feature/login")),
            Some(("fork", "feature/login"))
        );
        assert_eq!(split_upstream(Some("main")), None);
        assert_eq!(split_upstream(None), None);
    }

    #[test]
    fn builds_fetch_args_for_upstream_remote() {
        let args = build_fetch_args(Some("origin/main"));

        assert_eq!(
            args,
            vec![
                OsString::from("fetch"),
                OsString::from("--prune"),
                OsString::from("origin")
            ]
        );
    }

    #[test]
    fn builds_push_args_for_upstream_branch_and_force_with_lease() {
        let args = build_push_args(Some("origin/main"), true);

        assert_eq!(
            args,
            vec![
                OsString::from("push"),
                OsString::from("--force-with-lease"),
                OsString::from("origin"),
                OsString::from("HEAD:main")
            ]
        );
    }

    #[test]
    fn falls_back_to_plain_push_without_upstream() {
        let args = build_push_args(None, false);

        assert_eq!(args, vec![OsString::from("push")]);
    }

    #[test]
    fn detects_pull_reconcile_errors() {
        assert!(pull_needs_reconcile_strategy(
            "fatal: Need to specify how to reconcile divergent branches"
        ));
        assert!(autostash_unsupported("error: unknown option `autostash'"));
    }
}
