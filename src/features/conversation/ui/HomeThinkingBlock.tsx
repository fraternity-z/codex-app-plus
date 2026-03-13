import type { ReasoningBlock } from "../model/localConversationGroups";

const BOLD_MARKDOWN_PATTERN = /^\*\*(.+)\*\*$/u;

interface HomeThinkingBlockProps {
  readonly block: ReasoningBlock;
}

export function HomeThinkingBlock(props: HomeThinkingBlockProps): JSX.Element {
  const title = stripReasoningTitleMarkdown(props.block.titleMarkdown);

  return (
    <section className="home-thinking-block" data-kind="reasoning" aria-label={title}>
      <div className="home-thinking-header">
        <span className="home-thinking-label">{title}</span>
      </div>
      {props.block.bodyMarkdown ? <p className="home-thinking-summary">{props.block.bodyMarkdown}</p> : null}
    </section>
  );
}

function stripReasoningTitleMarkdown(text: string): string {
  const match = BOLD_MARKDOWN_PATTERN.exec(text.trim());
  return match?.[1] ?? text;
}
