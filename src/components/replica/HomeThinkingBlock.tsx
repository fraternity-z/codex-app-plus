import type { ReasoningBlock } from "./localConversationGroups";

interface HomeThinkingBlockProps {
  readonly block: ReasoningBlock;
}

export function HomeThinkingBlock(props: HomeThinkingBlockProps): JSX.Element {
  return (
    <section className="home-thinking-block" data-kind="reasoning" aria-label={props.block.label}>
      <div className="home-thinking-header">
        <span className="home-thinking-label">{props.block.label}</span>
      </div>
      {props.block.summary ? <p className="home-thinking-summary">{props.block.summary}</p> : null}
    </section>
  );
}
