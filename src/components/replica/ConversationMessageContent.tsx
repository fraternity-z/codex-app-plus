import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { ConversationMessage } from "../../domain/types";

const PROPOSED_PLAN_CLOSE_TAG = "</proposed_plan>";
const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>";

const MARKDOWN_COMPONENTS = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />
} satisfies Components;

const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks] as unknown as NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;

type MessageSegment = { readonly type: "markdown" | "proposed-plan"; readonly text: string };
type ConversationMessageContentVariant = "user-bubble" | "assistant-inline";

interface ConversationMessageContentProps {
  readonly className: string;
  readonly message: ConversationMessage;
  readonly variant?: ConversationMessageContentVariant;
}

export function ConversationMessageContent(props: ConversationMessageContentProps): JSX.Element {
  return (
    <div className={props.className}>
      {splitMessageSegments(props.message.text).map((segment, index) => renderSegment(segment, index, props.variant ?? "user-bubble"))}
    </div>
  );
}

function splitMessageSegments(text: string): ReadonlyArray<MessageSegment> {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const openIndex = text.indexOf(PROPOSED_PLAN_OPEN_TAG, cursor);
    if (openIndex < 0) {
      pushSegment(segments, "markdown", text.slice(cursor));
      return segments;
    }

    pushSegment(segments, "markdown", text.slice(cursor, openIndex));
    const planStart = openIndex + PROPOSED_PLAN_OPEN_TAG.length;
    const closeIndex = text.indexOf(PROPOSED_PLAN_CLOSE_TAG, planStart);
    if (closeIndex < 0) {
      pushSegment(segments, "markdown", text.slice(openIndex));
      return segments;
    }

    pushSegment(segments, "proposed-plan", text.slice(planStart, closeIndex));
    cursor = closeIndex + PROPOSED_PLAN_CLOSE_TAG.length;
  }

  return segments;
}

function pushSegment(segments: Array<MessageSegment>, type: MessageSegment["type"], text: string): void {
  const normalizedText = type === "proposed-plan" ? text.trim() : text;
  if (normalizedText.trim().length === 0) {
    return;
  }
  segments.push({ type, text: normalizedText });
}

function renderSegment(segment: MessageSegment, index: number, variant: ConversationMessageContentVariant): JSX.Element {
  if (segment.type === "proposed-plan" && variant === "user-bubble") {
    return (
      <div key={`segment-${index}`} className="home-chat-proposed-plan">
        <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={MARKDOWN_PLUGINS}>
          {segment.text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <ReactMarkdown key={`segment-${index}`} components={MARKDOWN_COMPONENTS} remarkPlugins={MARKDOWN_PLUGINS}>
      {segment.text}
    </ReactMarkdown>
  );
}
