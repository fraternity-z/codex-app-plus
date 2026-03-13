import { stripConnectionRetryLines } from "../../home/model/homeConnectionRetry";

const EMPTY_VALUE = "-";

export type AssistantTranscriptDetailPanelVariant = "generic" | "shell" | "diffSummary";

export interface AssistantTranscriptDetailPanel {
  readonly label: string;
  readonly body: string;
  readonly topMeta: string | null;
  readonly footerMeta: string | null;
  readonly footerStatus: string | null;
  readonly variant: AssistantTranscriptDetailPanelVariant;
}

interface DetailPanelOptions {
  readonly label: string;
  readonly body: string;
  readonly topMeta?: string | null;
  readonly footerMeta?: string | null;
  readonly footerStatus?: string | null;
  readonly variant?: AssistantTranscriptDetailPanelVariant;
}

export function createDetailPanel(options: DetailPanelOptions): AssistantTranscriptDetailPanel {
  return {
    label: options.label,
    body: options.body,
    topMeta: options.topMeta ?? null,
    footerMeta: options.footerMeta ?? null,
    footerStatus: options.footerStatus ?? null,
    variant: options.variant ?? "generic",
  };
}

export function createShellBody(command: string, output: string): string {
  const visibleOutput = stripConnectionRetryLines(output);
  return visibleOutput.trim().length === 0 ? `$ ${command}` : `$ ${command}\n\n${visibleOutput}`;
}

export function formatCommandFooterStatus(status: string): string {
  if (status === "completed") return "成功";
  if (status === "failed") return "失败";
  if (status === "declined") return "已拒绝";
  return "执行中";
}

export function formatPatchFooterStatus(status: string): string {
  if (status === "completed") return "成功";
  if (status === "failed") return "失败";
  if (status === "declined") return "已拒绝";
  return "进行中";
}

export function formatToolFooterStatus(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  return "进行中";
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return EMPTY_VALUE;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function joinDetailLines(lines: ReadonlyArray<string | null>): string | null {
  const normalized = lines.filter((line): line is string => line !== null && line.trim().length > 0);
  return normalized.length === 0 ? null : normalized.join("\n");
}

export function joinMetaParts(parts: ReadonlyArray<string | null>): string | null {
  const normalized = parts.filter((part): part is string => part !== null && part.trim().length > 0);
  return normalized.length === 0 ? null : normalized.join(" · ");
}

export function safeJson(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
