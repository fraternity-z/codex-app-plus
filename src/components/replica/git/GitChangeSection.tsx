import { confirm } from "@tauri-apps/plugin-dialog";
import type { GitStatusEntry } from "../../../bridge/types";

const STATUS_LABELS = {
  A: "新增",
  C: "复制",
  D: "删除",
  M: "修改",
  R: "重命名",
  U: "冲突",
  "?": "未跟踪"
} as const;

type SectionMode = "conflicted" | "staged" | "unstaged" | "untracked";

interface GitChangeSectionProps {
  readonly title: string;
  readonly mode: SectionMode;
  readonly entries: ReadonlyArray<GitStatusEntry>;
  readonly busy: boolean;
  readonly selectedDiffKey: string | null;
  readonly onSelectDiff: (path: string, staged: boolean) => Promise<void>;
  readonly onStage: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly onUnstage: (paths: ReadonlyArray<string>) => Promise<void>;
  readonly onDiscard: (paths: ReadonlyArray<string>, deleteUntracked: boolean) => Promise<void>;
}

function createDiffKey(path: string, staged: boolean): string {
  return `${staged ? "staged" : "unstaged"}:${path}`;
}

function getEntryTitle(entry: GitStatusEntry): string {
  if (entry.originalPath === null) {
    return entry.path;
  }
  return `${entry.originalPath} → ${entry.path}`;
}

function getStatusLabel(entry: GitStatusEntry, mode: SectionMode): string {
  if (mode === "conflicted") {
    return "冲突";
  }
  if (mode === "untracked") {
    return STATUS_LABELS["?"];
  }
  const code = mode === "staged" ? entry.indexStatus : entry.worktreeStatus;
  return STATUS_LABELS[code as keyof typeof STATUS_LABELS] ?? "变更";
}

function getPrimaryActionLabel(mode: SectionMode): string {
  if (mode === "staged") {
    return "取消暂存";
  }
  if (mode === "conflicted") {
    return "加入暂存";
  }
  return "暂存";
}

function getSecondaryActionLabel(mode: SectionMode): string | null {
  if (mode === "unstaged") {
    return "还原";
  }
  if (mode === "untracked") {
    return "删除";
  }
  return null;
}

function getEmptyText(mode: SectionMode): string {
  if (mode === "staged") {
    return "当前没有已暂存的文件。";
  }
  if (mode === "unstaged") {
    return "工作区没有未暂存变更。";
  }
  if (mode === "untracked") {
    return "工作区没有未跟踪文件。";
  }
  return "当前没有冲突文件。";
}

export function GitChangeSection(props: GitChangeSectionProps): JSX.Element {
  const stagedDiff = props.mode === "staged";
  const primaryLabel = getPrimaryActionLabel(props.mode);
  const secondaryLabel = getSecondaryActionLabel(props.mode);
  const canBulkApply = props.mode !== "conflicted" && props.entries.length > 0;
  const applyPrimary = (paths: ReadonlyArray<string>) => {
    if (props.mode === "staged") {
      return props.onUnstage(paths);
    }
    return props.onStage(paths);
  };

  const handleSecondaryAction = async (path: string) => {
    const confirmed = await confirm(`确定要处理文件 ${path} 吗？该操作不可撤销。`);
    if (confirmed) {
      void props.onDiscard([path], props.mode === "untracked");
    }
  };

  return (
    <section className="git-card git-section-card">
      <header className="git-section-header">
        <div>
          <h3 className="git-card-title">{props.title}</h3>
          <p className="git-card-meta">共 {props.entries.length} 项</p>
        </div>
        {canBulkApply ? (
          <button type="button" className="git-inline-btn" disabled={props.busy} onClick={() => void applyPrimary(props.entries.map((entry) => entry.path))}>
            全部{primaryLabel}
          </button>
        ) : null}
      </header>
      {props.entries.length === 0 ? <div className="git-empty-tip">{getEmptyText(props.mode)}</div> : null}
      <div className="git-entry-list">
        {props.entries.map((entry) => {
          const diffKey = createDiffKey(entry.path, stagedDiff);
          return (
            <article key={`${props.mode}:${entry.path}`} className={props.selectedDiffKey === diffKey ? "git-entry git-entry-selected" : "git-entry"}>
              <div className="git-entry-body">
                <div className="git-entry-name">{getEntryTitle(entry)}</div>
                <div className="git-entry-meta">{getStatusLabel(entry, props.mode)}</div>
              </div>
              <div className="git-entry-actions">
                <button type="button" className="git-inline-btn" disabled={props.busy} onClick={() => void props.onSelectDiff(entry.path, stagedDiff)}>
                  查看差异
                </button>
                <button type="button" className="git-inline-btn" disabled={props.busy} onClick={() => void applyPrimary([entry.path])}>
                  {primaryLabel}
                </button>
                {secondaryLabel !== null ? (
                  <button type="button" className="git-inline-btn git-inline-btn-danger" disabled={props.busy} onClick={() => void handleSecondaryAction(entry.path)}>
                    {secondaryLabel}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
