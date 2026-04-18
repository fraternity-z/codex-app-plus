import { useMemo } from "react";
import type { GitWorkspaceDiffOutput } from "../../../bridge/types";
import { parseUnifiedDiffCached } from "../model/diffPreviewModel";
import { GitDiffCodeView } from "./GitDiffCodeView";
import type { DiffViewStyle } from "../hooks/useDiffSidebarLayout";

interface WorkspaceDiffConversationPreviewProps {
  readonly items: ReadonlyArray<GitWorkspaceDiffOutput>;
  readonly selectedDiffPath: string | null;
  readonly diffStyle: DiffViewStyle;
}

function EmptyPreview(props: { readonly message: string; readonly hint: string }): JSX.Element {
  return (
    <div className="workspace-diff-conversation-empty">
      <h3 className="workspace-diff-conversation-empty-title">{props.message}</h3>
      <p className="workspace-diff-conversation-empty-body">{props.hint}</p>
    </div>
  );
}

export function WorkspaceDiffConversationPreview(props: WorkspaceDiffConversationPreviewProps): JSX.Element {
  const active = useMemo(
    () => props.items.find((item) => item.path === props.selectedDiffPath) ?? null,
    [props.items, props.selectedDiffPath],
  );

  const parsed = useMemo(() => {
    if (active === null) {
      return null;
    }
    return parseUnifiedDiffCached(active.diff);
  }, [active]);

  const styleClass = props.diffStyle === "split"
    ? "workspace-diff-conversation-body is-split"
    : "workspace-diff-conversation-body is-unified";

  if (props.items.length === 0) {
    return (
      <section className="workspace-diff-conversation-preview" aria-label="差异预览">
        <EmptyPreview message="暂无可预览的差异" hint="当前分组没有文件变更。" />
      </section>
    );
  }

  if (active === null || parsed === null) {
    return (
      <section className="workspace-diff-conversation-preview" aria-label="差异预览">
        <EmptyPreview message="未选择文件" hint="在右侧列表中点击一个文件以查看 diff。" />
      </section>
    );
  }

  return (
    <section className="workspace-diff-conversation-preview" aria-label={`${active.displayPath} 差异预览`}>
      <header className="workspace-diff-conversation-header">
        <div className="workspace-diff-conversation-title-wrap">
          <span className="workspace-diff-conversation-status" data-status={active.status.trim() || "M"}>
            {active.status.trim() || "M"}
          </span>
          <h3 className="workspace-diff-conversation-title" title={active.displayPath}>
            {active.displayPath}
          </h3>
        </div>
        <div
          className="workspace-diff-conversation-summary"
          aria-label={`新增 ${active.additions} 行，删除 ${active.deletions} 行`}
        >
          <span className="workspace-diff-file-summary-add">+{active.additions}</span>
          <span className="workspace-diff-file-summary-delete">-{active.deletions}</span>
        </div>
      </header>
      <div className={styleClass}>
        <GitDiffCodeView parsed={parsed} path={active.path} viewStyle={props.diffStyle} />
      </div>
    </section>
  );
}
