import { memo, useMemo } from "react";
import type { ConversationMessage } from "../../../domain/types";
import { useFileLinkActions } from "../hooks/fileLinkContext";
import { HomePlanDraftCard } from "../../composer/ui/HomePlanDraftCard";
import { MarkdownRenderer } from "./MarkdownRenderer";

const PROPOSED_PLAN_CLOSE_TAG = "</proposed_plan>";
const PROPOSED_PLAN_OPEN_TAG = "<proposed_plan>";

type MessageSegment = { readonly type: "markdown" | "proposed-plan"; readonly text: string };
type ConversationMessageContentVariant = "user-bubble" | "assistant-inline";

interface ConversationMessageContentProps {
  readonly className: string;
  readonly message: ConversationMessage;
  readonly variant?: ConversationMessageContentVariant;
}

export const ConversationMessageContent = memo(function ConversationMessageContent(props: ConversationMessageContentProps): JSX.Element {
  const fileLinkActions = useFileLinkActions();
  const segments = useMemo(() => splitMessageSegments(props.message.text), [props.message.text]);

  return (
    <div className={props.className}>
      {segments.map((segment, index) =>
        renderSegment(segment, index, fileLinkActions),
      )}
    </div>
  );
});

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

function renderSegment(
  segment: MessageSegment,
  index: number,
  fileLinkActions: ReturnType<typeof useFileLinkActions>,
): JSX.Element {
  if (segment.type === "proposed-plan") {
    return <HomePlanDraftCard key={`segment-${index}`} markdown={segment.text} />;
  }

  return (
    <MarkdownRenderer
      key={`segment-${index}`}
      markdown={segment.text}
      workspacePath={fileLinkActions?.workspacePath}
      onOpenFileLink={fileLinkActions?.openFileLink}
      onOpenExternalLink={fileLinkActions?.openExternalLink}
    />
  );
}
