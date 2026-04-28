use serde::{Deserialize, Serialize};

use crate::models::AgentEnvironment;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInput {
    pub repo_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPathsInput {
    pub repo_path: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiscardInput {
    pub repo_path: String,
    pub paths: Vec<String>,
    pub delete_untracked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffInput {
    pub repo_path: String,
    pub path: String,
    pub staged: bool,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum GitWorkspaceDiffScope {
    Unstaged,
    Staged,
    All,
}

impl GitWorkspaceDiffScope {
    pub fn includes_staged(self) -> bool {
        matches!(self, Self::Staged | Self::All)
    }

    pub fn includes_unstaged(self) -> bool {
        matches!(self, Self::Unstaged | Self::All)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspaceDiffsInput {
    pub repo_path: String,
    pub scope: GitWorkspaceDiffScope,
    pub ignore_whitespace_changes: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInput {
    pub repo_path: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGenerateCommitMessageInput {
    pub repo_path: String,
    pub instructions: Option<String>,
    pub agent_environment: Option<AgentEnvironment>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGenerateCommitMessageOutput {
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushInput {
    pub repo_path: String,
    pub force_with_lease: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCheckoutInput {
    pub repo_path: String,
    pub branch_name: String,
    pub create: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDeleteBranchInput {
    pub repo_path: String,
    pub branch_name: String,
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteInput {
    pub repo_path: String,
    pub remote_name: String,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchSummary {
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub detached: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchRef {
    pub name: String,
    pub upstream: Option<String>,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSnapshotOutput {
    pub is_repository: bool,
    pub repo_root: Option<String>,
    pub branch: Option<GitBranchSummary>,
    pub remote_name: Option<String>,
    pub staged: Vec<GitStatusEntry>,
    pub unstaged: Vec<GitStatusEntry>,
    pub untracked: Vec<GitStatusEntry>,
    pub conflicted: Vec<GitStatusEntry>,
    pub is_clean: bool,
}

impl GitStatusSnapshotOutput {
    pub fn not_repository() -> Self {
        Self {
            is_repository: false,
            repo_root: None,
            branch: None,
            remote_name: None,
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            conflicted: Vec::new(),
            is_clean: true,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffOutput {
    pub path: String,
    pub staged: bool,
    pub diff: String,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum GitWorkspaceDiffSection {
    Unstaged,
    Staged,
    Untracked,
    Conflicted,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspaceDiffOutput {
    pub path: String,
    pub display_path: String,
    pub original_path: Option<String>,
    pub status: String,
    pub staged: bool,
    pub section: GitWorkspaceDiffSection,
    pub diff: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeAddInput {
    pub repo_path: String,
    pub branch_name: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeRemoveInput {
    pub repo_path: String,
    pub worktree_path: String,
    pub force: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeEntry {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub is_current: bool,
    pub is_locked: bool,
    pub prunable: bool,
}
