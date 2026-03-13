export function createGitDiffKey(path: string, staged: boolean): string {
  return `${staged ? "staged" : "unstaged"}:${path}`;
}
