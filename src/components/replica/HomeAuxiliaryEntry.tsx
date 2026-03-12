import type {
  AuxiliaryBlock,
} from "./localConversationGroups";
import type { ConversationMessage, PlanEntry } from "../../domain/timeline";
import { ConversationMessageContent } from "./ConversationMessageContent";
import { HomeEntryCard } from "./HomeEntryCard";
import { TurnDiffSummaryList } from "./TurnDiffSummaryList";

interface HomeAuxiliaryEntryProps {
  readonly entry: AuxiliaryBlock;
}

export function HomeAuxiliaryEntry(props: HomeAuxiliaryEntryProps): JSX.Element {
  if (props.entry.kind === "plan") return <PlanBlock entry={props.entry} />;
  if (props.entry.kind === "turnPlanSnapshot") return <></>;
  if (props.entry.kind === "turnDiffSnapshot") return <DiffBlock entry={props.entry} />;
  if (props.entry.kind === "reviewMode") return <NoticeCard title={props.entry.state === "entered" ? "Entered review mode" : "Exited review mode"} detail={props.entry.review} />;
  if (props.entry.kind === "contextCompaction") return <NoticeCard title="Context compacted" detail="Older context was compacted by the app-server." />;
  if (props.entry.kind === "rawResponse") return <NoticeCard title={props.entry.title} detail={props.entry.detail} />;
  if (props.entry.kind === "systemNotice") return <NoticeCard title={props.entry.title} detail={props.entry.detail} status={props.entry.level} />;
  if (props.entry.kind === "realtimeSession") return <NoticeCard title={`Realtime session ${props.entry.status}`} detail={props.entry.message ?? props.entry.sessionId} />;
  if (props.entry.kind === "realtimeAudio") return <NoticeCard title={`Realtime audio chunk #${props.entry.chunkIndex + 1}`} detail={`${props.entry.audio.sampleRate} Hz · ${props.entry.audio.numChannels} channel(s)`} />;
  if (props.entry.kind === "debug") return <NoticeCard title={`Debug · ${props.entry.title}`} detail={JSON.stringify(props.entry.payload, null, 2)} status="info" />;
  return <FuzzySearchBlock entry={props.entry} />;
}

function PlanBlock(props: { readonly entry: PlanEntry }): JSX.Element {
  return <HomeEntryCard className="home-auxiliary-card" title="Plan draft" status={props.entry.status === "streaming" ? "streaming" : "done"}><ConversationMessageContent className="home-chat-markdown home-chat-markdown-assistant" message={createPlanMessage(props.entry)} /></HomeEntryCard>;
}

function DiffBlock(props: { readonly entry: Extract<AuxiliaryBlock, { kind: "turnDiffSnapshot" }> }): JSX.Element {
  return <HomeEntryCard className="home-auxiliary-card" title="代码 diff"><TurnDiffSummaryList diffText={props.entry.diff} /></HomeEntryCard>;
}

function FuzzySearchBlock(props: { readonly entry: Extract<AuxiliaryBlock, { kind: "fuzzySearch" }> }): JSX.Element {
  return <HomeEntryCard className="home-auxiliary-card" title={`Fuzzy search · ${props.entry.query}`} status={props.entry.status}><ul className="home-trace-list">{props.entry.files.slice(0, 8).map((file) => <li key={`${file.root}:${file.path}`}>{file.path}</li>)}</ul></HomeEntryCard>;
}

function NoticeCard(props: { readonly title: string; readonly detail: string | null; readonly status?: string }): JSX.Element {
  return <HomeEntryCard className="home-auxiliary-card" title={props.title} status={props.status}>{props.detail ? <pre className="home-trace-preview">{props.detail}</pre> : null}</HomeEntryCard>;
}

function createPlanMessage(entry: PlanEntry): ConversationMessage {
  return { id: entry.id, kind: "agentMessage", role: "assistant", threadId: entry.threadId, turnId: entry.turnId, itemId: entry.itemId, text: entry.text, status: entry.status };
}
