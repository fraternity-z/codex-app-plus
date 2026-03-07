import type { ConversationMessage, PlanEntry, TurnDiffSnapshotEntry } from "../../domain/timeline";
import { ConversationMessageContent } from "./ConversationMessageContent";
import { HomeEntryCard } from "./HomeEntryCard";

interface HomeAuxiliaryEntryProps {
  readonly entry: PlanEntry | TurnDiffSnapshotEntry;
}

export function HomeAuxiliaryEntry(props: HomeAuxiliaryEntryProps): JSX.Element {
  return props.entry.kind === "plan" ? <PlanBlock entry={props.entry} /> : <DiffBlock entry={props.entry} />;
}

function PlanBlock(props: { readonly entry: PlanEntry }): JSX.Element {
  return (
    <HomeEntryCard className="home-auxiliary-card" title="计划草案" status={formatPlanStatus(props.entry.status)}>
      <ConversationMessageContent className="home-chat-markdown home-chat-markdown-assistant" message={createPlanMessage(props.entry)} />
    </HomeEntryCard>
  );
}

function DiffBlock(props: { readonly entry: TurnDiffSnapshotEntry }): JSX.Element {
  return (
    <HomeEntryCard className="home-auxiliary-card" title="聚合 Diff">
      <pre className="home-trace-preview">{props.entry.diff}</pre>
    </HomeEntryCard>
  );
}

function createPlanMessage(entry: PlanEntry): ConversationMessage {
  return {
    id: entry.id,
    kind: "agentMessage",
    role: "assistant",
    threadId: entry.threadId,
    turnId: entry.turnId,
    itemId: entry.itemId,
    text: entry.text,
    status: entry.status,
  };
}

function formatPlanStatus(status: PlanEntry["status"]): string {
  return status === "streaming" ? "生成中" : "已完成";
}
