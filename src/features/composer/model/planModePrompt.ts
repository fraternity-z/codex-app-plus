import type { TimelineEntry } from "../../../domain/timeline";

const PROPOSED_PLAN_CLOSE_TAG = "</proposed_plan>";
const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>";

export interface PlanModePromptModel {
  readonly entryId: string;
  readonly turnId: string;
  readonly markdown: string;
}

export function selectLatestPlanModePrompt(entries: ReadonlyArray<TimelineEntry>): PlanModePromptModel | null {
  const latestTurnId = selectLatestTurnId(entries);
  if (latestTurnId === null) {
    return null;
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.turnId !== latestTurnId) {
      continue;
    }
    if (entry.kind === "plan" && entry.status === "done") {
      return { entryId: entry.id, turnId: entry.turnId, markdown: entry.text.trim() };
    }
    if (entry.kind === "agentMessage" && entry.status === "done") {
      const markdown = extractProposedPlanMarkdown(entry.text);
      if (markdown !== null) {
        return { entryId: entry.id, turnId: entry.turnId, markdown };
      }
    }
  }
  return null;
}

function selectLatestTurnId(entries: ReadonlyArray<TimelineEntry>): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const turnId = entries[index]?.turnId ?? null;
    if (turnId !== null) {
      return turnId;
    }
  }
  return null;
}

function extractProposedPlanMarkdown(text: string): string | null {
  const openIndex = text.indexOf(PROPOSED_PLAN_OPEN_TAG);
  if (openIndex < 0) {
    return null;
  }
  const planStart = openIndex + PROPOSED_PLAN_OPEN_TAG.length;
  const closeIndex = text.indexOf(PROPOSED_PLAN_CLOSE_TAG, planStart);
  if (closeIndex < 0) {
    return null;
  }
  const markdown = text.slice(planStart, closeIndex).trim();
  return markdown.length === 0 ? null : markdown;
}
