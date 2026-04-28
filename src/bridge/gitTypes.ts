import type { AgentEnvironment } from "./sharedTypes";

export interface GitRepoInput {
  readonly repoPath: string;
}

export interface GitPathsInput extends GitRepoInput {
  readonly paths: ReadonlyArray<string>;
}

export interface GitDiscardInput extends GitPathsInput {
  readonly deleteUntracked: boolean;
}

export interface GitDiffInput extends GitRepoInput {
  readonly path: string;
  readonly staged: boolean;
}

export type GitWorkspaceDiffScope = "unstaged" | "staged" | "all";

export interface GitWorkspaceDiffsInput extends GitRepoInput {
  readonly scope: GitWorkspaceDiffScope;
  readonly ignoreWhitespaceChanges?: boolean;
}

export interface GitCommitInput extends GitRepoInput {
  readonly message: string;
}

export interface GitGenerateCommitMessageInput extends GitRepoInput {
  readonly instructions?: string;
  readonly agentEnvironment?: AgentEnvironment;
}

export interface GitGenerateCommitMessageOutput {
  readonly message: string;
}

export interface GitPushInput extends GitRepoInput {
  readonly forceWithLease?: boolean;
}

export interface GitCheckoutInput extends GitRepoInput {
  readonly branchName: string;
  readonly create: boolean;
}

export interface GitDeleteBranchInput extends GitRepoInput {
  readonly branchName: string;
  readonly force?: boolean;
}

export interface GitRemoteInput extends GitRepoInput {
  readonly remoteName: string;
}

export interface GitBranchSummary {
  readonly head: string | null;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly detached: boolean;
}

export interface GitBranchRef {
  readonly name: string;
  readonly upstream: string | null;
  readonly isCurrent: boolean;
}

export interface GitStatusEntry {
  readonly path: string;
  readonly originalPath: string | null;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
}

export interface GitStatusSnapshotOutput {
  readonly isRepository: boolean;
  readonly repoRoot: string | null;
  readonly branch: GitBranchSummary | null;
  readonly remoteName: string | null;
  readonly staged: ReadonlyArray<GitStatusEntry>;
  readonly unstaged: ReadonlyArray<GitStatusEntry>;
  readonly untracked: ReadonlyArray<GitStatusEntry>;
  readonly conflicted: ReadonlyArray<GitStatusEntry>;
  readonly isClean: boolean;
}

export interface GitStatusOutput extends GitStatusSnapshotOutput {
  readonly remoteUrl: string | null;
  readonly branches: ReadonlyArray<GitBranchRef>;
}

export interface GitDiffOutput {
  readonly path: string;
  readonly staged: boolean;
  readonly diff: string;
}

export type GitWorkspaceDiffSection = "unstaged" | "staged" | "untracked" | "conflicted";

export interface GitWorkspaceDiffOutput {
  readonly path: string;
  readonly displayPath: string;
  readonly originalPath: string | null;
  readonly status: string;
  readonly staged: boolean;
  readonly section: GitWorkspaceDiffSection;
  readonly diff: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface GitWorktreeEntry {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string | null;
  readonly isCurrent: boolean;
  readonly isLocked: boolean;
  readonly prunable: boolean;
}

export interface GitWorktreeAddInput extends GitRepoInput {
  readonly branchName?: string;
  readonly name?: string;
}

export interface GitWorktreeRemoveInput extends GitRepoInput {
  readonly worktreePath: string;
  readonly force?: boolean;
}

