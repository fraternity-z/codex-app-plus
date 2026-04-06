import { MarkdownRenderer } from "../../conversation/ui/MarkdownRenderer";
import { useI18n } from "../../../i18n/useI18n";

interface HomePlanDraftCardProps {
  readonly markdown: string;
}

export function HomePlanDraftCard(props: HomePlanDraftCardProps): JSX.Element {
  const { t } = useI18n();
  return (
    <section className="home-plan-draft-card">
      <div className="home-plan-draft-label">{t("home.conversation.transcript.planDraft")}</div>
      <MarkdownRenderer className="home-plan-draft-body home-chat-markdown home-chat-markdown-assistant" markdown={props.markdown} />
    </section>
  );
}
