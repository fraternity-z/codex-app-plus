import type { GitStatusEntry } from "../../../bridge/types";
import { GitChangeSection } from "./GitChangeSection";
import type { WorkspaceGitController } from "../model/types";

export type GitChangeScope = "all" | "unstaged" | "staged";
export type GitChangeSectionMode = Exclude<GitChangeScope, "all">;
export type GitChangeEntryMode = "unstaged" | "staged" | "untracked";

export interface GitChangeScopeOption {
  readonly scope: GitChangeScope;
  readonly label: string;
  readonly count: number;
}

export interface GitChangeEntryData {
  readonly entry: GitStatusEntry;
  readonly mode: GitChangeEntryMode;
}

export interface GitChangeSectionData {
  readonly label: string;
  readonly mode: GitChangeSectionMode;
  readonly staged: boolean;
  readonly entries: ReadonlyArray<GitChangeEntryData>;
}

interface GitChangeBrowserProps {
  readonly controller: WorkspaceGitController;
  readonly busy: boolean;
  readonly selectedDiffKey: string | null;
  readonly scope: GitChangeScope;
}

const CHANGE_SECTIONS = [
  { label: "未暂存", mode: "unstaged", staged: false },
  { label: "已暂存", mode: "staged", staged: true }
] as const;

function createEntries(entries: ReadonlyArray<GitStatusEntry>, mode: GitChangeEntryMode): ReadonlyArray<GitChangeEntryData> {
  return entries.map((entry) => ({ entry, mode }));
}

function getEntries(controller: WorkspaceGitController, mode: GitChangeSectionMode): ReadonlyArray<GitChangeEntryData> {
  const status = controller.status;
  if (status === null) {
    return [];
  }
  if (mode === "staged") {
    return createEntries(status.staged, "staged");
  }
  return [
    ...createEntries(status.unstaged, "unstaged"),
    ...createEntries(status.untracked, "untracked"),
    ...createEntries(status.conflicted, "unstaged")
  ];
}

function getVisibleSections(scope: GitChangeScope) {
  if (scope === "all") {
    return CHANGE_SECTIONS;
  }
  return CHANGE_SECTIONS.filter((section) => section.mode === scope);
}

export function getVisibleGitChangeSections(controller: WorkspaceGitController, scope: GitChangeScope): ReadonlyArray<GitChangeSectionData> {
  return getVisibleSections(scope).map((section) => ({
    label: section.label,
    mode: section.mode,
    staged: section.staged,
    entries: getEntries(controller, section.mode)
  }));
}

export function getGitChangeScopeOptions(controller: WorkspaceGitController): ReadonlyArray<GitChangeScopeOption> {
  const status = controller.status;
  if (status === null) {
    return [];
  }
  const unstagedCount = status.unstaged.length + status.untracked.length + status.conflicted.length;
  return [
    {
      scope: "all",
      label: "全部变更",
      count: status.staged.length + unstagedCount
    },
    {
      scope: "unstaged",
      label: "未暂存",
      count: unstagedCount
    },
    {
      scope: "staged",
      label: "已暂存",
      count: status.staged.length
    }
  ];
}

export function getDefaultGitChangeScope(controller: WorkspaceGitController): GitChangeScope {
  const options = getGitChangeScopeOptions(controller);
  const preferred = options.find((option) => option.scope !== "all" && option.count > 0);
  return preferred?.scope ?? "unstaged";
}

export function GitChangeBrowser(props: GitChangeBrowserProps): JSX.Element | null {
  if (props.controller.status === null) {
    return null;
  }

  return (
    <>
      {getVisibleSections(props.scope).map((section) => (
        <GitChangeSection
          key={section.mode}
          title={section.label}
          mode={section.mode}
          entries={getEntries(props.controller, section.mode).map((item) => item.entry)}
          busy={props.busy}
          selectedDiffKey={props.selectedDiffKey}
          onSelectDiff={props.controller.selectDiff}
          onStage={props.controller.stagePaths}
          onUnstage={props.controller.unstagePaths}
          onDiscard={props.controller.discardPaths}
        />
      ))}
    </>
  );
}
