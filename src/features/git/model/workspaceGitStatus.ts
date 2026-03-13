import type {
  GitBranchRef,
  GitStatusOutput,
  GitStatusSnapshotOutput,
} from "../../../bridge/types";

export function composeGitStatus(
  snapshot: GitStatusSnapshotOutput | null,
  branchRefs: ReadonlyArray<GitBranchRef>,
  branchRefsLoaded: boolean,
  remoteUrl: string | null,
  remoteUrlLoaded: boolean,
): GitStatusOutput | null {
  if (snapshot === null) {
    return null;
  }

  const hasRepository = snapshot.isRepository;

  return {
    isRepository: hasRepository,
    repoRoot: snapshot.repoRoot,
    branch: snapshot.branch,
    remoteName: snapshot.remoteName,
    remoteUrl: hasRepository && remoteUrlLoaded ? remoteUrl : null,
    branches: hasRepository && branchRefsLoaded ? branchRefs : [],
    staged: snapshot.staged,
    unstaged: snapshot.unstaged,
    untracked: snapshot.untracked,
    conflicted: snapshot.conflicted,
    isClean: snapshot.isClean,
  };
}
