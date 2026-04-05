import { memo, useCallback, useState } from "react";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import { useI18n } from "../../../i18n";
import { buildAccountLimitCards } from "../model/homeAccountLimitsModel";
import { AccountLimitCard } from "./AccountLimitCard";
import "./AccountLimitsSection.css";

export interface AccountLimitsSectionProps {
  readonly rateLimits: RateLimitSnapshot | null;
  className?: string;
}

export const AccountLimitsSection = memo(function AccountLimitsSection({
  rateLimits,
  className,
}: AccountLimitsSectionProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const cards = buildAccountLimitCards(rateLimits, true, (key: string, params?: Record<string, string>) => {
    return t(key as never, params as never);
  });

  if (!rateLimits || cards.length === 0) {
    return null;
  }

  return (
    <div className={`account-limits-section ${className || ""}`}>
      <button
        type="button"
        className="account-limits-trigger"
        onClick={handleToggleExpand}
        aria-haspopup="menu"
        aria-expanded={isExpanded}
      >
        <span className="account-limits-trigger-text">● {t("accountLimits.title")}</span>
        <span className="account-limits-arrow">{isExpanded ? "‹" : "›"}</span>
      </button>

      {isExpanded ? (
        <div className="account-limits-content">
          <div className="account-limits-grid">
            {cards.map((card) => (
              <AccountLimitCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
