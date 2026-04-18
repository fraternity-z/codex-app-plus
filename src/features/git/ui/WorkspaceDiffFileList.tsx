import { useMemo } from "react";
import type { GitWorkspaceDiffOutput, GitWorkspaceDiffSection } from "../../../bridge/types";
import { createGitDiffKey } from "../model/gitDiffKey";

interface WorkspaceDiffFileListProps {
  readonly items: ReadonlyArray<GitWorkspaceDiffOutput>;
  readonly selectedDiffPath: string | null;
  readonly onSelect: (path: string) => void;
  readonly showSectionLabel: boolean;
}

const SECTION_LABELS: Readonly<Record<GitWorkspaceDiffSection, string>> = Object.freeze({
  unstaged: "未暂存",
  staged: "已暂存",
  untracked: "未跟踪",
  conflicted: "冲突",
});

function getItemTitle(item: GitWorkspaceDiffOutput): string {
  return item.originalPath === null ? item.displayPath : `${item.originalPath} → ${item.displayPath}`;
}

function getStatusLabel(item: GitWorkspaceDiffOutput): string {
  const status = item.status.trim();
  return status.length > 0 ? status : "变更";
}

interface SectionGroup {
  readonly section: GitWorkspaceDiffSection;
  readonly items: ReadonlyArray<GitWorkspaceDiffOutput>;
}

function groupItemsBySection(items: ReadonlyArray<GitWorkspaceDiffOutput>): ReadonlyArray<SectionGroup> {
  const order: Array<GitWorkspaceDiffSection> = ["conflicted", "staged", "unstaged", "untracked"];
  const buckets = new Map<GitWorkspaceDiffSection, GitWorkspaceDiffOutput[]>();
  for (const item of items) {
    const bucket = buckets.get(item.section) ?? [];
    bucket.push(item);
    buckets.set(item.section, bucket);
  }
  const groups: SectionGroup[] = [];
  for (const section of order) {
    const list = buckets.get(section);
    if (list === undefined || list.length === 0) {
      continue;
    }
    groups.push({ section, items: list });
  }
  return groups;
}

export function WorkspaceDiffFileList(props: WorkspaceDiffFileListProps): JSX.Element {
  const groups = useMemo(() => groupItemsBySection(props.items), [props.items]);
  if (props.items.length === 0) {
    return (
      <div className="workspace-diff-empty-state">
        <h3 className="workspace-diff-empty-title">当前分组没有可展示的差异</h3>
        <p className="workspace-diff-empty-body">修改文件后会在这里显示变更文件列表。</p>
      </div>
    );
  }
  return (
    <div className="workspace-diff-file-list">
      {groups.map((group) => (
        <section key={group.section} className="workspace-diff-section-group">
          {props.showSectionLabel ? (
            <h3 className="workspace-diff-section-title">{SECTION_LABELS[group.section]}</h3>
          ) : null}
          <ul className="workspace-diff-compact-list">
            {group.items.map((item) => {
              const key = createGitDiffKey(item.path, item.staged);
              const title = getItemTitle(item);
              const isActive = props.selectedDiffPath === item.path;
              const activeClass = isActive ? " workspace-diff-compact-row-active" : "";
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`workspace-diff-compact-row${activeClass}`}
                    aria-pressed={isActive}
                    title={title}
                    onClick={() => props.onSelect(item.path)}
                  >
                    <span className="workspace-diff-compact-status">{getStatusLabel(item)}</span>
                    <span className="workspace-diff-compact-title">{title}</span>
                    <span
                      className="workspace-diff-compact-summary"
                      aria-label={`新增 ${item.additions} 行，删除 ${item.deletions} 行`}
                    >
                      <span className="workspace-diff-file-summary-add">+{item.additions}</span>
                      <span className="workspace-diff-file-summary-delete">-{item.deletions}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
