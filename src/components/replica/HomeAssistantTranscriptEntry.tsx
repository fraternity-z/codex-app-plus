import { ConversationMessageContent } from "./ConversationMessageContent";
import type { ConversationRenderNode } from "./localConversationGroups";
import { createAssistantTranscriptEntryModel } from "./assistantTranscript";
import { HomeAssistantTranscriptDetailBlock } from "./HomeAssistantTranscriptDetailBlock";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
}

export function HomeAssistantTranscriptEntry(props: HomeAssistantTranscriptEntryProps): JSX.Element {
  const model = createAssistantTranscriptEntryModel(props.node);
  const truncateSummaryWhenCollapsed = model.kind === "details" && model.truncateSummaryWhenCollapsed === true;

  if (model.kind === "message" && model.message) {
    if (model.message.text.trim().length === 0) {
      return <></>;
    }

    return (
      <article className="home-assistant-transcript-entry home-assistant-transcript-message" data-status={model.message.status}>
        <ConversationMessageContent
          className="home-chat-markdown home-chat-markdown-assistant home-chat-markdown-inline"
          message={model.message}
          variant="assistant-inline"
        />
      </article>
    );
  }

  if (model.kind === "details") {
    return (
      <section className="home-assistant-transcript-entry home-assistant-transcript-details">
        <details>
          <summary
            className="home-assistant-transcript-line home-assistant-transcript-summary"
            data-truncate-summary={truncateSummaryWhenCollapsed ? "true" : undefined}
          >
            <span className="home-assistant-transcript-summary-text">{model.summary}</span>
          </summary>
          <HomeAssistantTranscriptDetailBlock panel={model.detailPanel} />
        </details>
      </section>
    );
  }

  return <p className="home-assistant-transcript-entry home-assistant-transcript-line">{model.summary}</p>;
}
