import { useCallback, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject, SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { ConversationMessageContent } from "./ConversationMessageContent";
import { HomeImagePreviewDialog } from "./HomeImagePreviewDialog";
import type { ConversationRenderNode } from "../model/localConversationGroups";
import { createAssistantTranscriptEntryModel, createCommandSummaryParts } from "../model/assistantTranscript";
import { createDetailPanel } from "../model/assistantTranscriptDetailModel";
import { createFileChangeSummaryParts } from "../model/fileChangeSummary";
import { HomeAssistantTranscriptDetailBlock } from "./HomeAssistantTranscriptDetailBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { HomePlanDraftCard } from "../../composer/ui/HomePlanDraftCard";
import { useToolbarMenuDismissal } from "../../shared/hooks/useToolbarMenuDismissal";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import type { ImageGenerationEntry } from "../../../domain/timeline";
import { useI18n } from "../../../i18n/useI18n";
import { parseUnifiedDiffCached } from "../../git/model/diffPreviewModel";
import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
  readonly turnStatus?: TurnStatus | null;
}

type ImageMenuAction = "openFolder" | "copyImage";

export function HomeAssistantTranscriptEntry(props: HomeAssistantTranscriptEntryProps): JSX.Element {
  const { t } = useI18n();
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (props.node.kind === "reasoningBlock") {
    return <ReasoningTranscriptEntry block={props.node.block} />;
  }

  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "plan") {
    return (
      <article className="home-assistant-transcript-entry home-assistant-transcript-plan">
        <HomePlanDraftCard markdown={props.node.entry.text} />
      </article>
    );
  }
  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "turnDiffSnapshot") {
    if (props.turnStatus === "inProgress") {
      return <></>;
    }
    return (
      <section className="home-assistant-transcript-entry">
        <HomeAssistantTranscriptDetailBlock panel={createDetailPanel({ body: props.node.entry.diff, label: "Diff", variant: "diffSummary" })} />
      </section>
    );
  }
  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "contextCompaction") {
    const label = t("home.conversation.transcript.contextCompacted");
    return (
      <div className="home-assistant-transcript-entry home-assistant-transcript-divider" role="note" aria-label={label}>
        <span className="home-assistant-transcript-divider-line" aria-hidden="true" />
        <span className="home-assistant-transcript-divider-label">
          <span className="home-assistant-transcript-divider-icon" aria-hidden="true">↳</span>
          <span>{label}</span>
        </span>
        <span className="home-assistant-transcript-divider-line" aria-hidden="true" />
      </div>
    );
  }

  const model = createAssistantTranscriptEntryModel(props.node, t);
  const truncateSummaryWhenCollapsed = model.kind === "details" && model.truncateSummaryWhenCollapsed === true;
  const traceEntry = props.node.kind === "traceItem";
  const summaryContent = model.kind === "message" ? null : createSummaryContent(props.node, model.summary, t, detailsOpen);
  const handleDetailsToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    setDetailsOpen(event.currentTarget.open);
  }, []);

  if (props.node.kind === "traceItem" && props.node.item.kind === "imageGeneration" && model.kind === "details") {
    return <ImageGenerationTranscriptEntry entry={props.node.item} />;
  }

  if (model.kind === "message" && model.message) {
    if (model.message.text.trim().length === 0) {
      return <></>;
    }

    return (
      <article className="home-assistant-transcript-entry home-assistant-transcript-message" data-status={model.message.status}>
        <ConversationMessageContent
          className="home-chat-markdown home-chat-markdown-assistant home-chat-markdown-inline"
          message={model.message}
          variant="assistant-inline"
        />
      </article>
    );
  }

  if (model.kind === "details") {
    return (
      <section className={`home-assistant-transcript-entry home-assistant-transcript-details${traceEntry ? " home-assistant-transcript-details-trace" : ""}`}>
        <details onToggle={handleDetailsToggle}>
          <summary
            className="home-assistant-transcript-line home-assistant-transcript-summary"
            data-truncate-summary={truncateSummaryWhenCollapsed ? "true" : undefined}
          >
            <span className="home-assistant-transcript-summary-text">{summaryContent}</span>
          </summary>
          <HomeAssistantTranscriptDetailBlock panel={model.detailPanel} />
        </details>
      </section>
    );
  }

  return <p className={`home-assistant-transcript-entry home-assistant-transcript-line${traceEntry ? " home-assistant-transcript-line-trace" : ""}`}>{summaryContent}</p>;
}

function ReasoningTranscriptEntry(props: { readonly block: Extract<AssistantNode, { kind: "reasoningBlock" }>["block"] }): JSX.Element {
  const hasBody = props.block.bodyMarkdown.trim().length > 0;

  if (!hasBody) {
    return (
      <section className="home-assistant-transcript-entry home-assistant-transcript-reasoning" data-kind="reasoning">
        <TranscriptMarkdown className="home-assistant-transcript-reasoning-title-markdown" text={props.block.titleMarkdown} variant="title" />
      </section>
    );
  }

  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-reasoning" data-kind="reasoning">
      <details className="home-assistant-transcript-reasoning-details">
        <summary className="home-assistant-transcript-line home-assistant-transcript-reasoning-summary">
          <TranscriptMarkdown className="home-assistant-transcript-reasoning-summary-markdown" text={props.block.titleMarkdown} variant="title" />
        </summary>
        <div className="home-assistant-transcript-reasoning-body">
          <TranscriptMarkdown className="home-assistant-transcript-reasoning-body-markdown" text={props.block.bodyMarkdown} />
        </div>
      </details>
    </section>
  );
}

function TranscriptMarkdown(props: { readonly className: string; readonly text: string; readonly variant?: "body" | "title" }): JSX.Element {
  return <MarkdownRenderer className={props.className} markdown={props.text} variant={props.variant} />;
}

function ImageGenerationTranscriptEntry(props: { readonly entry: ImageGenerationEntry }): JSX.Element {
  const { t } = useI18n();
  const previewSrc = useMemo(() => createImageGenerationPreviewSource(props.entry), [props.entry]);
  const menuRef = useRef<HTMLDivElement>(null);
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [menu, setMenu] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [pendingAction, setPendingAction] = useState<ImageMenuAction | null>(null);

  const closeMenu = useCallback(() => {
    if (pendingAction === null) {
      setMenu(null);
    }
  }, [pendingAction]);

  useToolbarMenuDismissal(menu !== null, menuRef, closeMenu, [imageButtonRef]);

  const handleContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const runMenuAction = useCallback(async (action: ImageMenuAction) => {
    if (pendingAction !== null || previewSrc === null) {
      return;
    }
    setPendingAction(action);
    try {
      if (action === "openFolder") {
        if (props.entry.savedPath !== null) {
          await invoke("app_reveal_path_in_folder", { input: { path: props.entry.savedPath } });
        }
      } else {
        await copyImageToClipboard(createImageGenerationClipboardSource(props.entry, previewSrc));
      }
      setMenu(null);
    } catch (error) {
      console.error("Image menu action failed", error);
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, previewSrc, props.entry.savedPath]);

  if (previewSrc === null) {
    return <></>;
  }

  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-image-generation" data-status={props.entry.status}>
      <button
        ref={imageButtonRef}
        type="button"
        className="home-assistant-transcript-image-button"
        aria-label={t("home.conversation.generatedImage.openPreview")}
        onClick={() => setPreviewOpen(true)}
        onContextMenu={handleContextMenu}
      >
        <img className="home-assistant-transcript-image-preview" src={previewSrc} alt={t("home.conversation.generatedImage.alt")} />
      </button>
      {menu === null ? null : createPortal(
        <ImageGenerationContextMenu
          x={menu.x}
          y={menu.y}
          canOpenFolder={props.entry.savedPath !== null}
          pendingAction={pendingAction}
          menuRef={menuRef}
          onOpenFolder={() => void runMenuAction("openFolder")}
          onCopyImage={() => void runMenuAction("copyImage")}
        />,
        document.body,
      )}
      {previewOpen ? (
        <HomeImagePreviewDialog
          src={previewSrc}
          alt={t("home.conversation.generatedImage.alt")}
          dialogLabel={t("home.conversation.generatedImage.previewDialog")}
          closeLabel={t("home.conversation.generatedImage.closePreview")}
          onContextMenu={handleContextMenu}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </section>
  );
}

function createImageGenerationPreviewSource(entry: ImageGenerationEntry): string | null {
  if (entry.result.trim().length > 0) {
    return entry.result.startsWith("data:image/") ? entry.result : `data:image/png;base64,${entry.result}`;
  }
  if (entry.savedPath !== null) {
    return convertFileSrc(entry.savedPath);
  }
  return null;
}

function createImageGenerationClipboardSource(entry: ImageGenerationEntry, previewSrc: string): string {
  if (entry.result.trim().length > 0) {
    return entry.result.startsWith("data:image/") ? entry.result : `data:image/png;base64,${entry.result}`;
  }
  return previewSrc;
}

function ImageGenerationContextMenu(props: {
  readonly x: number;
  readonly y: number;
  readonly canOpenFolder: boolean;
  readonly pendingAction: ImageMenuAction | null;
  readonly menuRef: RefObject<HTMLDivElement>;
  readonly onOpenFolder: () => void;
  readonly onCopyImage: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div
      ref={props.menuRef}
      className="thread-context-menu home-assistant-transcript-image-menu"
      style={{ left: props.x, top: props.y }}
      role="menu"
      aria-label={t("home.conversation.generatedImage.contextMenuAria")}
    >
      {props.canOpenFolder ? (
        <button type="button" className="thread-context-menu-item" role="menuitem" onClick={props.onOpenFolder} disabled={props.pendingAction !== null}>
          {props.pendingAction === "openFolder" ? t("home.conversation.generatedImage.openingFolder") : t("home.conversation.generatedImage.openInFolder")}
        </button>
      ) : null}
      <button type="button" className="thread-context-menu-item" role="menuitem" onClick={props.onCopyImage} disabled={props.pendingAction !== null}>
        {props.pendingAction === "copyImage" ? t("home.conversation.generatedImage.copyingImage") : t("home.conversation.generatedImage.copyImage")}
      </button>
    </div>
  );
}

async function copyImageToClipboard(src: string): Promise<void> {
  const response = await fetch(src);
  const blob = await response.blob();
  const clipboard = navigator.clipboard;
  if (typeof ClipboardItem !== "undefined" && clipboard?.write !== undefined) {
    await clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    return;
  }
  await clipboard?.writeText(src);
}

interface FileChangeDiffStats {
  readonly additions: number;
  readonly deletions: number;
}

function summarizeFileChangeDiffStats(changes: ReadonlyArray<FileUpdateChange>): FileChangeDiffStats | null {
  let additions = 0;
  let deletions = 0;
  let hasDiff = false;
  for (const change of changes) {
    if (change.diff.trim().length === 0) {
      continue;
    }
    const parsed = parseUnifiedDiffCached(change.diff);
    additions += parsed.additions;
    deletions += parsed.deletions;
    hasDiff = true;
  }
  return hasDiff ? { additions, deletions } : null;
}

function FileChangeSummaryCounts(props: { readonly stats: FileChangeDiffStats | null }): JSX.Element | null {
  if (props.stats === null) {
    return null;
  }
  return (
    <span
      className="home-assistant-transcript-file-change-counts"
      aria-label={`新增 ${props.stats.additions} 行，删除 ${props.stats.deletions} 行`}
    >
      <span className="workspace-diff-file-summary-add">+{props.stats.additions}</span>
      <span className="workspace-diff-file-summary-delete">-{props.stats.deletions}</span>
    </span>
  );
}

function FileChangeSummaryContent(props: {
  readonly item: Extract<AssistantNode, { kind: "traceItem" }>["item"] & { kind: "fileChange" };
  readonly open: boolean;
}): JSX.Element | string {
  if (props.open) {
    return (
      <span className="home-assistant-transcript-file-change-open-summary">
        <span>已编辑的文件</span>
        <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
      </span>
    );
  }

  const parts = createFileChangeSummaryParts(props.item.status, props.item.changes);
  const stats = summarizeFileChangeDiffStats(props.item.changes);
  if (parts.fileName === null) {
    return (
      <span className="home-assistant-transcript-file-change-summary-inline">
        <span>{parts.text}</span>
        <FileChangeSummaryCounts stats={stats} />
        <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="home-assistant-transcript-file-change-summary-inline">
      <span>
        {parts.prefix}
        <span className="home-assistant-transcript-file-name">{parts.fileName}</span>
        {parts.suffix}
      </span>
      <FileChangeSummaryCounts stats={stats} />
      <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
    </span>
  );
}

function createSummaryContent(
  node: AssistantNode,
  summary: string,
  t: ReturnType<typeof useI18n>["t"],
  detailsOpen: boolean,
): JSX.Element | string {
  if (node.kind !== "traceItem") {
    return summary;
  }
  if (node.item.kind === "fileChange") {
    return <FileChangeSummaryContent item={node.item} open={detailsOpen} />;
  }
  if (node.item.kind !== "commandExecution") {
    return summary;
  }
  const parts = createCommandSummaryParts(node.item.command, node.item.status, t);
  if (parts === null || parts.fileName === null) {
    return summary;
  }
  return (
    <>
      {parts.prefix}
      <span className="home-assistant-transcript-file-name">{parts.fileName}</span>
      {parts.suffix}
    </>
  );
}
