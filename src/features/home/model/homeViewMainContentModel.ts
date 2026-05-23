import type { GitStatusOutput, GitWorkspaceDiffOutput } from "../../../bridge/types";
import { createSubagentDisplayMetadata } from "../../../domain/subagentSource";
import type { PendingUserInputEntry, TimelineEntry } from "../../../domain/timeline";
import type { ThreadSummary } from "../../../domain/types";
import {
  createTurnPlanModel,
  type TurnPlanBackgroundTask,
  type TurnPlanModel,
  type TurnPlanOverview,
} from "../../conversation/model/homeTurnPlanModel";
import { parseTurnDiffSummary } from "../../conversation/model/turnDiffSummaryModel";
import { selectLatestPendingUserInput } from "../../conversation/model/homeUserInputPromptModel";
import {
  selectLatestPlanModePrompt,
  type PlanModePromptModel,
} from "../../composer/model/planModePrompt";
interface HomeConversationPlaceholder {
  readonly title: string;
  readonly body: string;
}

interface DeriveHomeViewMainContentStateOptions {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly selectedConversationLoading: boolean;
  readonly selectedThread: ThreadSummary | null;
}

export interface HomeViewMainContentState {
  readonly conversationActive: boolean;
  readonly currentTurnPlan: TurnPlanModel | null;
  readonly latestPlanPrompt: PlanModePromptModel | null;
  readonly pendingUserInput: PendingUserInputEntry | null;
  readonly placeholder: HomeConversationPlaceholder | null;
  readonly renderableActivities: ReadonlyArray<TimelineEntry>;
}

const LOADING_PLACEHOLDER: HomeConversationPlaceholder = {
  title: "Loading thread",
  body: "Historical turns and items are being restored.",
};

const OPEN_THREAD_PLACEHOLDER: HomeConversationPlaceholder = {
  title: "Thread opened",
  body: "New plans, tools, approvals, realtime updates, and file changes appear here.",
};

export function deriveHomeViewMainContentState(
  options: DeriveHomeViewMainContentStateOptions,
): HomeViewMainContentState {
  const { activities, selectedConversationLoading, selectedThread } = options;
  const renderableActivities: TimelineEntry[] = [];
  let currentTurnPlan: TurnPlanModel | null = null;

  for (let index = 0; index < activities.length; index += 1) {
    const entry = activities[index];
    if (entry.kind === "turnPlanSnapshot") {
      currentTurnPlan = createTurnPlanModel(entry);
      continue;
    }
    renderableActivities.push(entry);
  }

  const pendingUserInput = selectLatestPendingUserInput(activities);
  const latestPlanPrompt = selectLatestPlanModePrompt(activities);

  return {
    conversationActive: selectedConversationLoading
      || selectedThread !== null
      || activities.length > 0,
    currentTurnPlan,
    latestPlanPrompt,
    pendingUserInput,
    placeholder: selectedConversationLoading
      ? LOADING_PLACEHOLDER
      : selectedThread !== null
        ? OPEN_THREAD_PLACEHOLDER
        : null,
    renderableActivities,
  };
}

export function createTurnPlanChangeKey(
  plan: Pick<TurnPlanModel, "entry" | "totalSteps" | "completedSteps">,
): string {
  return `${plan.entry.id}:${plan.totalSteps}:${plan.completedSteps}`;
}

export function createTurnPlanOverview(options: {
  readonly activities: ReadonlyArray<TimelineEntry>;
  readonly diffItems: ReadonlyArray<GitWorkspaceDiffOutput>;
  readonly gitStatus: GitStatusOutput | null | undefined;
  readonly plan: TurnPlanModel | null;
  readonly threads?: ReadonlyArray<ThreadSummary>;
}): TurnPlanOverview {
  const turnId = options.plan?.entry.turnId ?? null;
  const scopedActivities = turnId === null
    ? options.activities
    : options.activities.filter((entry) => entry.turnId === turnId);
  const latestTurnDiff = selectLatestTurnDiff(scopedActivities) ?? selectLatestTurnDiff(options.activities);
  const parsedTurnDiff = latestTurnDiff === null ? null : parseTurnDiffSummary(latestTurnDiff.diff);
  const turnDiffSummary = parsedTurnDiff === null
    ? null
    : {
      additions: parsedTurnDiff.additions,
      changedFiles: parsedTurnDiff.files.length,
      deletions: parsedTurnDiff.deletions,
    };
  const diffItemsSummary = summarizeDiffItems(options.diffItems);
  const diffSummary = turnDiffSummary ?? diffItemsSummary;
  const fallbackChangedFiles = countStatusChanges(options.gitStatus);

  return {
    additions: diffSummary?.additions ?? null,
    backgroundTasks: createTurnPlanBackgroundTasks(scopedActivities, options.threads ?? []),
    changedFiles: diffSummary?.changedFiles ?? fallbackChangedFiles,
    deletions: diffSummary?.deletions ?? null,
    generatedImages: countGeneratedImages(scopedActivities),
  };
}

function selectLatestTurnDiff(entries: ReadonlyArray<TimelineEntry>) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "turnDiffSnapshot") {
      return entry;
    }
  }
  return null;
}

function summarizeDiffItems(items: ReadonlyArray<GitWorkspaceDiffOutput>): {
  readonly additions: number;
  readonly changedFiles: number;
  readonly deletions: number;
} | null {
  if (items.length === 0) {
    return null;
  }
  return {
    additions: items.reduce((total, item) => total + item.additions, 0),
    changedFiles: items.length,
    deletions: items.reduce((total, item) => total + item.deletions, 0),
  };
}

function countStatusChanges(status: GitStatusOutput | null | undefined): number {
  if (status === null) {
    return 0;
  }
  if (status === undefined) {
    return 0;
  }
  return (status.staged?.length ?? 0)
    + (status.unstaged?.length ?? 0)
    + (status.untracked?.length ?? 0)
    + (status.conflicted?.length ?? 0);
}

function countGeneratedImages(entries: ReadonlyArray<TimelineEntry>): number {
  return entries.filter((entry) => (
    entry.kind === "imageGeneration"
    && (entry.savedPath !== null || entry.result.trim().length > 0)
  )).length;
}

function createTurnPlanBackgroundTasks(
  entries: ReadonlyArray<TimelineEntry>,
  threads: ReadonlyArray<ThreadSummary>,
): Array<TurnPlanBackgroundTask> {
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const tasks: Array<TurnPlanBackgroundTask> = [];
  const seenSubagentIds = new Set<string>();

  for (const entry of entries) {
    if (entry.kind === "commandExecution" && entry.status === "inProgress") {
      const label = entry.command.trim();
      tasks.push({
        id: entry.id,
        kind: "command",
        label: label.length > 0 ? label : entry.id,
      });
      continue;
    }

    if (entry.kind !== "collabAgentToolCall") {
      continue;
    }

    for (const threadId of getCollabAgentThreadIds(entry)) {
      const state = entry.agentsStates[threadId] ?? null;
      if ((state === null && entry.status !== "inProgress") || (state !== null && !isRunningCollabAgentStatus(state.status))) {
        continue;
      }
      if (seenSubagentIds.has(threadId)) {
        continue;
      }
      seenSubagentIds.add(threadId);
      tasks.push(createSubagentBackgroundTask(entry.id, threadId, threadById.get(threadId) ?? null));
    }
  }

  return tasks;
}

function getCollabAgentThreadIds(entry: Extract<TimelineEntry, { kind: "collabAgentToolCall" }>): Array<string> {
  const ids: string[] = [];
  for (const id of entry.receiverThreadIds) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  for (const id of Object.keys(entry.agentsStates)) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function isRunningCollabAgentStatus(
  status: NonNullable<Extract<TimelineEntry, { kind: "collabAgentToolCall" }>["agentsStates"][string]>["status"],
): boolean {
  return status === "pendingInit" || status === "running";
}

function createSubagentBackgroundTask(
  entryId: string,
  threadId: string,
  thread: ThreadSummary | null,
): TurnPlanBackgroundTask {
  const metadata = createSubagentDisplayMetadata(thread, threadId);

  return {
    detail: metadata.detail,
    id: `${entryId}:${threadId}`,
    kind: "subagent",
    label: metadata.label,
    threadId,
  };
}
