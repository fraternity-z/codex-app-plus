import { useI18n } from "../../../i18n";

export function HomeTurnThinkingIndicator(): JSX.Element {
  const { t } = useI18n();
  const thinkingLabel = t("app.conversation.thinking");

  return (
    <div
      className="home-chat-thinking-footer home-turn-thinking-indicator"
      role="status"
      aria-live="polite"
      aria-label={thinkingLabel}
    >
      <span className="home-chat-thinking-label">{thinkingLabel}</span>
    </div>
  );
}
