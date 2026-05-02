use std::collections::{HashMap, HashSet};
use std::ffi::OsString;
use std::path::Path;

use crate::error::AppResult;

use super::diff::GitDiffPreviewOptions;
use super::models::{
    GitStatusEntry, GitStatusSnapshotOutput, GitWorkspaceDiffOutput, GitWorkspaceDiffScope,
    GitWorkspaceDiffSection,
};
use super::process::run_git_with_exit_codes;
use super::repository::to_args;

const DIFF_EXIT_CODES: [i32; 2] = [0, 1];
const DIFF_METADATA_PREFIXES: [&str; 6] =
    ["+++", "---", "diff --git", "@@", "index ", "\\ No newline"];

#[derive(Clone, Copy, Debug, Default)]
struct DiffStats {
    additions: usize,
    deletions: usize,
}

pub fn load_workspace_diffs(
    repo_root: &Path,
    snapshot: &GitStatusSnapshotOutput,
    scope: GitWorkspaceDiffScope,
    options: GitDiffPreviewOptions,
) -> AppResult<Vec<GitWorkspaceDiffOutput>> {
    let staged_stats = if scope.includes_staged() {
        load_tracked_stats_map(repo_root, &snapshot.staged, true, options)?
    } else {
        HashMap::new()
    };
    let unstaged_entries = collect_unstaged_entries(snapshot, scope);
    let unstaged_stats = if unstaged_entries.is_empty() {
        HashMap::new()
    } else {
        load_tracked_stats_map(repo_root, &unstaged_entries, false, options)?
    };

    let mut items = Vec::new();
    if scope.includes_unstaged() {
        items.extend(build_tracked_items(
            &snapshot.unstaged,
            GitWorkspaceDiffSection::Unstaged,
            false,
            &unstaged_stats,
        ));
        items.extend(build_untracked_items(
            &snapshot.untracked,
            GitWorkspaceDiffSection::Untracked,
        ));
        items.extend(build_tracked_items(
            &snapshot.conflicted,
            GitWorkspaceDiffSection::Conflicted,
            false,
            &unstaged_stats,
        ));
    }
    if scope.includes_staged() {
        items.extend(build_tracked_items(
            &snapshot.staged,
            GitWorkspaceDiffSection::Staged,
            true,
            &staged_stats,
        ));
    }
    Ok(items)
}

fn collect_unstaged_entries(
    snapshot: &GitStatusSnapshotOutput,
    scope: GitWorkspaceDiffScope,
) -> Vec<GitStatusEntry> {
    if !scope.includes_unstaged() {
        return Vec::new();
    }
    let mut entries = snapshot.unstaged.clone();
    entries.extend(snapshot.conflicted.clone());
    entries
}

fn build_tracked_items(
    entries: &[GitStatusEntry],
    section: GitWorkspaceDiffSection,
    staged: bool,
    stats_map: &HashMap<String, DiffStats>,
) -> Vec<GitWorkspaceDiffOutput> {
    entries
        .iter()
        .map(|entry| {
            build_output(
                entry,
                section,
                staged,
                String::new(),
                false,
                stats_map.get(&entry.path).copied().unwrap_or_default(),
            )
        })
        .collect()
}

fn build_untracked_items(
    entries: &[GitStatusEntry],
    section: GitWorkspaceDiffSection,
) -> Vec<GitWorkspaceDiffOutput> {
    entries
        .iter()
        .map(|entry| {
            build_output(
                entry,
                section,
                false,
                String::new(),
                false,
                DiffStats::default(),
            )
        })
        .collect()
}

fn build_output(
    entry: &GitStatusEntry,
    section: GitWorkspaceDiffSection,
    staged: bool,
    diff: String,
    diff_loaded: bool,
    stats: DiffStats,
) -> GitWorkspaceDiffOutput {
    GitWorkspaceDiffOutput {
        path: entry.path.clone(),
        display_path: entry.path.clone(),
        original_path: entry.original_path.clone(),
        status: resolve_status(entry, staged).to_string(),
        staged,
        section,
        diff,
        diff_loaded,
        additions: stats.additions,
        deletions: stats.deletions,
    }
}

fn resolve_status(entry: &GitStatusEntry, staged: bool) -> &str {
    if staged {
        &entry.index_status
    } else {
        &entry.worktree_status
    }
}

fn load_tracked_stats_map(
    repo_root: &Path,
    entries: &[GitStatusEntry],
    staged: bool,
    options: GitDiffPreviewOptions,
) -> AppResult<HashMap<String, DiffStats>> {
    let paths = unique_paths(entries);
    if paths.is_empty() {
        return Ok(HashMap::new());
    }
    let output = run_git_with_exit_codes(
        repo_root,
        &create_batch_numstat_args(&paths, staged, options),
        &DIFF_EXIT_CODES,
    )?;
    Ok(parse_numstat_output(&output))
}

fn unique_paths(entries: &[GitStatusEntry]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for entry in entries {
        if seen.insert(entry.path.clone()) {
            paths.push(entry.path.clone());
        }
    }
    paths
}

fn create_batch_numstat_args(
    paths: &[String],
    staged: bool,
    options: GitDiffPreviewOptions,
) -> Vec<OsString> {
    let mut args = to_args(&[
        "diff",
        "--numstat",
        "--find-renames",
        "--no-ext-diff",
        "--no-color",
    ]);
    if staged {
        args.push(OsString::from("--cached"));
    }
    if options.ignore_whitespace_changes {
        args.push(OsString::from("--ignore-space-change"));
    }
    args.push(OsString::from("--"));
    args.extend(paths.iter().map(OsString::from));
    args
}

fn parse_numstat_output(output: &str) -> HashMap<String, DiffStats> {
    let mut map = HashMap::new();
    for line in output.lines() {
        let mut parts = line.splitn(3, '\t');
        let additions = parse_numstat_count(parts.next());
        let deletions = parse_numstat_count(parts.next());
        let Some(path) = parts.next() else {
            continue;
        };
        map.insert(
            normalize_numstat_path(path),
            DiffStats {
                additions,
                deletions,
            },
        );
    }
    map
}

fn parse_numstat_count(value: Option<&str>) -> usize {
    value
        .and_then(|text| text.parse::<usize>().ok())
        .unwrap_or_default()
}

fn normalize_numstat_path(path: &str) -> String {
    if let Some((prefix, rest)) = path.split_once('{') {
        if let Some((_, renamed_to)) = rest.rsplit_once(" => ") {
            return format!("{prefix}{}", renamed_to.replace('}', ""));
        }
    }
    path.to_string()
}

fn split_diff_by_file(output: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut current_path: Option<String> = None;
    let mut current_lines: Vec<&str> = Vec::new();
    for line in output.lines() {
        if line.starts_with("diff --git ") {
            insert_chunk(&mut map, &current_path, &current_lines);
            current_path = parse_diff_header_path(line);
            current_lines.clear();
        }
        current_lines.push(line);
    }
    insert_chunk(&mut map, &current_path, &current_lines);
    map
}

fn insert_chunk(map: &mut HashMap<String, String>, path: &Option<String>, lines: &[&str]) {
    if let Some(path) = path {
        map.insert(path.clone(), lines.join("\n"));
    }
}

fn parse_diff_header_path(line: &str) -> Option<String> {
    let rest = line.strip_prefix("diff --git ")?;
    let (_, new_path) = rest.split_once(" b/")?;
    Some(new_path.to_string())
}

fn count_diff_stats(diff: &str) -> (usize, usize) {
    let mut additions = 0;
    let mut deletions = 0;
    for line in diff.lines() {
        if line.is_empty()
            || DIFF_METADATA_PREFIXES
                .iter()
                .any(|prefix| line.starts_with(prefix))
        {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
            continue;
        }
        if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions)
}

#[cfg(test)]
mod tests {
    use super::{count_diff_stats, parse_numstat_output, split_diff_by_file};

    #[test]
    fn splits_combined_git_diff_output_by_path() {
        let output = [
            "diff --git a/src/a.ts b/src/a.ts",
            "@@ -1 +1 @@",
            "-a",
            "+b",
            "diff --git a/src/b.ts b/src/b.ts",
            "@@ -1 +1 @@",
            "-c",
            "+d",
        ]
        .join("\n");

        let chunks = split_diff_by_file(&output);

        assert_eq!(chunks.len(), 2);
        assert!(chunks.contains_key("src/a.ts"));
        assert!(chunks.contains_key("src/b.ts"));
    }

    #[test]
    fn counts_additions_and_deletions_without_metadata() {
        let diff = [
            "diff --git a/src/a.ts b/src/a.ts",
            "--- a/src/a.ts",
            "+++ b/src/a.ts",
            "@@ -1 +1 @@",
            "-const oldValue = 1;",
            "+const newValue = 2;",
        ]
        .join("\n");

        assert_eq!(count_diff_stats(&diff), (1, 1));
    }

    #[test]
    fn parses_numstat_output_by_path() {
        let stats = parse_numstat_output("2\t1\tsrc/App.tsx\n-\t-\tassets/logo.png\n");

        assert_eq!(stats["src/App.tsx"].additions, 2);
        assert_eq!(stats["src/App.tsx"].deletions, 1);
        assert_eq!(stats["assets/logo.png"].additions, 0);
        assert_eq!(stats["assets/logo.png"].deletions, 0);
    }

    #[test]
    fn normalizes_numstat_braced_rename_to_new_path() {
        let stats = parse_numstat_output("0\t0\tsrc/{OldName.ts => NewName.ts}\n");

        assert!(stats.contains_key("src/NewName.ts"));
    }
}
