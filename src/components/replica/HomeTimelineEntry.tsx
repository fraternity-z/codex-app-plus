import type { ServerRequestResolution } from "../../domain/types";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";
import { HomeChatMessage } from "./HomeChatMessage";
import { HomeRequestEntry } from "./HomeRequestEntry";
import type { ConversationRenderNode } from "./localConversationGroups";

interface HomeTimelineEntryProps {
  readonly node: ConversationRenderNode;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
}

export function HomeTimelineEntry(props: HomeTimelineEntryProps): JSX.Element | null {
  if (props.node.kind === "userBubble") {
    return <HomeChatMessage message={props.node.message} />;
  }
  if (props.node.kind === "assistantMessage") {
    return <HomeAssistantTranscriptEntry node={props.node} />;
  }
  if (props.node.kind === "reasoningBlock") {
    return <HomeAssistantTranscriptEntry node={props.node} />;
  }
  if (props.node.kind === "traceItem") {
    return <HomeAssistantTranscriptEntry node={props.node} />;
  }
  if (props.node.kind === "requestBlock") {
    if (props.node.entry.kind === "pendingUserInput") {
      return null;
    }
    return <HomeRequestEntry entry={props.node.entry} onResolveServerRequest={props.onResolveServerRequest} />;
  }
  return <HomeAssistantTranscriptEntry node={props.node} />;
}
