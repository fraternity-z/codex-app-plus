use std::ffi::OsString;
use std::path::Path;
use std::process::Command;

use crate::error::{AppError, AppResult};

const GIT_PROGRAM: &str = "git";
const DEV_NULL_PATH: &str = "/dev/null";
const DIFF_EXIT_CODES: [i32; 2] = [0, 1];
const EMPTY_DIFF_MESSAGE: &str = "当前没有可显示的差异。";
const EMPTY_FILE_MESSAGE: &str = "空文件暂时没有可显示的差异。";
const DIRECTORY_PREVIEW_MESSAGE: &str = "目录变更暂不支持内联预览。";
const BINARY_PREVIEW_MESSAGE: &str = "该文件不是 UTF-8 文本，无法显示预览。";

pub fn get_diff_preview(repo_root: &Path, path: &str, staged: bool) -> AppResult<String> {
    let tracked_diff = run_git(repo_root, &create_tracked_diff_args(path, staged), &DIFF_EXIT_CODES)?;
    if !tracked_diff.is_empty() {
        return Ok(tracked_diff);
    }
    build_fallback_preview(repo_root, path, staged)
}

fn build_fallback_preview(repo_root: &Path, path: &str, staged: bool) -> AppResult<String> {
    let absolute_path = repo_root.join(path);
    if !absolute_path.exists() {
        return Ok(EMPTY_DIFF_MESSAGE.to_string());
    }
    if absolute_path.is_dir() {
        return Ok(DIRECTORY_PREVIEW_MESSAGE.to_string());
    }
    if is_empty_file(&absolute_path)? {
        return Ok(EMPTY_FILE_MESSAGE.to_string());
    }
    if !is_utf8_text_file(&absolute_path) {
        return Ok(BINARY_PREVIEW_MESSAGE.to_string());
    }
    if staged || !is_untracked_path(repo_root, path)? {
        return Ok(EMPTY_DIFF_MESSAGE.to_string());
    }
    let untracked_diff = run_git(repo_root, &create_untracked_diff_args(path), &DIFF_EXIT_CODES)?;
    if untracked_diff.is_empty() {
        return Ok(EMPTY_DIFF_MESSAGE.to_string());
    }
    Ok(untracked_diff)
}

fn create_tracked_diff_args(path: &str, staged: bool) -> Vec<OsString> {
    if staged {
        return vec![
            OsString::from("diff"),
            OsString::from("--cached"),
            OsString::from("--"),
            OsString::from(path),
        ];
    }
    vec![OsString::from("diff"), OsString::from("--"), OsString::from(path)]
}

fn create_untracked_diff_args(path: &str) -> Vec<OsString> {
    vec![
        OsString::from("diff"),
        OsString::from("--no-index"),
        OsString::from("--"),
        OsString::from(DEV_NULL_PATH),
        OsString::from(path),
    ]
}

fn create_untracked_probe_args(path: &str) -> Vec<OsString> {
    vec![
        OsString::from("ls-files"),
        OsString::from("--others"),
        OsString::from("--exclude-standard"),
        OsString::from("--"),
        OsString::from(path),
    ]
}

fn is_empty_file(path: &Path) -> AppResult<bool> {
    Ok(std::fs::metadata(path)?.len() == 0)
}

fn is_utf8_text_file(path: &Path) -> bool {
    std::fs::read_to_string(path).is_ok()
}

fn is_untracked_path(repo_root: &Path, path: &str) -> AppResult<bool> {
    let output = run_git(repo_root, &create_untracked_probe_args(path), &[0])?;
    Ok(!output.is_empty())
}

fn run_git(repo_root: &Path, args: &[OsString], allowed_exit_codes: &[i32]) -> AppResult<String> {
    let output = Command::new(GIT_PROGRAM)
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .map_err(AppError::from)?;
    let exit_code = output.status.code();
    let succeeded = output.status.success()
        || exit_code
            .map(|code| allowed_exit_codes.contains(&code))
            .unwrap_or(false);
    if succeeded {
        return Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    let command = args
        .iter()
        .map(|item| item.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(" ");
    Err(AppError::Protocol(format!("git {command} 执行失败: {detail}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestRepo {
        path: PathBuf,
    }

    impl TestRepo {
        fn create() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("codex-git-diff-test-{suffix}"));
            fs::create_dir_all(&path).expect("create temp repo");
            let output = Command::new(GIT_PROGRAM)
                .arg("init")
                .current_dir(&path)
                .output()
                .expect("git init");
            assert!(output.status.success(), "git init failed: {:?}", output);
            Self { path }
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn returns_unified_diff_for_untracked_text_file() {
        let repo = TestRepo::create();
        fs::write(repo.path.join("notes.txt"), "hello\nworld\n").expect("write file");

        let diff = get_diff_preview(&repo.path, "notes.txt", false).expect("untracked diff");

        assert!(diff.contains("diff --git"));
        assert!(diff.contains("+++ b/notes.txt"));
        assert!(diff.contains("+hello"));
    }

    #[test]
    fn returns_empty_file_message_for_untracked_empty_file() {
        let repo = TestRepo::create();
        fs::write(repo.path.join("empty.txt"), "").expect("write empty file");

        let diff = get_diff_preview(&repo.path, "empty.txt", false).expect("empty diff preview");

        assert_eq!(diff, EMPTY_FILE_MESSAGE);
    }

    #[test]
    fn returns_binary_message_for_untracked_binary_file() {
        let repo = TestRepo::create();
        fs::write(repo.path.join("blob.bin"), [0_u8, 159, 146, 150]).expect("write binary file");

        let diff = get_diff_preview(&repo.path, "blob.bin", false).expect("binary diff preview");

        assert_eq!(diff, BINARY_PREVIEW_MESSAGE);
    }
}
