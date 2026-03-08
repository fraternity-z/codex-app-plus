import { ConversationMessageContent } from "./ConversationMessageContent";
import type { ConversationRenderNode } from "./localConversationGroups";
import { createAssistantTranscriptEntryModel } from "./assistantTranscript";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
}

export function HomeAssistantTranscriptEntry(props: HomeAssistantTranscriptEntryProps): JSX.Element {
  const model = createAssistantTranscriptEntryModel(props.node);

  if (model.kind === "message" && model.message) {
    return (
      <article className="home-assistant-transcript-entry home-assistant-transcript-message" data-status={model.message.status}>
        {model.message.text.trim().length > 0 ? (
          <ConversationMessageContent
            className="home-chat-markdown home-chat-markdown-assistant home-chat-markdown-inline"
            message={model.message}
            variant="assistant-inline"
          />
        ) : null}
        {model.showThinkingIndicator ? <p className="home-assistant-transcript-line home-assistant-transcript-thinking">正在思考…</p> : null}
      </article>
    );
  }

  if (model.kind === "details") {
    return (
      <section className="home-assistant-transcript-entry home-assistant-transcript-details">
        <details>
          <summary className="home-assistant-transcript-line">{model.summary}</summary>
          {model.detail ? <pre className="home-assistant-transcript-detail">{model.detail}</pre> : null}
        </details>
      </section>
    );
  }

  return <p className="home-assistant-transcript-entry home-assistant-transcript-line">{model.summary}</p>;
}
