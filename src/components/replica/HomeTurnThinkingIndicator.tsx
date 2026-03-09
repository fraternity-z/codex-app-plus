const THINKING_LABEL = "正在思考";

export function HomeTurnThinkingIndicator(): JSX.Element {
  return (
    <div
      className="home-chat-thinking-footer home-turn-thinking-indicator"
      role="status"
      aria-live="polite"
      aria-label={THINKING_LABEL}
    >
      <span className="home-chat-thinking-label">{THINKING_LABEL}</span>
      <span className="home-chat-thinking-shimmer" aria-hidden="true" />
    </div>
  );
}
