import type { ConversationMessage } from "../../../domain/timeline";
import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import type { MessageKey } from "../../../i18n/messages/schema";
import type { TranslationParams } from "../../../i18n/types";
import type { AuxiliaryBlock, ConversationRenderNode, TraceEntry } from "./localConversationGroups";
import { createTurnPlanDetailLines, createTurnPlanModel } from "./homeTurnPlanModel";
import {
  createDetailPanel,
  createFileDiffDetailPanel,
  createShellBody,
  formatDuration,
  joinDetailLines,
  joinMetaParts,
  safeJson,
  type AssistantTranscriptDetailPanel,
  type AssistantTranscriptTextDetailPanel,
} from "./assistantTranscriptDetailModel";
import { formatFileChangeSummary, getFileChangeDisplayName } from "./fileChangeSummary";

type TranslateFn = (key: MessageKey, params?: TranslationParams) => string;

interface MessageEntryModel {
  readonly key: string;
  readonly kind: "message";
  readonly summary: null;
  readonly detailPanel: null;
  readonly message: ConversationMessage;
}

interface LineEntryModel {
  readonly key: string;
  readonly kind: "line";
  readonly summary: string;
  readonly detailPanel: null;
}

interface DetailsEntryModel {
  readonly key: string;
  readonly kind: "details";
  readonly summary: string;
  readonly detailPanel: AssistantTranscriptDetailPanel;
  readonly truncateSummaryWhenCollapsed?: boolean;
}

export type AssistantTranscriptEntryModel = MessageEntryModel | LineEntryModel | DetailsEntryModel;

interface DetailsModelOptions {
  readonly key: string;
  readonly summary: string;
  readonly detailPanel: AssistantTranscriptDetailPanel | null;
  readonly truncateSummaryWhenCollapsed?: boolean;
}

interface DetailBlockOptions {
  readonly body: string | null;
  readonly label: string;
  readonly topMeta?: string | null;
  readonly footerMeta?: string | null;
  readonly footerStatus?: string | null;
  readonly variant?: AssistantTranscriptTextDetailPanel["variant"];
}

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

export function createAssistantTranscriptEntryModel(node: AssistantNode, t: TranslateFn): AssistantTranscriptEntryModel {
  if (node.kind === "assistantMessage") {
    return {
      key: node.key,
      kind: "message",
      summary: null,
      detailPanel: null,
      message: node.message,
    };
  }
  if (node.kind === "reasoningBlock") {
    return createLineModel(node.key, node.block.bodyMarkdown || node.block.titleMarkdown);
  }

  if (node.kind === "traceItem") {
    return createTraceModel(node.key, node.item, t);
  }

  return createAuxiliaryModel(node.key, node.entry, t);
}

function createTraceModel(key: string, entry: TraceEntry, t: TranslateFn): AssistantTranscriptEntryModel {
  if (entry.kind === "commandExecution") return createCommandTraceModel(key, entry, t);
  if (entry.kind === "fileChange") return createFileChangeTraceModel(key, entry, t);
  if (entry.kind === "mcpToolCall") return createMcpTraceModel(key, entry, t);
  if (entry.kind === "dynamicToolCall") return createDynamicToolTraceModel(key, entry, t);
  if (entry.kind === "collabAgentToolCall") return createCollabAgentToolTraceModel(key, entry, t);
  if (entry.kind === "webSearch") {
    return createDetailsModel({
      key,
      summary: t("home.conversation.transcript.webSearch", { query: entry.query }),
      detailPanel: createDetailBlockPanel({ body: entry.action === null ? null : safeJson(entry.action), label: "Search" }),
    });
  }

  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.viewImage", { path: entry.path }),
    detailPanel: null,
  });
}

function createCommandTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "commandExecution" }>,
  t: TranslateFn,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: createCommandSummary(entry.command, entry.status, t),
    detailPanel: createDetailPanel({
      label: "Shell",
      body: createShellBody(entry.command, entry.output),
      footerMeta: joinMetaParts([
        t("home.conversation.transcript.exitCode", { value: entry.exitCode === null ? "-" : String(entry.exitCode) }),
        t("home.conversation.transcript.duration", { value: formatDuration(entry.durationMs) }),
      ]),
      footerStatus: formatCommandFooterStatus(entry.status, t),
      variant: "shell",
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createFileChangeTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "fileChange" }>,
  t: TranslateFn,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: formatFileChangeSummary(entry.status, entry.changes),
    detailPanel: createFileChangeDetailPanel(entry, t),
  });
}

function createMcpTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "mcpToolCall" }>,
  t: TranslateFn,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.toolCall", { tool: `${entry.server}/${entry.tool}` }),
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        t("home.conversation.transcript.args", { value: safeJson(entry.arguments) }),
        entry.error?.message ?? safeJson(entry.result),
      ]),
      label: "Tool",
      footerMeta: t("home.conversation.transcript.duration", { value: formatDuration(entry.durationMs) }),
      footerStatus: formatToolFooterStatus(entry.status, t),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createDynamicToolTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "dynamicToolCall" }>,
  t: TranslateFn,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.toolCall", { tool: entry.tool }),
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        t("home.conversation.transcript.args", { value: safeJson(entry.arguments) }),
        entry.contentItems.length > 0 ? safeJson(entry.contentItems) : null,
      ]),
      label: "Tool",
      footerMeta: t("home.conversation.transcript.duration", { value: formatDuration(entry.durationMs) }),
      footerStatus: formatToolFooterStatus(entry.status, t),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createCollabAgentToolTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "collabAgentToolCall" }>,
  t: TranslateFn,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.toolCall", { tool: entry.tool }),
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        t("home.conversation.transcript.senderThread", { value: entry.senderThreadId }),
        entry.receiverThreadIds.length > 0
          ? t("home.conversation.transcript.receiverThreads", { value: entry.receiverThreadIds.join(", ") })
          : null,
        entry.prompt,
      ]),
      label: "Tool",
      footerStatus: formatToolFooterStatus(entry.status, t),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createAuxiliaryModel(key: string, entry: AuxiliaryBlock, t: TranslateFn): AssistantTranscriptEntryModel {
  if (entry.kind === "plan") {
    return createDetailsModel({
      key,
      summary: entry.status === "streaming"
        ? t("home.conversation.transcript.planDraftUpdating")
        : t("home.conversation.transcript.planDraft"),
      detailPanel: createDetailBlockPanel({ body: entry.text, label: "Plan" }),
    });
  }

  if (entry.kind === "turnPlanSnapshot") {
    const planModel = createTurnPlanModel(entry);
    return createDetailsModel({
      key,
      summary: t("home.conversation.transcript.taskList"),
      detailPanel: createDetailBlockPanel({
        body: joinDetailLines(createTurnPlanDetailLines(planModel, t)),
        label: "Plan",
      }),
    });
  }

  if (entry.kind === "turnDiffSnapshot") {
    return createDetailsModel({
      key,
      summary: t("home.conversation.transcript.codeDiffUpdated"),
      detailPanel: createDetailBlockPanel({ body: entry.diff, label: "Diff", variant: "diffSummary" }),
    });
  }

  if (entry.kind === "reviewMode") {
    return createLineModel(
      key,
      entry.state === "entered"
        ? t("home.conversation.transcript.reviewEntered", { review: entry.review })
        : t("home.conversation.transcript.reviewExited", { review: entry.review }),
    );
  }

  if (entry.kind === "contextCompaction") {
    return createLineModel(key, t("home.conversation.transcript.contextCompacted"));
  }

  if (entry.kind === "rawResponse") {
    return createDetailsModel({
      key,
      summary: entry.title,
      detailPanel: createDetailBlockPanel({ body: entry.detail ?? safeJson(entry.payload), label: "Details" }),
    });
  }

  if (entry.kind === "systemNotice") {
    return createDetailsModel({
      key,
      summary: entry.title,
      detailPanel: createDetailBlockPanel({ body: entry.detail, label: "Details" }),
    });
  }

  if (entry.kind === "realtimeSession") {
    return createLineModel(
      key,
      entry.message
        ? t("home.conversation.transcript.realtimeSessionWithMessage", { status: entry.status, message: entry.message })
        : t("home.conversation.transcript.realtimeSession", { status: entry.status }),
    );
  }

  if (entry.kind === "realtimeAudio") {
    return createLineModel(
      key,
      t("home.conversation.transcript.realtimeAudio", {
        index: entry.chunkIndex + 1,
        sampleRate: entry.audio.sampleRate,
        channels: entry.audio.numChannels,
      }),
    );
  }

  if (entry.kind === "debug") {
    return createDetailsModel({
      key,
      summary: t("home.conversation.transcript.debug", { title: entry.title }),
      detailPanel: createDetailBlockPanel({ body: safeJson(entry.payload), label: "Debug" }),
    });
  }

  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.fuzzySearch", { query: entry.query }),
    detailPanel: createDetailBlockPanel({
      body: entry.files.length === 0 ? null : entry.files.map((file) => file.path).join("\n"),
      label: "Search",
    }),
  });
}

function createLineModel(key: string, summary: string): AssistantTranscriptEntryModel {
  return { key, kind: "line", summary, detailPanel: null };
}

function createDetailsModel(options: DetailsModelOptions): AssistantTranscriptEntryModel {
  if (options.detailPanel === null || hasDetailPanelContent(options.detailPanel) === false) {
    return createLineModel(options.key, options.summary);
  }

  return {
    key: options.key,
    kind: "details",
    summary: options.summary,
    detailPanel: options.detailPanel,
    truncateSummaryWhenCollapsed: options.truncateSummaryWhenCollapsed,
  };
}

function hasDetailPanelContent(panel: AssistantTranscriptDetailPanel): boolean {
  if (panel.variant === "fileDiff") {
    return panel.changes.length > 0;
  }
  return panel.body.trim().length > 0;
}

function createFileChangeDetailPanel(
  entry: Extract<TraceEntry, { kind: "fileChange" }>,
  t: TranslateFn,
): AssistantTranscriptDetailPanel | null {
  const footerStatus = formatPatchFooterStatus(entry.status, t);
  if (entry.status === "completed" && hasRenderableFileDiff(entry.changes)) {
    return createFileDiffDetailPanel({ label: "Patch", changes: entry.changes, footerStatus });
  }
  return createDetailBlockPanel({
    body: joinDetailLines([
      entry.changes.length > 0 ? t("home.conversation.transcript.changedFiles") : null,
      ...entry.changes.map((change) => getFileChangeDisplayName(change.path)),
      entry.output.trim().length > 0 ? entry.output : null,
    ]),
    label: "Patch",
    footerStatus,
  });
}

function hasRenderableFileDiff(changes: ReadonlyArray<FileUpdateChange>): boolean {
  return changes.some((change) => change.diff.trim().length > 0);
}

function createDetailBlockPanel(options: DetailBlockOptions): AssistantTranscriptDetailPanel | null {
  const body = options.body;

  if (body === null || body.trim().length === 0) {
    return null;
  }

  return createDetailPanel({ ...options, body });
}

function createCommandSummary(command: string, status: string, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.commandCompleted", { command });
  if (status === "failed") return t("home.conversation.transcript.commandFailed", { command });
  if (status === "declined") return t("home.conversation.transcript.commandDeclined", { command });
  return t("home.conversation.transcript.commandRunning", { command });
}

function formatCommandFooterStatus(status: string, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.status.commandCompleted");
  if (status === "failed") return t("home.conversation.transcript.status.commandFailed");
  if (status === "declined") return t("home.conversation.transcript.status.commandDeclined");
  return t("home.conversation.transcript.status.commandRunning");
}

function formatPatchFooterStatus(status: string, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.status.patchCompleted");
  if (status === "failed") return t("home.conversation.transcript.status.patchFailed");
  if (status === "declined") return t("home.conversation.transcript.status.patchDeclined");
  return t("home.conversation.transcript.status.patchRunning");
}

function formatToolFooterStatus(status: string, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.status.toolCompleted");
  if (status === "failed") return t("home.conversation.transcript.status.toolFailed");
  return t("home.conversation.transcript.status.toolRunning");
}
