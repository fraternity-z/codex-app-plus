import type { GitDiffOutput, GitStatusOutput } from "../../../bridge/types";

export interface GitNotice {
  readonly kind: "error" | "success";
  readonly text: string;
}

export type GitCommitFollowUp = "commit" | "push";

export interface GitCommitOptions {
  readonly includeUnstaged: boolean;
  readonly followUp: GitCommitFollowUp;
}

export interface WorkspaceGitController {
  readonly loading: boolean;
  readonly pendingAction: string | null;
  readonly status: GitStatusOutput | null;
  readonly statusLoaded: boolean;
  readonly hasRepository: boolean;
  readonly error: string | null;
  readonly notice: GitNotice | null;
  readonly commitDialogOpen: boolean;
  readonly commitDialogError: string | null;
  readonly branchRefsLoading?: boolean;
  readonly branchRefsLoaded?: boolean;
  readonly remoteUrlLoading?: boolean;
  readonly remoteUrlLoaded?: boolean;
  readonly commitMessage: string;
  readonly commitInstructions: string;
  readonly selectedBranch: string;
  readonly newBranchName: string;
  readonly diff: GitDiffOutput | null;
  readonly diffCache: Readonly<Record<string, GitDiffOutput>>;
  readonly diffTarget: { readonly path: string; readonly staged: boolean } | null;
  readonly loadingDiffKeys: ReadonlyArray<string>;
  readonly staleDiffKeys: ReadonlyArray<string>;
  readonly refresh: () => Promise<void>;
  readonly initRepository: () => Promise<void>;
  readonly fetch: () => Promise<void>;
  readonly pull: () => Promise<void>;
  readonly push: () => Promise<void>;
  readonly stagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly unstagePaths: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly discardPaths: (paths: ReadonlyArray<string>, deleteUntracked: boolean) => Promise<void>;
  readonly commit: (options?: GitCommitOptions) => Promise<void>;
  readonly openCommitDialog: () => void;
  readonly closeCommitDialog: () => void;
  readonly checkoutBranch: (branchName: string) => Promise<boolean>;
  readonly deleteBranch: (branchName: string, force?: boolean) => Promise<boolean>;
  readonly createBranchFromName: (branchName: string) => Promise<boolean>;
  readonly checkoutSelectedBranch: () => Promise<boolean>;
  readonly createBranch: () => Promise<boolean>;
  readonly ensureBranchRefs?: () => Promise<void>;
  readonly ensureRemoteUrl?: () => Promise<void>;
  readonly ensureDiff: (path: string, staged: boolean) => Promise<void>;
  readonly selectDiff: (path: string, staged: boolean) => Promise<void>;
  readonly clearDiff: () => void;
  readonly setCommitMessage: (message: string) => void;
  readonly setSelectedBranch: (branchName: string) => void;
  readonly setNewBranchName: (branchName: string) => void;
}
