import type { ServerRequestResolution } from "../../domain/types";
import { HomeAuxiliaryEntry } from "./HomeAuxiliaryEntry";
import { HomeChatMessage } from "./HomeChatMessage";
import { HomeRequestEntry } from "./HomeRequestEntry";
import { HomeThinkingBlock } from "./HomeThinkingBlock";
import { HomeTraceEntry } from "./HomeTraceEntry";
import type { ConversationRenderNode } from "./localConversationGroups";

interface HomeTimelineEntryProps {
  readonly node: ConversationRenderNode;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

export function HomeTimelineEntry(props: HomeTimelineEntryProps): JSX.Element {
  if (props.node.kind === "userBubble" || props.node.kind === "assistantMessage") {
    return <HomeChatMessage message={props.node.message} />;
  }
  if (props.node.kind === "thinkingBlock") {
    return <HomeThinkingBlock block={props.node.block} />;
  }
  if (props.node.kind === "traceItem") {
    return <HomeTraceEntry entry={props.node.item} />;
  }
  if (props.node.kind === "requestBlock") {
    return <HomeRequestEntry entry={props.node.entry} onResolveServerRequest={props.onResolveServerRequest} />;
  }
  return <HomeAuxiliaryEntry entry={props.node.entry} />;
}
