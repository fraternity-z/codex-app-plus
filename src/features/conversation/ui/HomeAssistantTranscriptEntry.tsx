import { ConversationMessageContent } from "./ConversationMessageContent";
import type { ConversationRenderNode } from "../model/localConversationGroups";
import { createAssistantTranscriptEntryModel } from "../model/assistantTranscript";
import { HomeAssistantTranscriptDetailBlock } from "./HomeAssistantTranscriptDetailBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { HomePlanDraftCard } from "../../composer/ui/HomePlanDraftCard";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
}

export function HomeAssistantTranscriptEntry(props: HomeAssistantTranscriptEntryProps): JSX.Element {
  if (props.node.kind === "reasoningBlock") {
    return <ReasoningTranscriptEntry block={props.node.block} />;
  }

  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "plan") {
    return (
      <article className="home-assistant-transcript-entry home-assistant-transcript-plan">
        <HomePlanDraftCard markdown={props.node.entry.text} />
      </article>
    );
  }

  const model = createAssistantTranscriptEntryModel(props.node);
  const truncateSummaryWhenCollapsed = model.kind === "details" && model.truncateSummaryWhenCollapsed === true;
  const traceEntry = props.node.kind === "traceItem";

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
      <section className={`home-assistant-transcript-entry home-assistant-transcript-details${traceEntry ? " home-assistant-transcript-details-trace" : ""}`}>
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

  return <p className={`home-assistant-transcript-entry home-assistant-transcript-line${traceEntry ? " home-assistant-transcript-line-trace" : ""}`}>{model.summary}</p>;
}

function ReasoningTranscriptEntry(props: { readonly block: Extract<AssistantNode, { kind: "reasoningBlock" }>["block"] }): JSX.Element {
  const hasBody = props.block.bodyMarkdown.trim().length > 0;

  if (!hasBody) {
    return (
      <section className="home-assistant-transcript-entry home-assistant-transcript-reasoning" data-kind="reasoning">
        <TranscriptMarkdown className="home-assistant-transcript-reasoning-title-markdown" text={props.block.titleMarkdown} variant="title" />
      </section>
    );
  }

  return (
    <section className="home-assistant-transcript-entry home-assistant-transcript-reasoning" data-kind="reasoning">
      <details className="home-assistant-transcript-reasoning-details">
        <summary className="home-assistant-transcript-line home-assistant-transcript-reasoning-summary">
          <TranscriptMarkdown className="home-assistant-transcript-reasoning-summary-markdown" text={props.block.titleMarkdown} variant="title" />
        </summary>
        <div className="home-assistant-transcript-reasoning-body">
          <TranscriptMarkdown className="home-assistant-transcript-reasoning-body-markdown" text={props.block.bodyMarkdown} />
        </div>
      </details>
    </section>
  );
}

function TranscriptMarkdown(props: { readonly className: string; readonly text: string; readonly variant?: "body" | "title" }): JSX.Element {
  return <MarkdownRenderer className={props.className} markdown={props.text} variant={props.variant} />;
}
