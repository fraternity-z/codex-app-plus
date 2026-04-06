import { useId, useMemo, useRef, useState, type FocusEvent } from "react";
import { selectConversationContextWindowUsage, formatContextWindowTokenCount } from "../../conversation/model/conversationContextWindow";
import { useAppSelector } from "../../../state/store";

const TEXT = {
  title: "Context window:",
  label: "View context window details",
  labelAutoCompact: "View context window details (auto-compact detected)",
};

function formatUsageSummary(usedPercent: number, remainingPercent: number): string {
  return `${usedPercent}% used (${remainingPercent}% remaining)`;
}

function formatUsageDetails(usedTokens: number, totalTokens: number): string {
  return `${formatContextWindowTokenCount(usedTokens)} tokens used, ${formatContextWindowTokenCount(totalTokens)} total`;
}

export function ComposerContextWindowIndicator(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const selectedConversation = useAppSelector((state) => state.selectedConversationId === null
    ? null
    : state.conversationsById[state.selectedConversationId] ?? null);
  const configSnapshot = useAppSelector((state) => state.configSnapshot);
  const usage = useMemo(
    () => selectConversationContextWindowUsage(selectedConversation, configSnapshot),
    [configSnapshot, selectedConversation],
  );

  if (usage === null) {
    return null;
  }

  const ariaLabel = usage.autoCompactConfigured ? TEXT.labelAutoCompact : TEXT.label;
  const handleBlur = (event: FocusEvent<HTMLButtonElement>): void => {
    if (containerRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="composer-context-window-anchor"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={open ? "composer-context-window-trigger composer-context-window-trigger-open" : "composer-context-window-trigger"}
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
      >
        <span className="composer-context-window-trigger-dot" aria-hidden="true" />
      </button>
      {open ? (
        <div id={tooltipId} className="composer-context-window-tooltip" role="tooltip">
          <div className="composer-context-window-tooltip-title">{TEXT.title}</div>
          <div className="composer-context-window-tooltip-line">{formatUsageSummary(usage.usedPercent, usage.remainingPercent)}</div>
          <div className="composer-context-window-tooltip-line">{formatUsageDetails(usage.usedTokens, usage.totalTokens)}</div>
        </div>
      ) : null}
    </div>
  );
}
