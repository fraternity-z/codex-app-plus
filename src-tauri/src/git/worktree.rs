use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

use super::models::{GitRepoInput, GitWorktreeAddInput, GitWorktreeEntry, GitWorktreeRemoveInput};
use super::process::{has_head, rev_parse, run_git};
use super::repository::{require_repository_context, to_args};
use super::runtime::RepositoryContextCache;

const APP_DIRECTORY: &str = "CodexAppPlus";
const WORKTREE_DIRECTORY: &str = "worktrees";
const WORKTREE_LIST_ARGS: [&str; 4] = ["worktree", "list", "--porcelain", "-z"];

pub(super) fn get_worktrees(
    input: GitRepoInput,
    cache: &RepositoryContextCache,
) -> AppResult<Vec<GitWorktreeEntry>> {
    let context = require_repository_context(&input.repo_path, cache)?;
    list_worktrees(&context.repo_root)
}

pub(super) fn add_worktree(
    input: GitWorktreeAddInput,
    cache: &RepositoryContextCache,
) -> AppResult<GitWorktreeEntry> {
    let context = require_repository_context(&input.repo_path, cache)?;
    if !has_head(&context.repo_root)? {
        return Err(AppError::InvalidInput(
            "当前仓库还没有提交，无法从 HEAD 创建工作树。".to_string(),
        ));
    }

    let branch_name = normalize_branch_name(input.branch_name.as_deref());
    let worktree_name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(branch_name)
        .unwrap_or("worktree");
    let safe_name = sanitize_worktree_name(worktree_name);
    let worktree_path = unique_worktree_path(&context.repo_root, &safe_name)?;
    let worktree_path_text = worktree_path.to_string_lossy().to_string();

    let args = create_worktree_add_args(&context.repo_root, &worktree_path_text, branch_name)?;
    run_git(&context.repo_root, &args)?;

    let mut created = list_worktrees(&context.repo_root)?
        .into_iter()
        .find(|entry| same_path_text(&entry.path, &worktree_path_text));
    if let Some(entry) = created.take() {
        return Ok(entry);
    }

    Ok(GitWorktreeEntry {
        path: worktree_path_text,
        branch: branch_name
            .filter(|name| *name != "HEAD")
            .map(str::to_string),
        head: None,
        is_current: false,
        is_locked: false,
        prunable: false,
    })
}

pub(super) fn remove_worktree(
    input: GitWorktreeRemoveInput,
    cache: &RepositoryContextCache,
) -> AppResult<()> {
    let context = require_repository_context(&input.repo_path, cache)?;
    let worktree_path = input.worktree_path.trim();
    if worktree_path.is_empty() {
        return Err(AppError::InvalidInput(
            "worktreePath 不能为空。".to_string(),
        ));
    }

    let worktree = PathBuf::from(worktree_path);
    let worktree_top_level = canonicalize_worktree_path(&worktree)?;
    let worktrees = list_worktrees(&context.repo_root)?;
    if is_main_worktree(&worktrees, &worktree_top_level)? {
        return Err(AppError::InvalidInput("不能删除主工作目录。".to_string()));
    }

    let mut args = vec![OsString::from("worktree"), OsString::from("remove")];
    if input.force.unwrap_or(false) {
        args.push(OsString::from("--force"));
    }
    args.push(OsString::from(worktree_path));
    run_git(&context.repo_root, &args).map(|_| ())
}

fn list_worktrees(repo_root: &Path) -> AppResult<Vec<GitWorktreeEntry>> {
    let output = run_git(repo_root, &to_args(&WORKTREE_LIST_ARGS))?;
    parse_worktree_list_output(&output)
}

fn create_worktree_add_args(
    repo_root: &Path,
    worktree_path: &str,
    branch_name: Option<&str>,
) -> AppResult<Vec<OsString>> {
    match branch_name {
        None | Some("HEAD") => Ok(vec![
            OsString::from("worktree"),
            OsString::from("add"),
            OsString::from("--detach"),
            OsString::from(worktree_path),
            OsString::from("HEAD"),
        ]),
        Some(branch_name) if local_branch_exists(repo_root, branch_name)? => Ok(vec![
            OsString::from("worktree"),
            OsString::from("add"),
            OsString::from(worktree_path),
            OsString::from(branch_name),
        ]),
        Some(branch_name) => Ok(vec![
            OsString::from("worktree"),
            OsString::from("add"),
            OsString::from("-b"),
            OsString::from(branch_name),
            OsString::from(worktree_path),
            OsString::from("HEAD"),
        ]),
    }
}

fn normalize_branch_name(branch_name: Option<&str>) -> Option<&str> {
    branch_name.map(str::trim).filter(|value| !value.is_empty())
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
            current_branch = Some(display_branch_name(branch));
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

fn display_branch_name(branch: &str) -> String {
    branch
        .strip_prefix("refs/heads/")
        .unwrap_or(branch)
        .to_string()
}

fn sanitize_worktree_name(name: &str) -> String {
    let mut sanitized = String::new();
    let mut last_was_separator = false;

    for character in name.trim().chars() {
        let should_replace = character.is_control()
            || character.is_whitespace()
            || matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            );
        if should_replace {
            if !last_was_separator && !sanitized.is_empty() {
                sanitized.push('-');
                last_was_separator = true;
            }
            continue;
        }

        sanitized.push(character);
        last_was_separator = false;
    }

    let sanitized = sanitized.trim_matches(&['-', '.'][..]).to_string();
    if sanitized.is_empty() {
        return "worktree".to_string();
    }
    if is_reserved_windows_name(&sanitized) {
        return format!("{sanitized}-worktree");
    }
    sanitized
}

fn is_reserved_windows_name(name: &str) -> bool {
    let device_name = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    matches!(
        device_name.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn unique_worktree_path(repo_root: &Path, name: &str) -> AppResult<PathBuf> {
    let worktree_root = managed_worktree_root(repo_root)?;
    std::fs::create_dir_all(&worktree_root)?;
    let mut candidate = worktree_root.join(name);
    let mut index = 1;
    while candidate.exists() {
        candidate = worktree_root.join(format!("{name}-{index}"));
        index += 1;
    }
    Ok(candidate)
}

fn managed_worktree_root(repo_root: &Path) -> AppResult<PathBuf> {
    let data_dir = dirs::data_local_dir().ok_or_else(|| {
        AppError::Protocol("无法定位本机应用数据目录，不能创建稳定工作树。".to_string())
    })?;
    let canonical_repo =
        std::fs::canonicalize(repo_root).unwrap_or_else(|_| repo_root.to_path_buf());
    let repo_name = canonical_repo
        .file_name()
        .and_then(|value| value.to_str())
        .map(sanitize_worktree_name)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "repo".to_string());
    let repo_key = canonical_repo
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let repo_hash = stable_path_hash(&repo_key);
    Ok(data_dir
        .join(APP_DIRECTORY)
        .join(WORKTREE_DIRECTORY)
        .join(format!("{repo_name}-{repo_hash}")))
}

fn stable_path_hash(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
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

fn canonicalize_worktree_path(worktree_path: &Path) -> AppResult<PathBuf> {
    let top_level = rev_parse(worktree_path, "--show-toplevel")?;
    std::fs::canonicalize(top_level).map_err(AppError::from)
}

fn is_main_worktree(worktrees: &[GitWorktreeEntry], worktree_path: &Path) -> AppResult<bool> {
    let Some(main_entry) = worktrees.first() else {
        return Ok(false);
    };
    let main_worktree = std::fs::canonicalize(&main_entry.path)?;
    Ok(main_worktree == worktree_path)
}

fn same_path_text(left: &str, right: &str) -> bool {
    left.replace('\\', "/")
        .eq_ignore_ascii_case(&right.replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::{
        add_worktree, get_worktrees, managed_worktree_root, parse_worktree_list_output,
        remove_worktree, same_path_text, sanitize_worktree_name, stable_path_hash, APP_DIRECTORY,
        WORKTREE_DIRECTORY,
    };
    use crate::git::models::{GitRepoInput, GitWorktreeAddInput, GitWorktreeRemoveInput};
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

    fn run_git_output(repo: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn creates_detached_stable_worktree_from_head() {
        let repo = TestRepo::create();
        let cache = RepositoryContextCache::default();
        let repo_path = repo.path.to_string_lossy().to_string();

        let created = add_worktree(
            GitWorktreeAddInput {
                repo_path: repo_path.clone(),
                branch_name: None,
                name: Some("Project Copy".to_string()),
            },
            &cache,
        )
        .expect("create worktree");

        assert!(PathBuf::from(&created.path).exists());
        assert_eq!(created.branch, None);
        assert_eq!(
            run_git_output(Path::new(&created.path), &["branch", "--show-current"]),
            ""
        );

        remove_worktree(
            GitWorktreeRemoveInput {
                repo_path,
                worktree_path: created.path,
                force: Some(true),
            },
            &cache,
        )
        .expect("remove worktree");
    }

    #[test]
    fn lists_and_removes_created_branch_worktree() {
        let repo = TestRepo::create();
        let cache = RepositoryContextCache::default();
        let repo_path = repo.path.to_string_lossy().to_string();

        let created = add_worktree(
            GitWorktreeAddInput {
                repo_path: repo_path.clone(),
                branch_name: Some("feature/worktree-test".to_string()),
                name: None,
            },
            &cache,
        )
        .expect("create worktree");

        assert_eq!(created.branch.as_deref(), Some("feature/worktree-test"));
        let listed = get_worktrees(
            GitRepoInput {
                repo_path: repo_path.clone(),
            },
            &cache,
        )
        .expect("list worktrees");
        assert!(listed
            .iter()
            .any(|entry| same_path_text(&entry.path, &created.path)));

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
        assert!(!listed_again
            .iter()
            .any(|entry| same_path_text(&entry.path, &created.path)));
    }

    #[test]
    fn linked_worktree_path_no_longer_triggers_main_worktree_guard() {
        let repo = TestRepo::create();
        let cache = RepositoryContextCache::default();
        let repo_path = repo.path.to_string_lossy().to_string();

        let created = add_worktree(
            GitWorktreeAddInput {
                repo_path: repo_path.clone(),
                branch_name: Some("feature/worktree-linked-remove".to_string()),
                name: Some("feature-linked-remove".to_string()),
            },
            &cache,
        )
        .expect("create worktree");

        let result = remove_worktree(
            GitWorktreeRemoveInput {
                repo_path: created.path.clone(),
                worktree_path: created.path.clone(),
                force: Some(true),
            },
            &cache,
        );

        if let Err(error) = result {
            assert!(
                !error.to_string().contains("不能删除主工作目录"),
                "unexpected main worktree guard: {error}"
            );
        }
    }

    #[test]
    fn rejects_removing_main_worktree() {
        let repo = TestRepo::create();
        let cache = RepositoryContextCache::default();

        let error = remove_worktree(
            GitWorktreeRemoveInput {
                repo_path: repo.path.to_string_lossy().to_string(),
                worktree_path: repo.path.to_string_lossy().to_string(),
                force: Some(true),
            },
            &cache,
        )
        .expect_err("expected main worktree protection");

        assert!(error.to_string().contains("不能删除主工作目录"));
    }

    #[test]
    fn preserves_full_branch_path_when_parsing_worktree_list() {
        let output = concat!(
            "worktree E:/repo\0",
            "HEAD abc123\0",
            "branch refs/heads/main\0",
            "worktree E:/repo-feature\0",
            "HEAD def456\0",
            "branch refs/heads/feature/worktree-test\0",
        );

        let parsed = parse_worktree_list_output(output).expect("parse worktrees");

        assert_eq!(parsed[0].branch.as_deref(), Some("main"));
        assert_eq!(parsed[1].branch.as_deref(), Some("feature/worktree-test"));
    }

    #[test]
    fn creates_stable_paths_under_app_data() {
        let repo = TestRepo::create();
        let root = managed_worktree_root(&repo.path).expect("managed root");

        assert_eq!(
            root.parent()
                .and_then(|path| path.file_name())
                .and_then(|value| value.to_str()),
            Some(WORKTREE_DIRECTORY)
        );
        assert!(root.to_string_lossy().contains(APP_DIRECTORY));
        assert!(!root.starts_with(std::env::temp_dir()));
    }

    #[test]
    fn sanitizes_worktree_names_for_windows_paths() {
        assert_eq!(sanitize_worktree_name(" feature / copy "), "feature-copy");
        assert_eq!(sanitize_worktree_name("..."), "worktree");
        assert_eq!(sanitize_worktree_name("CON"), "CON-worktree");
    }

    #[test]
    fn stable_hash_is_repeatable() {
        assert_eq!(stable_path_hash("E:/repo"), stable_path_hash("E:/repo"));
        assert_ne!(stable_path_hash("E:/repo"), stable_path_hash("E:/other"));
    }
}
