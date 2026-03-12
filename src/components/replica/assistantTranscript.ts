import type { ConversationMessage } from "../../domain/timeline";
import type { AuxiliaryBlock, ConversationRenderNode, TraceEntry } from "./localConversationGroups";
import { createTurnPlanDetailLines, createTurnPlanModel } from "./homeTurnPlanModel";
import {
  createDetailPanel,
  createShellBody,
  formatCommandFooterStatus,
  formatDuration,
  formatPatchFooterStatus,
  formatToolFooterStatus,
  joinDetailLines,
  joinMetaParts,
  safeJson,
  type AssistantTranscriptDetailPanel,
} from "./assistantTranscriptDetailModel";
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
  readonly variant?: AssistantTranscriptDetailPanel["variant"];
}
type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;
export function createAssistantTranscriptEntryModel(node: AssistantNode): AssistantTranscriptEntryModel {
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
    return createTraceModel(node.key, node.item);
  }

  return createAuxiliaryModel(node.key, node.entry);
}

function createTraceModel(key: string, entry: TraceEntry): AssistantTranscriptEntryModel {
  if (entry.kind === "commandExecution") return createCommandTraceModel(key, entry);
  if (entry.kind === "fileChange") return createFileChangeTraceModel(key, entry);
  if (entry.kind === "mcpToolCall") return createMcpTraceModel(key, entry);
  if (entry.kind === "dynamicToolCall") return createDynamicToolTraceModel(key, entry);
  if (entry.kind === "collabAgentToolCall") return createCollabAgentToolTraceModel(key, entry);
  if (entry.kind === "webSearch") {
    return createDetailsModel({
      key,
      summary: `网页搜索：${entry.query}`,
      detailPanel: createDetailBlockPanel({ body: entry.action === null ? null : safeJson(entry.action), label: "Search" }),
    });
  }

  return createDetailsModel({ key, summary: `查看图片：${entry.path}`, detailPanel: null });
}

function createCommandTraceModel(key: string, entry: Extract<TraceEntry, { kind: "commandExecution" }>): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: createCommandSummary(entry.command, entry.status),
    detailPanel: createDetailPanel({
      label: "Shell",
      body: createShellBody(entry.command, entry.output),
      footerMeta: joinMetaParts([
        `退出码：${entry.exitCode === null ? "-" : String(entry.exitCode)}`,
        `耗时：${formatDuration(entry.durationMs)}`,
      ]),
      footerStatus: formatCommandFooterStatus(entry.status),
      variant: "shell",
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createFileChangeTraceModel(key: string, entry: Extract<TraceEntry, { kind: "fileChange" }>): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: createFileChangeSummary(entry.status, entry.changes.length),
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        entry.changes.length > 0 ? "变更文件：" : null,
        ...entry.changes.map((change) => change.path),
        entry.output.trim().length > 0 ? entry.output : null,
      ]),
      label: "Patch",
      footerStatus: formatPatchFooterStatus(entry.status),
    }),
  });
}

function createMcpTraceModel(key: string, entry: Extract<TraceEntry, { kind: "mcpToolCall" }>): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: `工具调用：${entry.server}/${entry.tool}`,
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([`参数：${safeJson(entry.arguments)}`, entry.error?.message ?? safeJson(entry.result)]),
      label: "Tool",
      footerMeta: `耗时：${formatDuration(entry.durationMs)}`,
      footerStatus: formatToolFooterStatus(entry.status),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createDynamicToolTraceModel(key: string, entry: Extract<TraceEntry, { kind: "dynamicToolCall" }>): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: `工具调用：${entry.tool}`,
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        `参数：${safeJson(entry.arguments)}`,
        entry.contentItems.length > 0 ? safeJson(entry.contentItems) : null,
      ]),
      label: "Tool",
      footerMeta: `耗时：${formatDuration(entry.durationMs)}`,
      footerStatus: formatToolFooterStatus(entry.status),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createCollabAgentToolTraceModel(
  key: string,
  entry: Extract<TraceEntry, { kind: "collabAgentToolCall" }>,
): AssistantTranscriptEntryModel {
  return createDetailsModel({
    key,
    summary: `协作工具：${entry.tool}`,
    detailPanel: createDetailBlockPanel({
      body: joinDetailLines([
        `发送线程：${entry.senderThreadId}`,
        entry.receiverThreadIds.length > 0 ? `接收线程：${entry.receiverThreadIds.join(", ")}` : null,
        entry.prompt,
      ]),
      label: "Tool",
      footerStatus: formatToolFooterStatus(entry.status),
    }),
    truncateSummaryWhenCollapsed: true,
  });
}

function createAuxiliaryModel(key: string, entry: AuxiliaryBlock): AssistantTranscriptEntryModel {
  if (entry.kind === "plan") {
    return createDetailsModel({
      key,
      summary: entry.status === "streaming" ? "计划草稿更新中" : "计划草稿",
      detailPanel: createDetailBlockPanel({ body: entry.text, label: "Plan" }),
    });
  }

  if (entry.kind === "turnPlanSnapshot") {
    const planModel = createTurnPlanModel(entry);
    return createDetailsModel({
      key,
      summary: "任务清单",
      detailPanel: createDetailBlockPanel({
        body: joinDetailLines(createTurnPlanDetailLines(planModel)),
        label: "Plan",
      }),
    });
  }

  if (entry.kind === "turnDiffSnapshot") {
    return createDetailsModel({
      key,
      summary: "代码 diff 已更新",
      detailPanel: createDetailBlockPanel({ body: entry.diff, label: "Diff", variant: "diffSummary" }),
    });
  }

  if (entry.kind === "reviewMode") {
    return createLineModel(
      key,
      entry.state === "entered" ? `已进入 review 模式：${entry.review}` : `已退出 review 模式：${entry.review}`,
    );
  }

  if (entry.kind === "contextCompaction") {
    return createLineModel(key, "上下文已压缩");
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
    return createLineModel(key, `Realtime 会话 ${entry.status}${entry.message ? `：${entry.message}` : ""}`);
  }

  if (entry.kind === "realtimeAudio") {
    return createLineModel(
      key,
      `Realtime 音频块 #${entry.chunkIndex + 1}：${entry.audio.sampleRate} Hz，${entry.audio.numChannels} 声道`,
    );
  }

  if (entry.kind === "debug") {
    return createDetailsModel({
      key,
      summary: `调试：${entry.title}`,
      detailPanel: createDetailBlockPanel({ body: safeJson(entry.payload), label: "Debug" }),
    });
  }

  return createDetailsModel({
    key,
    summary: `模糊搜索：${entry.query}`,
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
  if (options.detailPanel === null || options.detailPanel.body.trim().length === 0) {
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

function createDetailBlockPanel(options: DetailBlockOptions): AssistantTranscriptDetailPanel | null {
  const body = options.body;

  if (body === null || body.trim().length === 0) {
    return null;
  }

  return createDetailPanel({ ...options, body });
}

function createCommandSummary(command: string, status: string): string {
  if (status === "completed") return `已执行命令：${command}`;
  if (status === "failed") return `命令失败：${command}`;
  if (status === "declined") return `命令已拒绝：${command}`;
  return `正在执行命令：${command}`;
}

function createFileChangeSummary(status: string, fileCount: number): string {
  if (status === "completed") return `已编辑 ${fileCount} 个文件`;
  if (status === "failed") return "文件编辑失败";
  if (status === "declined") return "文件编辑已拒绝";
  return "正在编辑文件";
}
