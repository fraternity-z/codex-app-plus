import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GitStatusOutput,
  GitWorkspaceDiffOutput,
  HostBridge,
} from "../../../bridge/types";
import { createGitDiffKey } from "../model/gitDiffKey";
import type { GitChangeScope } from "../ui/GitChangeBrowser";

export interface WorkspaceDiffViewerSummary {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

interface UseWorkspaceDiffViewerOptions {
  readonly enabled: boolean;
  readonly hostBridge: HostBridge;
  readonly repoPath: string | null;
  readonly scope: GitChangeScope;
  readonly status: GitStatusOutput | null;
  readonly ignoreWhitespaceChanges?: boolean;
}

function shouldStartLoading(
  enabled: boolean,
  repoPath: string | null,
  status: GitStatusOutput | null,
): boolean {
  return enabled && repoPath !== null && status !== null && status.isRepository;
}

function createStatusSignature(status: GitStatusOutput | null): string {
  if (status === null || !status.isRepository) {
    return "";
  }
  return [
    ...status.staged.map((entry) => `s:${entry.path}:${entry.indexStatus}:${entry.worktreeStatus}`),
    ...status.unstaged.map((entry) => `u:${entry.path}:${entry.indexStatus}:${entry.worktreeStatus}`),
    ...status.untracked.map((entry) => `n:${entry.path}`),
    ...status.conflicted.map((entry) => `c:${entry.path}:${entry.indexStatus}:${entry.worktreeStatus}`),
  ].join("|");
}

function calculateSummary(items: ReadonlyArray<GitWorkspaceDiffOutput>): WorkspaceDiffViewerSummary {
  return items.reduce(
    (summary, item) => ({
      files: summary.files + 1,
      additions: summary.additions + item.additions,
      deletions: summary.deletions + item.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

function countDiffStats(diff: string): Pick<WorkspaceDiffViewerSummary, "additions" | "deletions"> {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (
      line.length === 0 ||
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff --git") ||
      line.startsWith("@@") ||
      line.startsWith("index ") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

function isSameDiffItem(left: GitWorkspaceDiffOutput, right: GitWorkspaceDiffOutput): boolean {
  return left.path === right.path && left.staged === right.staged;
}

function isDiffLoaded(item: GitWorkspaceDiffOutput): boolean {
  return item.diffLoaded === true || item.diff.length > 0;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useWorkspaceDiffViewer(options: UseWorkspaceDiffViewerOptions) {
  const { enabled, hostBridge, ignoreWhitespaceChanges = false, repoPath, scope, status } = options;
  const [items, setItems] = useState<ReadonlyArray<GitWorkspaceDiffOutput>>([]);
  const [loading, setLoading] = useState(() => shouldStartLoading(enabled, repoPath, status));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadingDiffKeysRef = useRef(new Set<string>());
  const statusSignature = useMemo(() => createStatusSignature(status), [status]);

  const refresh = useCallback(async () => {
    if (!enabled || repoPath === null || status === null || !status.isRepository) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingDiffKeysRef.current.clear();
    setLoading(true);
    setError(null);
    try {
      const nextItems = await hostBridge.git.getWorkspaceDiffs({
        repoPath,
        scope,
        ignoreWhitespaceChanges,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setItems(nextItems);
    } catch (reason) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setItems([]);
      setError(String(reason));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, hostBridge.git, ignoreWhitespaceChanges, repoPath, scope, status]);

  const loadDiff = useCallback(async (item: GitWorkspaceDiffOutput) => {
    if (!enabled || repoPath === null || isDiffLoaded(item)) {
      return;
    }
    const diffKey = createGitDiffKey(item.path, item.staged);
    if (loadingDiffKeysRef.current.has(diffKey)) {
      return;
    }
    loadingDiffKeysRef.current.add(diffKey);
    const listRequestId = requestIdRef.current;
    setItems((currentItems) => currentItems.map((currentItem) => {
      if (!isSameDiffItem(currentItem, item)) {
        return currentItem;
      }
      return {
        ...currentItem,
        diffLoading: true,
        diffError: null,
      };
    }));

    try {
      const output = await hostBridge.git.getDiff({
        repoPath,
        path: item.path,
        staged: item.staged,
        ignoreWhitespaceChanges,
      });
      const stats = countDiffStats(output.diff);
      if (listRequestId !== requestIdRef.current) {
        return;
      }
      setItems((currentItems) => currentItems.map((currentItem) => {
        if (!isSameDiffItem(currentItem, item)) {
          return currentItem;
        }
        return {
          ...currentItem,
          diff: output.diff,
          diffLoaded: true,
          diffLoading: false,
          diffError: null,
          additions: stats.additions,
          deletions: stats.deletions,
        };
      }));
    } catch (reason) {
      if (listRequestId !== requestIdRef.current) {
        return;
      }
      setItems((currentItems) => currentItems.map((currentItem) => {
        if (!isSameDiffItem(currentItem, item)) {
          return currentItem;
        }
        return {
          ...currentItem,
          diffLoading: false,
          diffError: toErrorMessage(reason),
        };
      }));
    } finally {
      loadingDiffKeysRef.current.delete(diffKey);
    }
  }, [enabled, hostBridge.git, ignoreWhitespaceChanges, repoPath]);

  useEffect(() => {
    void refresh();
  }, [refresh, statusSignature]);

  const summary = useMemo(() => calculateSummary(items), [items]);

  return {
    items,
    summary,
    loading,
    error,
    refresh,
    loadDiff,
  };
}
