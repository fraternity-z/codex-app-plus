import type { TimelineEntry, TurnPlanSnapshotEntry } from "../../../domain/timeline";
import type { MessageKey } from "../../../i18n/messages/schema";
import type { TranslationParams } from "../../../i18n/types";
import type { TurnPlanStep } from "../../../protocol/generated/v2/TurnPlanStep";

export interface TurnPlanModel {
  readonly entry: TurnPlanSnapshotEntry;
  readonly explanation: string | null;
  readonly totalSteps: number;
  readonly completedSteps: number;
}

export interface TurnPlanOverview {
  readonly additions: number | null;
  readonly changedFiles: number;
  readonly deletions: number | null;
  readonly generatedImages: number;
}

type TranslateFn = (key: MessageKey, params?: TranslationParams) => string;

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

export function formatTurnPlanStatusLabel(status: TurnPlanStep["status"], t: TranslateFn): string {
  if (status === "completed") return t("home.turnPlan.status.completed");
  if (status === "inProgress") return t("home.turnPlan.status.inProgress");
  return t("home.turnPlan.status.pending");
}

export function createTurnPlanDetailLines(model: TurnPlanModel, t: TranslateFn): Array<string> {
  const lines: Array<string> = [];
  if (model.explanation) {
    lines.push(model.explanation);
  }
  lines.push(t("home.turnPlan.progress", { completed: model.completedSteps, total: model.totalSteps }));
  lines.push(...model.entry.plan.map((step, index) => `${index + 1}. ${step.step} · ${formatTurnPlanStatusLabel(step.status, t)}`));
  return lines;
}

function normalizeExplanation(explanation: string | null): string | null {
  if (!explanation) {
    return null;
  }
  const trimmed = explanation.trim();
  return trimmed.length === 0 ? null : trimmed;
}
