import type { TimelineEntry, TurnPlanSnapshotEntry } from "../../../domain/timeline";
import type { TurnPlanStep } from "../../../protocol/generated/v2/TurnPlanStep";

export interface TurnPlanModel {
  readonly entry: TurnPlanSnapshotEntry;
  readonly explanation: string | null;
  readonly totalSteps: number;
  readonly completedSteps: number;
}

export function selectLatestTurnPlan(entries: ReadonlyArray<TimelineEntry>): TurnPlanModel | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "turnPlanSnapshot") {
      return createTurnPlanModel(entry);
    }
  }
  return null;
}

export function removeTurnPlanEntries<T extends TimelineEntry>(entries: ReadonlyArray<T>): Array<T> {
  return entries.filter((entry) => entry.kind !== "turnPlanSnapshot");
}

export function createTurnPlanModel(entry: TurnPlanSnapshotEntry): TurnPlanModel {
  return {
    entry,
    explanation: normalizeExplanation(entry.explanation),
    totalSteps: entry.plan.length,
    completedSteps: entry.plan.filter((step) => step.status === "completed").length,
  };
}

export function formatTurnPlanStatusLabel(status: TurnPlanStep["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "inProgress") return "进行中";
  return "待开始";
}

export function createTurnPlanDetailLines(model: TurnPlanModel): Array<string> {
  const lines: Array<string> = [];
  if (model.explanation) {
    lines.push(model.explanation);
  }
  lines.push(`进度：完成 ${model.completedSteps} / 共 ${model.totalSteps}`);
  lines.push(...model.entry.plan.map((step, index) => `${index + 1}. ${step.step} · ${formatTurnPlanStatusLabel(step.status)}`));
  return lines;
}

function normalizeExplanation(explanation: string | null): string | null {
  if (!explanation) {
    return null;
  }
  const trimmed = explanation.trim();
  return trimmed.length === 0 ? null : trimmed;
}
