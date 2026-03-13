import { useEffect, useMemo } from "react";
import { parseUnifiedDiff } from "./diffPreviewModel";
import { getVisibleGitChangeSections, type GitChangeScope, type GitChangeSectionData } from "./GitChangeBrowser";
import { createGitDiffKey } from "./gitDiffKey";
import type { WorkspaceGitController } from "./types";

export interface WorkspaceDiffSummary {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly pending: boolean;
}

const EMPTY_SUMMARY: WorkspaceDiffSummary = Object.freeze({
  files: 0,
  additions: 0,
  deletions: 0,
  pending: false
});

function getVisibleSections(controller: WorkspaceGitController, scope: GitChangeScope): ReadonlyArray<GitChangeSectionData> {
  return getVisibleGitChangeSections(controller, scope).filter((section) => section.entries.length > 0);
}

function getSummary(controller: WorkspaceGitController, sections: ReadonlyArray<GitChangeSectionData>, enabled: boolean): WorkspaceDiffSummary {
  if (!enabled || sections.length === 0) {
    return EMPTY_SUMMARY;
  }

  let files = 0;
  let additions = 0;
  let deletions = 0;
  let pending = false;
  for (const section of sections) {
    for (const { entry } of section.entries) {
      files += 1;
      const diffKey = createGitDiffKey(entry.path, section.staged);
      const diff = controller.diffCache[diffKey];
      if (diff === undefined) {
        pending = true;
        continue;
      }
      const parsedDiff = parseUnifiedDiff(diff.diff);
      additions += parsedDiff.additions;
      deletions += parsedDiff.deletions;
      pending ||= controller.loadingDiffKeys.includes(diffKey) || controller.staleDiffKeys.includes(diffKey);
    }
  }

  return { files, additions, deletions, pending };
}

function shouldLoadDiff(controller: WorkspaceGitController, diffKey: string): boolean {
  const hasCachedDiff = controller.diffCache[diffKey] !== undefined;
  if (!hasCachedDiff) {
    return !controller.loadingDiffKeys.includes(diffKey);
  }
  return controller.staleDiffKeys.includes(diffKey) && !controller.loadingDiffKeys.includes(diffKey);
}

function getNextDiffTarget(
  controller: WorkspaceGitController,
  sections: ReadonlyArray<GitChangeSectionData>,
  enabled: boolean,
): { readonly path: string; readonly staged: boolean } | null {
  if (!enabled) {
    return null;
  }

  for (const section of sections) {
    for (const { entry } of section.entries) {
      const diffKey = createGitDiffKey(entry.path, section.staged);
      if (shouldLoadDiff(controller, diffKey)) {
        return { path: entry.path, staged: section.staged };
      }
    }
  }

  return null;
}

export function useWorkspaceDiffData(controller: WorkspaceGitController, scope: GitChangeScope, enabled: boolean) {
  const sections = useMemo(() => getVisibleSections(controller, scope), [controller.status, scope]);
  const nextDiffTarget = useMemo(
    () => getNextDiffTarget(controller, sections, enabled),
    [controller.diffCache, controller.loadingDiffKeys, controller.staleDiffKeys, enabled, sections],
  );

  useEffect(() => {
    if (nextDiffTarget === null) {
      return;
    }
    void controller.ensureDiff(nextDiffTarget.path, nextDiffTarget.staged);
  }, [controller.ensureDiff, nextDiffTarget]);

  const summary = useMemo(
    () => getSummary(controller, sections, enabled),
    [controller.diffCache, controller.loadingDiffKeys, controller.staleDiffKeys, controller.status, enabled, sections]
  );

  return { sections, summary };
}
