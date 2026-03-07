import type {
  CollabAgentToolCallEntry,
  CommandExecutionEntry,
  DynamicToolCallEntry,
  FileChangeEntry,
  ImageViewEntry,
  McpToolCallEntry,
  WebSearchEntry,
} from "../../domain/timeline";
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
  return <HomeEntryCard className="home-trace-card" title={formatTraceTitle(props.entry)} status={formatTraceStatus(props.entry)} meta={formatTraceMeta(props.entry)}>{renderTraceBody(props.entry)}</HomeEntryCard>;
}

function renderTraceBody(entry: TraceEntry): JSX.Element {
  if (entry.kind === "commandExecution") return <CommandTraceDetails entry={entry} />;
  if (entry.kind === "mcpToolCall") return <McpTraceDetails entry={entry} />;
  if (entry.kind === "dynamicToolCall") return <DynamicToolTraceDetails entry={entry} />;
  if (entry.kind === "collabAgentToolCall") return <CollabTraceDetails entry={entry} />;
  if (entry.kind === "webSearch") return <WebSearchTraceDetails entry={entry} />;
  if (entry.kind === "imageView") return <ImageTraceDetails entry={entry} />;
  return <FileTraceDetails entry={entry} />;
}

function CommandTraceDetails(props: { readonly entry: CommandExecutionEntry }): JSX.Element {
  const outputPreview = createOutputPreview(props.entry.output);
  return <><pre className="home-trace-code">{props.entry.command}</pre><p className="home-trace-caption">{props.entry.cwd}</p>{outputPreview ? <pre className="home-trace-preview">{outputPreview}</pre> : null}<p className="home-trace-caption">exit {props.entry.exitCode ?? "-"} · {formatDuration(props.entry.durationMs)}</p></>;
}

function McpTraceDetails(props: { readonly entry: McpToolCallEntry }): JSX.Element {
  const argumentSummary = summarizeValue(props.entry.arguments);
  const resultSummary = props.entry.error ? props.entry.error.message : summarizeValue(props.entry.result);
  return <><div className="home-trace-summary-grid"><TraceSummary label="Arguments" value={argumentSummary} /><TraceSummary label={props.entry.error ? "Error" : "Result"} value={resultSummary} /></div>{props.entry.progress.length > 0 ? <pre className="home-trace-preview">{props.entry.progress.join("\n")}</pre> : null}</>;
}

function DynamicToolTraceDetails(props: { readonly entry: DynamicToolCallEntry }): JSX.Element {
  return <div className="home-trace-summary-grid"><TraceSummary label="Arguments" value={summarizeValue(props.entry.arguments)} /><TraceSummary label="Output" value={props.entry.contentItems.map((item) => item.type === "inputText" ? item.text : item.imageUrl).join("\n") || "No output"} /></div>;
}

function CollabTraceDetails(props: { readonly entry: CollabAgentToolCallEntry }): JSX.Element {
  return <><p className="home-trace-caption">{`sender ${props.entry.senderThreadId}`}</p>{props.entry.prompt ? <pre className="home-trace-preview">{props.entry.prompt}</pre> : null}<ul className="home-trace-list">{Object.entries(props.entry.agentsStates).map(([id, state]) => <li key={id}>{`${id}: ${state.status}${state.message ? ` — ${state.message}` : ""}`}</li>)}</ul></>;
}

function WebSearchTraceDetails(props: { readonly entry: WebSearchEntry }): JSX.Element {
  return <div className="home-trace-summary-grid"><TraceSummary label="Query" value={props.entry.query} /><TraceSummary label="Action" value={props.entry.action ? summarizeValue(props.entry.action) : "None"} /></div>;
}

function ImageTraceDetails(props: { readonly entry: ImageViewEntry }): JSX.Element {
  return <div className="home-trace-summary-grid"><TraceSummary label="Image path" value={props.entry.path} /><TraceSummary label="Preview" value="Open in the thread view" /></div>;
}

function FileTraceDetails(props: { readonly entry: FileChangeEntry }): JSX.Element {
  const previewPaths = props.entry.changes.slice(0, MAX_FILE_ITEMS);
  const hiddenCount = props.entry.changes.length - previewPaths.length;
  const outputPreview = createOutputPreview(props.entry.output);
  return <><ul className="home-trace-list">{previewPaths.map((change, index) => <li key={`${change.path}-${index}`}>{change.path}</li>)}{hiddenCount > 0 ? <li>{`+${hiddenCount} more`}</li> : null}</ul>{outputPreview ? <pre className="home-trace-preview">{outputPreview}</pre> : null}</>;
}

function TraceSummary(props: { readonly label: string; readonly value: string }): JSX.Element {
  return <div className="home-trace-summary-item"><span>{props.label}</span><p>{props.value}</p></div>;
}

function formatTraceTitle(entry: TraceEntry): string {
  if (entry.kind === "commandExecution") return "Command execution";
  if (entry.kind === "mcpToolCall") return `MCP tool · ${entry.tool}`;
  if (entry.kind === "dynamicToolCall") return `Tool call · ${entry.tool}`;
  if (entry.kind === "collabAgentToolCall") return `Collab agent · ${entry.tool}`;
  if (entry.kind === "webSearch") return "Web search";
  if (entry.kind === "imageView") return "Image preview";
  return "File change";
}

function formatTraceMeta(entry: TraceEntry): string | null {
  if (entry.kind === "commandExecution") return entry.processId ? `pid ${entry.processId}` : null;
  if (entry.kind === "mcpToolCall") return entry.durationMs === null ? entry.server : `${entry.server} · ${formatDuration(entry.durationMs)}`;
  if (entry.kind === "dynamicToolCall") return formatDuration(entry.durationMs);
  if (entry.kind === "collabAgentToolCall") return `${entry.receiverThreadIds.length} target(s)`;
  if (entry.kind === "webSearch") return entry.action?.type ?? null;
  if (entry.kind === "imageView") return null;
  return `${entry.changes.length} change(s)`;
}

function formatTraceStatus(entry: TraceEntry): string {
  if (entry.kind === "commandExecution") return entry.status;
  if (entry.kind === "fileChange") return entry.status;
  if (entry.kind === "mcpToolCall") return entry.status;
  if (entry.kind === "dynamicToolCall") return entry.status;
  if (entry.kind === "collabAgentToolCall") return entry.status;
  return "completed";
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "running";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function createOutputPreview(value: string): string | null {
  if (value.trim().length === 0) return null;
  const lines = value.trim().split(/\r?\n/).slice(0, MAX_OUTPUT_LINES).join("\n");
  return lines.length > MAX_PREVIEW_CHARS ? `${lines.slice(0, MAX_PREVIEW_CHARS)}${ELLIPSIS}` : lines;
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS)}${ELLIPSIS}` : value;
  try {
    const serialized = JSON.stringify(value, null, 2) ?? "None";
    return serialized.length > MAX_VALUE_CHARS ? `${serialized.slice(0, MAX_VALUE_CHARS)}${ELLIPSIS}` : serialized;
  } catch {
    return String(value);
  }
}
