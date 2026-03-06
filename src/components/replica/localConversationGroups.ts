import type {
  ConversationMessage,
  TimelineEntry,
} from "../../domain/types";
import type {
  PendingApprovalEntry,
  PendingUserInputEntry,
  PlanEntry,
  TurnDiffSnapshotEntry,
} from "../../domain/timeline";

export interface ConversationRenderGroup {
  readonly key: string;
  readonly turnId: string | null;
  readonly userItems: Array<ConversationMessage>;
  readonly agentItems: Array<TimelineEntry>;
  readonly assistantItem: ConversationMessage | null;
  readonly proposedPlanItem: PlanEntry | null;
  readonly unifiedDiffItem: TurnDiffSnapshotEntry | null;
  readonly approvalItem: PendingApprovalEntry | null;
  readonly userInputItem: PendingUserInputEntry | null;
}

function isAgentBodyItem(item: TimelineEntry): boolean {
  switch (item.kind) {
    case "agentMessage":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "reasoning":
    case "debug":
      return true;
    case "plan":
    case "turnDiffSnapshot":
    case "turnPlanSnapshot":
    case "pendingApproval":
    case "pendingUserInput":
    case "queuedFollowUp":
      return false;
    case "userMessage":
      return false;
  }
}

function groupActivitiesByTurn(entries: ReadonlyArray<TimelineEntry>): Array<Array<TimelineEntry>> {
  const groups: Array<Array<TimelineEntry>> = [];
  let current: Array<TimelineEntry> = [];
  let currentTurnId: string | null | undefined;

  for (const entry of entries) {
    const turnId = entry.turnId;
    if (current.length === 0) {
      current = [entry];
      currentTurnId = turnId;
      continue;
    }
    if (turnId !== null && currentTurnId !== null && turnId === currentTurnId) {
      current.push(entry);
      continue;
    }
    groups.push(current);
    current = [entry];
    currentTurnId = turnId;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function splitGroup(items: Array<TimelineEntry>, index: number): ConversationRenderGroup {
  const userItems: Array<ConversationMessage> = [];
  const agentItems: Array<TimelineEntry> = [];
  let proposedPlanItem: PlanEntry | null = null;
  let unifiedDiffItem: TurnDiffSnapshotEntry | null = null;
  let approvalItem: PendingApprovalEntry | null = null;
  let userInputItem: PendingUserInputEntry | null = null;
  let foundNonUserMessage = false;

  for (const item of items) {
    if (!foundNonUserMessage && item.kind === "userMessage") {
      userItems.push(item);
      continue;
    }

    foundNonUserMessage = true;

    if (item.kind === "turnDiffSnapshot") {
      unifiedDiffItem = item;
      continue;
    }
    if (item.kind === "plan") {
      proposedPlanItem = item;
      continue;
    }
    if (item.kind === "pendingApproval") {
      approvalItem = item;
      continue;
    }
    if (item.kind === "pendingUserInput") {
      userInputItem = item;
      continue;
    }
    if (item.kind === "userMessage") {
      agentItems.push(item);
      continue;
    }
    if (isAgentBodyItem(item)) {
      agentItems.push(item);
    }
  }

  const lastAgentItem = agentItems[agentItems.length - 1];
  const assistantItem = lastAgentItem?.kind === "agentMessage" ? lastAgentItem : null;
  if (assistantItem !== null) {
    agentItems.pop();
  }

  return {
    key: items[0]?.turnId ?? `group-${index}`,
    turnId: items[0]?.turnId ?? null,
    userItems,
    agentItems,
    assistantItem,
    proposedPlanItem,
    unifiedDiffItem,
    approvalItem,
    userInputItem
  };
}

export function splitActivitiesIntoRenderGroups(entries: ReadonlyArray<TimelineEntry>): Array<ConversationRenderGroup> {
  return groupActivitiesByTurn(entries).map((group, index) => splitGroup(group, index));
}
