import type { ServerRequestResolution } from "../../../domain/types";
import type { ConversationMessage } from "../../../domain/timeline";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { HomeAssistantTranscriptEntry } from "./HomeAssistantTranscriptEntry";
import { HomeChatMessage } from "./HomeChatMessage";
import { HomeRequestEntry } from "./HomeRequestEntry";
import type { ConversationRenderNode } from "../model/localConversationGroups";

interface HomeTimelineEntryProps {
  readonly node: ConversationRenderNode;
  readonly turnStatus: TurnStatus | null;
  readonly onResolveServerRequest: (resolution: ServerRequestResolution) => Promise<void>;
  readonly copiedMessageId: string | null;
  readonly canEditMessages: boolean;
  readonly onCopyMessage: (message: ConversationMessage) => void;
  readonly onEditUserMessage: (message: ConversationMessage, text: string) => Promise<void>;
}

export function HomeTimelineEntry(props: HomeTimelineEntryProps): JSX.Element | null {
  if (props.node.kind === "userBubble") {
    return (
      <HomeChatMessage
        message={props.node.message}
        copied={props.copiedMessageId === props.node.message.id}
        canEdit={props.canEditMessages}
        onCopyMessage={props.onCopyMessage}
        onEditUserMessage={props.onEditUserMessage}
      />
    );
  }
  if (props.node.kind === "requestBlock") {
    if (props.node.entry.kind === "pendingUserInput") {
      return null;
    }
    return <HomeRequestEntry entry={props.node.entry} onResolveServerRequest={props.onResolveServerRequest} />;
  }
  return (
    <HomeAssistantTranscriptEntry
      node={props.node}
      turnStatus={props.turnStatus}
    />
  );
}
