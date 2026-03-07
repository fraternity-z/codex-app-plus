import type { ThinkingBlock } from "./localConversationGroups";

interface HomeThinkingBlockProps {
  readonly block: ThinkingBlock;
}

export function HomeThinkingBlock(props: HomeThinkingBlockProps): JSX.Element {
  return (
    <section className="home-thinking-block" data-kind={props.block.kind} aria-label={props.block.label}>
      <div className="home-thinking-header">
        <span className="home-thinking-label">{props.block.label}</span>
        <ThinkingIndicator animate={props.block.summary === null} />
      </div>
      {props.block.summary ? <p className="home-thinking-summary">{props.block.summary}</p> : <ThinkingPlaceholder />}
    </section>
  );
}

function ThinkingIndicator(props: { readonly animate: boolean }): JSX.Element {
  return (
    <span className={props.animate ? "home-thinking-indicator home-thinking-indicator-animated" : "home-thinking-indicator"}>
      <span />
      <span />
      <span />
    </span>
  );
}

function ThinkingPlaceholder(): JSX.Element {
  return <div className="home-thinking-placeholder" />;
}
