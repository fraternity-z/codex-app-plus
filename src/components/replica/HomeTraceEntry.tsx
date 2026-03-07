import type { CommandExecutionEntry, FileChangeEntry, McpToolCallEntry } from "../../domain/timeline";
import { HomeEntryCard } from "./HomeEntryCard";
import type { TraceEntry } from "./localConversationGroups";

const ELLIPSIS = "…";
const MAX_FILE_ITEMS = 4;
const MAX_OUTPUT_LINES = 10;
const MAX_PREVIEW_CHARS = 420;
const MAX_VALUE_CHARS = 180;

interface HomeTraceEntryProps {
  readonly entry: TraceEntry;
}

export function HomeTraceEntry(props: HomeTraceEntryProps): JSX.Element {
  return (
    <HomeEntryCard
      className="home-trace-card"
      title={formatTraceTitle(props.entry)}
      status={formatTraceStatus(props.entry.status)}
      meta={formatTraceMeta(props.entry)}
    >
      {renderTraceBody(props.entry)}
    </HomeEntryCard>
  );
}

function renderTraceBody(entry: TraceEntry): JSX.Element {
  if (entry.kind === "commandExecution") {
    return <CommandTraceDetails entry={entry} />;
  }
  if (entry.kind === "mcpToolCall") {
    return <McpTraceDetails entry={entry} />;
  }
  return <FileTraceDetails entry={entry} />;
}

function CommandTraceDetails(props: { readonly entry: CommandExecutionEntry }): JSX.Element {
  const outputPreview = createOutputPreview(props.entry.output);
  return (
    <>
      <pre className="home-trace-code">{props.entry.command}</pre>
      <p className="home-trace-caption">{props.entry.cwd}</p>
      {outputPreview ? <pre className="home-trace-preview">{outputPreview}</pre> : null}
      <p className="home-trace-caption">exit {props.entry.exitCode ?? "-"} · {formatDuration(props.entry.durationMs)}</p>
    </>
  );
}

function McpTraceDetails(props: { readonly entry: McpToolCallEntry }): JSX.Element {
  const argumentSummary = summarizeValue(props.entry.arguments);
  const resultSummary = props.entry.error ? props.entry.error.message : summarizeValue(props.entry.result);
  return (
    <div className="home-trace-summary-grid">
      <TraceSummary label="参数" value={argumentSummary} />
      <TraceSummary label={props.entry.error ? "错误" : "结果"} value={resultSummary} />
    </div>
  );
}

function FileTraceDetails(props: { readonly entry: FileChangeEntry }): JSX.Element {
  const previewPaths = props.entry.changes.slice(0, MAX_FILE_ITEMS);
  const hiddenCount = props.entry.changes.length - previewPaths.length;
  const outputPreview = createOutputPreview(props.entry.output);
  return (
    <>
      <ul className="home-trace-list">
        {previewPaths.map((change, index) => <li key={`${change.path}-${index}`}>{change.path}</li>)}
        {hiddenCount > 0 ? <li>{`+${hiddenCount} 项变更`}</li> : null}
      </ul>
      {outputPreview ? <pre className="home-trace-preview">{outputPreview}</pre> : null}
    </>
  );
}

function TraceSummary(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div className="home-trace-summary-item">
      <span>{props.label}</span>
      <p>{props.value}</p>
    </div>
  );
}

function formatTraceTitle(entry: TraceEntry): string {
  if (entry.kind === "commandExecution") {
    return "命令执行";
  }
  if (entry.kind === "mcpToolCall") {
    return `工具调用 · ${entry.tool}`;
  }
  return "文件变更";
}

function formatTraceMeta(entry: TraceEntry): string | null {
  if (entry.kind === "commandExecution") {
    return entry.processId ? `pid ${entry.processId}` : null;
  }
  if (entry.kind === "mcpToolCall") {
    return entry.durationMs === null ? entry.server : `${entry.server} · ${formatDuration(entry.durationMs)}`;
  }
  return `${entry.changes.length} 项`;
}

function formatTraceStatus(status: string): string {
  if (status === "inProgress") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "declined") return "已拒绝";
  if (status === "interrupted") return "已中断";
  if (status === "pending") return "等待中";
  if (status === "applied") return "已应用";
  if (status === "approved") return "已批准";
  return status;
}

function formatDuration(durationMs: number | null): string {
  return durationMs === null ? "耗时 -" : `耗时 ${durationMs}ms`;
}

function createOutputPreview(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/);
  return truncateText(lines.slice(-MAX_OUTPUT_LINES).join("\n"), MAX_PREVIEW_CHARS);
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return truncateText(value, MAX_VALUE_CHARS);
  }
  try {
    return truncateText(JSON.stringify(value), MAX_VALUE_CHARS);
  } catch {
    return "[unserializable]";
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}${ELLIPSIS}` : value;
}
