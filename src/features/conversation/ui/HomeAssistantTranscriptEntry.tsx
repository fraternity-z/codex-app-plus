import { ConversationMessageContent } from "./ConversationMessageContent";
import type { ConversationRenderNode } from "../model/localConversationGroups";
import { createAssistantTranscriptEntryModel, createCommandSummaryParts } from "../model/assistantTranscript";
import { createDetailPanel } from "../model/assistantTranscriptDetailModel";
import { createFileChangeSummaryParts } from "../model/fileChangeSummary";
import { HomeAssistantTranscriptDetailBlock } from "./HomeAssistantTranscriptDetailBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { HomePlanDraftCard } from "../../composer/ui/HomePlanDraftCard";
import type { TurnStatus } from "../../../protocol/generated/v2/TurnStatus";
import { useI18n } from "../../../i18n/useI18n";

type AssistantNode = Extract<ConversationRenderNode, { kind: "assistantMessage" | "reasoningBlock" | "traceItem" | "auxiliaryBlock" }>;

interface HomeAssistantTranscriptEntryProps {
  readonly node: AssistantNode;
  readonly turnStatus?: TurnStatus | null;
}

export function HomeAssistantTranscriptEntry(props: HomeAssistantTranscriptEntryProps): JSX.Element {
  const { t } = useI18n();
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
  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "turnDiffSnapshot") {
    if (props.turnStatus === "inProgress") {
      return <></>;
    }
    return (
      <section className="home-assistant-transcript-entry">
        <HomeAssistantTranscriptDetailBlock panel={createDetailPanel({ body: props.node.entry.diff, label: "Diff", variant: "diffSummary" })} />
      </section>
    );
  }
  if (props.node.kind === "auxiliaryBlock" && props.node.entry.kind === "contextCompaction") {
    const label = t("home.conversation.transcript.contextCompacted");
    return (
      <div className="home-assistant-transcript-entry home-assistant-transcript-divider" role="note" aria-label={label}>
        <span className="home-assistant-transcript-divider-line" aria-hidden="true" />
        <span className="home-assistant-transcript-divider-label">
          <span className="home-assistant-transcript-divider-icon" aria-hidden="true">↳</span>
          <span>{label}</span>
        </span>
        <span className="home-assistant-transcript-divider-line" aria-hidden="true" />
      </div>
    );
  }

  const model = createAssistantTranscriptEntryModel(props.node, t);
  const truncateSummaryWhenCollapsed = model.kind === "details" && model.truncateSummaryWhenCollapsed === true;
  const traceEntry = props.node.kind === "traceItem";
  const summaryContent = model.kind === "message" ? null : createSummaryContent(props.node, model.summary, t);

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
            <span className="home-assistant-transcript-summary-text">{summaryContent}</span>
          </summary>
          <HomeAssistantTranscriptDetailBlock panel={model.detailPanel} />
        </details>
      </section>
    );
  }

  return <p className={`home-assistant-transcript-entry home-assistant-transcript-line${traceEntry ? " home-assistant-transcript-line-trace" : ""}`}>{summaryContent}</p>;
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

function createSummaryContent(node: AssistantNode, summary: string, t: ReturnType<typeof useI18n>["t"]): JSX.Element | string {
  if (node.kind !== "traceItem") {
    return summary;
  }
  if (node.item.kind === "fileChange") {
    const parts = createFileChangeSummaryParts(node.item.status, node.item.changes);
    if (parts.fileName === null) {
      return parts.text;
    }
    return (
      <>
        {parts.prefix}
        <span className="home-assistant-transcript-file-name">{parts.fileName}</span>
        {parts.suffix}
      </>
    );
  }
  if (node.item.kind !== "commandExecution") {
    return summary;
  }
  const parts = createCommandSummaryParts(node.item.command, node.item.status, t);
  if (parts === null || parts.fileName === null) {
    return summary;
  }
  return (
    <>
      {parts.prefix}
      <span className="home-assistant-transcript-file-name">{parts.fileName}</span>
      {parts.suffix}
    </>
  );
}
