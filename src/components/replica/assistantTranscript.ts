import type { ConversationMessage } from "../../domain/timeline";
import type { AuxiliaryBlock, ConversationRenderNode, TraceEntry } from "./localConversationGroups";

const EMPTY_VALUE = "-";

export interface AssistantTranscriptEntryModel {
  readonly key: string;
  readonly kind: "message" | "line" | "details";
  readonly summary: string | null;
  readonly detail: string | null;
  readonly message?: ConversationMessage;
  readonly showThinkingIndicator?: boolean;
}

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

export function createAssistantTranscriptEntryModel(node: AssistantNode): AssistantTranscriptEntryModel {
  if (node.kind === "assistantMessage") {
    return {
      key: node.key,
      kind: "message",
      summary: null,
      detail: null,
      message: node.message,
      showThinkingIndicator: node.showThinkingIndicator,
    };
  }
  if (node.kind === "reasoningBlock") {
    return createLineModel(node.key, node.block.summary ?? "正在思考…");
  }
  if (node.kind === "traceItem") {
    return createTraceModel(node.key, node.item);
  }
  return createAuxiliaryModel(node.key, node.entry);
}

function createTraceModel(key: string, entry: TraceEntry): AssistantTranscriptEntryModel {
  if (entry.kind === "commandExecution") {
    return {
      key,
      kind: "details",
      summary: createCommandSummary(entry.command, entry.status),
      detail: joinDetailLines([
        `工作目录：${entry.cwd}`,
        `退出码：${entry.exitCode === null ? EMPTY_VALUE : String(entry.exitCode)}`,
        `耗时：${formatDuration(entry.durationMs)}`,
        entry.output.trim().length > 0 ? entry.output : null,
      ]),
    };
  }
  if (entry.kind === "fileChange") {
    return {
      key,
      kind: "details",
      summary: createFileChangeSummary(entry.status, entry.changes.length),
      detail: joinDetailLines([
        entry.changes.length > 0 ? "变更文件：" : null,
        ...entry.changes.map((change) => change.path),
        entry.output.trim().length > 0 ? entry.output : null,
      ]),
    };
  }
  if (entry.kind === "mcpToolCall") {
    return createDetailsModel(key, `工具调用：${entry.server}/${entry.tool}`, joinDetailLines([
      `参数：${safeJson(entry.arguments)}`,
      `耗时：${formatDuration(entry.durationMs)}`,
      entry.error?.message ?? safeJson(entry.result),
    ]));
  }
  if (entry.kind === "dynamicToolCall") {
    return createDetailsModel(key, `工具调用：${entry.tool}`, joinDetailLines([
      `参数：${safeJson(entry.arguments)}`,
      `状态：${formatToolStatus(entry.status)}`,
      `耗时：${formatDuration(entry.durationMs)}`,
      entry.contentItems.length > 0 ? safeJson(entry.contentItems) : null,
    ]));
  }
  if (entry.kind === "collabAgentToolCall") {
    return createDetailsModel(key, `协作工具：${entry.tool}`, joinDetailLines([
      `状态：${formatToolStatus(entry.status)}`,
      `发送线程：${entry.senderThreadId}`,
      entry.receiverThreadIds.length > 0 ? `接收线程：${entry.receiverThreadIds.join(", ")}` : null,
      entry.prompt,
    ]));
  }
  if (entry.kind === "webSearch") {
    return createDetailsModel(key, `网页搜索：${entry.query}`, entry.action === null ? null : safeJson(entry.action));
  }
  return createDetailsModel(key, `查看图片：${entry.path}`, null);
}

function createAuxiliaryModel(key: string, entry: AuxiliaryBlock): AssistantTranscriptEntryModel {
  if (entry.kind === "plan") {
    return createDetailsModel(key, entry.status === "streaming" ? "计划草稿更新中" : "计划草稿", entry.text);
  }
  if (entry.kind === "turnPlanSnapshot") {
    return createDetailsModel(key, "Turn plan", joinDetailLines([
      entry.explanation,
      ...entry.plan.map((step, index) => `${index + 1}. ${step.step} [${step.status}]`),
    ]));
  }
  if (entry.kind === "turnDiffSnapshot") {
    return createDetailsModel(key, "代码 diff 已更新", entry.diff);
  }
  if (entry.kind === "reviewMode") {
    return createLineModel(key, entry.state === "entered" ? `已进入 review 模式：${entry.review}` : `已退出 review 模式：${entry.review}`);
  }
  if (entry.kind === "contextCompaction") {
    return createLineModel(key, "上下文已压缩");
  }
  if (entry.kind === "rawResponse") {
    return createDetailsModel(key, entry.title, entry.detail ?? safeJson(entry.payload));
  }
  if (entry.kind === "systemNotice") {
    return createDetailsModel(key, entry.title, entry.detail);
  }
  if (entry.kind === "tokenUsage") {
    return createLineModel(key, `Token 使用已更新：input ${entry.usage.last.inputTokens}，output ${entry.usage.last.outputTokens}，total ${entry.usage.total.totalTokens}`);
  }
  if (entry.kind === "realtimeSession") {
    return createLineModel(key, `Realtime 会话 ${entry.status}${entry.message ? `：${entry.message}` : ""}`);
  }
  if (entry.kind === "realtimeAudio") {
    return createLineModel(key, `Realtime 音频块 #${entry.chunkIndex + 1}：${entry.audio.sampleRate} Hz，${entry.audio.numChannels} 声道`);
  }
  return createDetailsModel(key, `模糊搜索：${entry.query}`, entry.files.length === 0 ? null : entry.files.map((file) => file.path).join("\n"));
}

function createLineModel(key: string, summary: string): AssistantTranscriptEntryModel {
  return { key, kind: "line", summary, detail: null };
}

function createDetailsModel(key: string, summary: string, detail: string | null): AssistantTranscriptEntryModel {
  if (detail === null || detail.trim().length === 0) {
    return createLineModel(key, summary);
  }
  return { key, kind: "details", summary, detail };
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

function formatToolStatus(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "进行中";
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return EMPTY_VALUE;
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function safeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function joinDetailLines(lines: ReadonlyArray<string | null>): string | null {
  const normalized = lines.filter((line): line is string => line !== null && line.trim().length > 0);
  return normalized.length === 0 ? null : normalized.join("\n");
}
