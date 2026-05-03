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
import type { CollabAgentToolCallEntry, CommandExecutionEntry, ImageGenerationEntry, ImageViewEntry } from "../../../domain/timeline";
import { useI18n } from "../../../i18n/useI18n";
import { parseUnifiedDiffCached } from "../../git/model/diffPreviewModel";
import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;
type CollabAgentTarget = { readonly id: string; readonly state: CollabAgentToolCallEntry["agentsStates"][string] | null };

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
  readonly turnStatus?: TurnStatus | null;
}

type ImageMenuAction = "openFolder" | "copyImage";

interface ImageTranscriptLabels {
  readonly alt: string;
  readonly openPreview: string;
  readonly previewDialog: string;
  readonly closePreview: string;
  readonly contextMenuAria: string;
}

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

  if (props.node.kind === "traceItem" && props.node.item.kind === "imageView") {
    return <ImageViewTranscriptEntry entry={props.node.item} />;
  }

  if (props.node.kind === "traceItem" && props.node.item.kind === "imageGeneration" && model.kind === "details") {
    return <ImageGenerationTranscriptEntry entry={props.node.item} />;
  }

  if (props.node.kind === "traceItem" && props.node.item.kind === "collabAgentToolCall") {
    return <HomeSubagentTranscriptEntry entries={[props.node.item]} />;
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

export function HomeSubagentTranscriptEntry(props: { readonly entries: ReadonlyArray<CollabAgentToolCallEntry> }): JSX.Element {
  const { t } = useI18n();
  const rows = props.entries.flatMap((entry) => getCollabAgentTargets(entry).map((target) => ({ entry, target })));
  const fallbackEntry = props.entries[0] ?? null;
  const visibleRows = rows.length > 0 ? rows : fallbackEntry === null ? [] : [{ entry: fallbackEntry, target: { id: fallbackEntry.senderThreadId, state: null } }];
  const count = Math.max(rows.length, 1);
  if (fallbackEntry === null) {
    return <></>;
  }
  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-subagents" data-tool={fallbackEntry.tool} data-status={fallbackEntry.status}>
      <details open>
        <summary className="home-assistant-transcript-line home-assistant-transcript-summary home-assistant-transcript-subagents-summary">
          <span className="home-assistant-transcript-subagents-summary-text">
            {formatCollabAgentSummary(fallbackEntry, count, t)}
          </span>
          <span className="home-assistant-transcript-tool-group-chevron" aria-hidden="true" />
        </summary>
        <div className="home-assistant-transcript-subagents-body">
          {visibleRows.map(({ entry, target }, index) => (
            <CollabAgentRow key={`${entry.id}:${target.id}:${index}`} entry={entry} target={target} />
          ))}
        </div>
      </details>
    </section>
  );
}

function CollabAgentRow(props: {
  readonly entry: CollabAgentToolCallEntry;
  readonly target: CollabAgentTarget;
}): JSX.Element {
  const { t } = useI18n();
  const prompt = shouldShowCollabPrompt(props.entry) ? props.entry.prompt?.trim() ?? "" : "";
  const message = props.target.state?.message?.trim() ?? "";
  return (
    <div className="home-assistant-transcript-subagent-row">
      <div className="home-assistant-transcript-subagent-line">
        <span>
          {formatCollabAgentRowPrefix(props.entry, t)}
          <span className="home-assistant-transcript-subagent-id">{props.target.id}</span>
          {formatCollabAgentRowSuffix(props.entry, prompt, t)}
        </span>
        {props.target.state === null ? null : (
          <span className="home-assistant-transcript-subagent-status" data-agent-status={props.target.state.status}>
            {formatCollabAgentStatus(props.target.state.status, t)}
          </span>
        )}
      </div>
      {prompt.length > 0 ? (
        <p className="home-assistant-transcript-subagent-prompt">{prompt}</p>
      ) : null}
      {message.length > 0 ? (
        <p className="home-assistant-transcript-subagent-message">{message}</p>
      ) : null}
    </div>
  );
}

function getCollabAgentTargets(entry: CollabAgentToolCallEntry): ReadonlyArray<CollabAgentTarget> {
  const ids: string[] = [];
  for (const id of entry.receiverThreadIds) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  for (const id of Object.keys(entry.agentsStates)) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids.map((id) => ({ id, state: entry.agentsStates[id] ?? null }));
}

function shouldShowCollabPrompt(entry: CollabAgentToolCallEntry): boolean {
  return (entry.tool === "spawnAgent" || entry.tool === "sendInput") && (entry.prompt?.trim().length ?? 0) > 0;
}

function formatCollabAgentCount(count: number, t: ReturnType<typeof useI18n>["t"]): string {
  return t(count === 1
    ? "home.conversation.transcript.subagents.agentSingular"
    : "home.conversation.transcript.subagents.agentPlural", { count: String(count) });
}

function formatCollabAgentSummary(
  entry: CollabAgentToolCallEntry,
  count: number,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const agent = formatCollabAgentCount(count, t);
  if (entry.tool === "spawnAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.creating", { count: String(count), agent });
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.createFailed", { count: String(count), agent });
    return t("home.conversation.transcript.subagents.created", { count: String(count), agent });
  }
  if (entry.tool === "closeAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.closing", { count: String(count), agent });
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.closeFailed", { count: String(count), agent });
    return t("home.conversation.transcript.subagents.closed", { count: String(count), agent });
  }
  if (entry.tool === "sendInput") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.sendingInput", { count: String(count), agent });
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.sendInputFailed", { count: String(count), agent });
    return t("home.conversation.transcript.subagents.sentInput", { count: String(count), agent });
  }
  if (entry.tool === "resumeAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.resuming", { count: String(count), agent });
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.resumeFailed", { count: String(count), agent });
    return t("home.conversation.transcript.subagents.resumed", { count: String(count), agent });
  }
  if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.waiting", { count: String(count), agent });
  if (entry.status === "failed") return t("home.conversation.transcript.subagents.waitFailed", { count: String(count), agent });
  return t("home.conversation.transcript.subagents.waited", { count: String(count), agent });
}

function formatCollabAgentRowPrefix(
  entry: CollabAgentToolCallEntry,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (entry.tool === "spawnAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.rowCreatingPrefix");
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.rowCreateFailedPrefix");
    return t("home.conversation.transcript.subagents.rowCreatedPrefix");
  }
  if (entry.tool === "closeAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.rowClosingPrefix");
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.rowCloseFailedPrefix");
    return t("home.conversation.transcript.subagents.rowClosedPrefix");
  }
  if (entry.tool === "sendInput") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.rowSendingInputPrefix");
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.rowSendInputFailedPrefix");
    return t("home.conversation.transcript.subagents.rowSentInputPrefix");
  }
  if (entry.tool === "resumeAgent") {
    if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.rowResumingPrefix");
    if (entry.status === "failed") return t("home.conversation.transcript.subagents.rowResumeFailedPrefix");
    return t("home.conversation.transcript.subagents.rowResumedPrefix");
  }
  if (entry.status === "inProgress") return t("home.conversation.transcript.subagents.rowWaitingPrefix");
  if (entry.status === "failed") return t("home.conversation.transcript.subagents.rowWaitFailedPrefix");
  return t("home.conversation.transcript.subagents.rowWaitedPrefix");
}

function formatCollabAgentRowSuffix(
  entry: CollabAgentToolCallEntry,
  prompt: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (prompt.length === 0) {
    return "";
  }
  if (entry.tool === "spawnAgent") {
    return t("home.conversation.transcript.subagents.promptSuffix");
  }
  if (entry.tool === "sendInput") {
    return t("home.conversation.transcript.subagents.inputSuffix");
  }
  return "";
}

function formatCollabAgentStatus(
  status: NonNullable<CollabAgentTarget["state"]>["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (status === "pendingInit") return t("home.conversation.transcript.subagents.status.pendingInit");
  if (status === "running") return t("home.conversation.transcript.subagents.status.running");
  if (status === "interrupted") return t("home.conversation.transcript.subagents.status.interrupted");
  if (status === "completed") return t("home.conversation.transcript.subagents.status.completed");
  if (status === "errored") return t("home.conversation.transcript.subagents.status.errored");
  if (status === "shutdown") return t("home.conversation.transcript.subagents.status.shutdown");
  return t("home.conversation.transcript.subagents.status.notFound");
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

function ImageViewTranscriptEntry(props: { readonly entry: ImageViewEntry }): JSX.Element {
  const { t } = useI18n();
  const previewSrc = useMemo(() => convertFileSrc(props.entry.path), [props.entry.path]);

  return (
    <ImageTranscriptEntry
      className="home-assistant-transcript-image-view"
      previewSrc={previewSrc}
      copySrc={previewSrc}
      savedPath={props.entry.path}
      status="completed"
      labels={{
        alt: t("home.conversation.viewedImage.alt"),
        openPreview: t("home.conversation.viewedImage.openPreview"),
        previewDialog: t("home.conversation.viewedImage.previewDialog"),
        closePreview: t("home.conversation.viewedImage.closePreview"),
        contextMenuAria: t("home.conversation.viewedImage.contextMenuAria"),
      }}
    />
  );
}

function ImageGenerationTranscriptEntry(props: { readonly entry: ImageGenerationEntry }): JSX.Element {
  const { t } = useI18n();
  const previewSrc = useMemo(() => createImageGenerationPreviewSource(props.entry), [props.entry]);
  const copySrc = useMemo(
    () => previewSrc === null ? null : createImageGenerationClipboardSource(props.entry, previewSrc),
    [previewSrc, props.entry],
  );

  if (previewSrc === null || copySrc === null) {
    return <></>;
  }

  return (
    <ImageTranscriptEntry
      className="home-assistant-transcript-image-generation"
      previewSrc={previewSrc}
      copySrc={copySrc}
      savedPath={props.entry.savedPath}
      status={props.entry.status}
      labels={{
        alt: t("home.conversation.generatedImage.alt"),
        openPreview: t("home.conversation.generatedImage.openPreview"),
        previewDialog: t("home.conversation.generatedImage.previewDialog"),
        closePreview: t("home.conversation.generatedImage.closePreview"),
        contextMenuAria: t("home.conversation.generatedImage.contextMenuAria"),
      }}
    />
  );
}

function ImageTranscriptEntry(props: {
  readonly className: string;
  readonly previewSrc: string;
  readonly copySrc: string;
  readonly savedPath: string | null;
  readonly status: string;
  readonly labels: ImageTranscriptLabels;
}): JSX.Element {
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
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(action);
    try {
      if (action === "openFolder") {
        if (props.savedPath !== null) {
          await invoke("app_reveal_path_in_folder", { input: { path: props.savedPath } });
        }
      } else {
        await copyImageToClipboard(props.copySrc);
      }
      setMenu(null);
    } catch (error) {
      console.error("Image menu action failed", error);
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, props.copySrc, props.savedPath]);

  return (
    <section className={`home-assistant-transcript-entry home-assistant-transcript-image-entry ${props.className}`} data-status={props.status}>
      <button
        ref={imageButtonRef}
        type="button"
        className="home-assistant-transcript-image-button"
        aria-label={props.labels.openPreview}
        onClick={() => setPreviewOpen(true)}
        onContextMenu={handleContextMenu}
      >
        <img className="home-assistant-transcript-image-preview" src={props.previewSrc} alt={props.labels.alt} />
      </button>
      {menu === null ? null : createPortal(
        <ImageContextMenu
          x={menu.x}
          y={menu.y}
          canOpenFolder={props.savedPath !== null}
          ariaLabel={props.labels.contextMenuAria}
          pendingAction={pendingAction}
          menuRef={menuRef}
          onOpenFolder={() => void runMenuAction("openFolder")}
          onCopyImage={() => void runMenuAction("copyImage")}
        />,
        document.body,
      )}
      {previewOpen ? (
        <HomeImagePreviewDialog
          src={props.previewSrc}
          alt={props.labels.alt}
          dialogLabel={props.labels.previewDialog}
          closeLabel={props.labels.closePreview}
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

function ImageContextMenu(props: {
  readonly x: number;
  readonly y: number;
  readonly canOpenFolder: boolean;
  readonly ariaLabel: string;
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
      aria-label={props.ariaLabel}
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
  return (
    <CommandSummaryContent
      command={node.item.command}
      collapsedSummary={summary}
      open={detailsOpen}
      status={node.item.status}
      t={t}
    />
  );
}

function CommandSummaryContent(props: {
  readonly command: string;
  readonly collapsedSummary: string;
  readonly open: boolean;
  readonly status: CommandExecutionEntry["status"];
  readonly t: ReturnType<typeof useI18n>["t"];
}): JSX.Element {
  if (!props.open) {
    const parts = createCommandSummaryParts(props.command, props.status, props.t);
    if (parts !== null && parts.fileName !== null) {
      return (
        <span className="home-assistant-transcript-command-summary-inline">
          <span className="home-assistant-transcript-command-summary-label" title={props.command}>
            {parts.prefix}
            <span className="home-assistant-transcript-file-name">{parts.fileName}</span>
            {parts.suffix}
          </span>
          <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
        </span>
      );
    }
    if (parts !== null) {
      return (
        <span className="home-assistant-transcript-command-summary-inline">
          <span className="home-assistant-transcript-command-summary-label" title={props.command}>
            {parts.text}
          </span>
          <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
        </span>
      );
    }
  }

  const label = props.open ? createOpenCommandSummary(props.status, props.t) : props.collapsedSummary;
  return (
    <span className={props.open ? "home-assistant-transcript-command-open-summary" : "home-assistant-transcript-command-summary-inline"}>
      <span className="home-assistant-transcript-command-summary-label" title={props.open ? undefined : props.command}>
        {label}
      </span>
      <span className="home-assistant-transcript-summary-chevron" aria-hidden="true" />
    </span>
  );
}

function createOpenCommandSummary(status: CommandExecutionEntry["status"], t: ReturnType<typeof useI18n>["t"]): string {
  if (status === "declined") {
    return t("home.conversation.transcript.commandDeclinedOpen");
  }
  if (status === "inProgress") {
    return t("home.conversation.transcript.commandRunningOpen");
  }
  return t("home.conversation.transcript.commandCompletedOpen");
}
