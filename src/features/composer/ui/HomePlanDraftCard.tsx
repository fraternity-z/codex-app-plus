import { MarkdownRenderer } from "../../conversation/ui/MarkdownRenderer";

interface HomePlanDraftCardProps {
  readonly markdown: string;
}

export function HomePlanDraftCard(props: HomePlanDraftCardProps): JSX.Element {
  return (
    <section className="home-plan-draft-card">
      <div className="home-plan-draft-label">计划草稿</div>
      <MarkdownRenderer className="home-plan-draft-body home-chat-markdown home-chat-markdown-assistant" markdown={props.markdown} />
    </section>
  );
}
