import type { ConversationMessage } from "../../../domain/timeline";
import type { FileUpdateChange } from "../../../protocol/generated/v2/FileUpdateChange";
import type { MessageKey } from "../../../i18n/messages/schema";
import type { TranslationParams } from "../../../i18n/types";
import type { AuxiliaryBlock, ConversationRenderNode, TraceEntry } from "./localConversationGroups";
import { classifyCommand, type CommandIntent } from "./commandIntent";
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
type CommandExecutionStatus = Extract<TraceEntry, { kind: "commandExecution" }>["status"];

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

export interface CommandSummaryParts {
  readonly text: string;
  readonly prefix: string;
  readonly fileName: string | null;
  readonly suffix: string;
}

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
  if (entry.kind === "imageGeneration") {
    const detail = entry.revisedPrompt ?? entry.itemId ?? entry.id;
    return createDetailsModel({
      key,
      summary: t("home.conversation.transcript.imageGeneration", { detail }),
      detailPanel: createDetailBlockPanel({
        body: joinDetailLines([
          entry.revisedPrompt === null ? null : `Prompt: ${entry.revisedPrompt}`,
          entry.savedPath === null ? null : `Saved path: ${entry.savedPath}`,
          formatImageGenerationResult(entry.result),
        ]),
        label: "Image",
        footerStatus: formatToolFooterStatus(entry.status, t),
      }),
    });
  }

  return createDetailsModel({
    key,
    summary: t("home.conversation.transcript.viewImage", { path: entry.path }),
    detailPanel: null,
  });
}

function formatImageGenerationResult(result: string): string | null {
  return result.trim().length === 0 ? null : `Result: ${result.length} base64 chars`;
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
    return createFileDiffDetailPanel({ label: "已编辑的文件", changes: entry.changes, footerStatus: null });
  }
  return createDetailBlockPanel({
    body: joinDetailLines([
      entry.changes.length > 0 ? t("home.conversation.transcript.changedFiles") : null,
      ...entry.changes.map((change) => getFileChangeDisplayName(change.path)),
      entry.output.trim().length > 0 ? entry.output : null,
    ]),
    label: "已编辑的文件",
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
  const parts = createCommandSummaryParts(command, status as CommandExecutionStatus, t);
  if (parts !== null) return parts.text;
  if (status === "completed") return t("home.conversation.transcript.commandCompleted", { command });
  if (status === "failed") return t("home.conversation.transcript.commandFailed", { command });
  if (status === "declined") return t("home.conversation.transcript.commandDeclined", { command });
  return t("home.conversation.transcript.commandRunning", { command });
}

export function createCommandSummaryParts(
  command: string,
  status: CommandExecutionStatus,
  t: TranslateFn,
): CommandSummaryParts | null {
  const intent = classifyCommand(command);
  if (intent === null) return null;
  if (intent.kind === "readFile") {
    return createReadCommandSummaryParts([intent.path], status, t);
  }
  if (intent.kind === "readFiles") {
    return createReadCommandSummaryParts(intent.paths, status, t);
  }
  if (intent.kind === "searchContent" && intent.path !== null) {
    return createPlainCommandSummaryParts(renderSearchContentInPathSummary(intent.path, status, t));
  }
  const action = renderCommandIntent(intent, t);
  if (action === null) return null;
  return createPlainCommandSummaryParts(renderCommandActionSummary(action, status, t));
}

function renderCommandIntent(intent: CommandIntent, t: TranslateFn): string | null {
  if (intent.kind === "readFile") {
    return t("home.conversation.transcript.commandIntent.readFile", { path: intent.path });
  }
  if (intent.kind === "readFiles") {
    return t("home.conversation.transcript.commandIntent.readFiles", { paths: formatIntentPathList(intent.paths) });
  }
  if (intent.kind === "editFile") {
    return intent.path === null
      ? t("home.conversation.transcript.commandIntent.editFileUnspecified")
      : t("home.conversation.transcript.commandIntent.editFile", { path: intent.path });
  }
  if (intent.kind === "listDir") {
    return intent.path === null
      ? t("home.conversation.transcript.commandIntent.listRoot")
      : t("home.conversation.transcript.commandIntent.listPath", { path: intent.path });
  }
  if (intent.kind === "searchContent") {
    return intent.path === null
      ? t("home.conversation.transcript.commandIntent.searchContent", { pattern: intent.pattern })
      : t("home.conversation.transcript.commandIntent.searchContentInPath", { pattern: intent.pattern, path: intent.path });
  }
  if (intent.path === null && intent.pattern === null) {
    return t("home.conversation.transcript.commandIntent.searchFiles");
  }
  if (intent.path !== null && intent.pattern !== null) {
    return t("home.conversation.transcript.commandIntent.searchFilesInPathByPattern", { path: intent.path, pattern: intent.pattern });
  }
  if (intent.pattern !== null) {
    return t("home.conversation.transcript.commandIntent.searchFilesByPattern", { pattern: intent.pattern });
  }
  return t("home.conversation.transcript.commandIntent.searchFilesInPath", { path: intent.path ?? "" });
}

function createReadCommandSummaryParts(
  paths: readonly string[],
  status: CommandExecutionStatus,
  t: TranslateFn,
): CommandSummaryParts {
  const fileName = getFileChangeDisplayName(paths[0] ?? "");
  const prefix = readCommandPrefix(status, t);
  const suffix = paths.length > 1
    ? t("home.conversation.transcript.commandIntentSummary.read.moreFilesSuffix", { count: paths.length })
    : "";
  return { text: `${prefix}${fileName}${suffix}`, prefix, fileName, suffix };
}

function readCommandPrefix(status: CommandExecutionStatus, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.commandIntentSummary.read.completedPrefix");
  if (status === "failed") return t("home.conversation.transcript.commandIntentSummary.read.failedPrefix");
  if (status === "declined") return t("home.conversation.transcript.commandIntentSummary.read.declinedPrefix");
  return t("home.conversation.transcript.commandIntentSummary.read.runningPrefix");
}

function renderSearchContentInPathSummary(path: string, status: CommandExecutionStatus, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.commandIntentSummary.searchContentInPath.completed", { path });
  if (status === "failed") return t("home.conversation.transcript.commandIntentSummary.searchContentInPath.failed", { path });
  if (status === "declined") return t("home.conversation.transcript.commandIntentSummary.searchContentInPath.declined", { path });
  return t("home.conversation.transcript.commandIntentSummary.searchContentInPath.running", { path });
}

function renderCommandActionSummary(action: string, status: CommandExecutionStatus, t: TranslateFn): string {
  if (status === "completed") return t("home.conversation.transcript.commandIntentCompleted", { action });
  if (status === "failed") return t("home.conversation.transcript.commandIntentFailed", { action });
  if (status === "declined") return t("home.conversation.transcript.commandIntentDeclined", { action });
  return t("home.conversation.transcript.commandIntentRunning", { action });
}

function createPlainCommandSummaryParts(text: string): CommandSummaryParts {
  return { text, prefix: text, fileName: null, suffix: "" };
}

function formatIntentPathList(paths: readonly string[]): string {
  try {
    return new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format([...paths]);
  } catch {
    return paths.join(", ");
  }
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
