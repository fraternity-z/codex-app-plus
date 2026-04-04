// 账户额度显示区域组件
// 参考: spec/03-功能实现/20260404-1140-账户额度显示/plan.md

import { memo, useCallback, useState } from "react";
import type { AppServerClient } from "../../../protocol/appServerClient";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import { useI18n } from "../../../i18n";
import { buildAccountLimitCards } from "../model/homeAccountLimitsModel";
import { AccountLimitCard } from "./AccountLimitCard";
import "./AccountLimitsSection.css";

export interface AccountLimitsSectionProps {
  readonly appServerClient: AppServerClient;
  readonly rateLimits: RateLimitSnapshot | null;
  className?: string;
}

export const AccountLimitsSection = memo(function AccountLimitsSection({
  appServerClient,
  rateLimits,
  className,
}: AccountLimitsSectionProps) {
  const { t } = useI18n();

  // 展开/收起状态
  const [isExpanded, setIsExpanded] = useState(false);

  // 切换展开/收起
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // 构建卡片数据 - 默认显示剩余额度
  const cards = buildAccountLimitCards(rateLimits, true, (key: string, params?: Record<string, string>) => {
    return t(key as any, params as any);
  });

  // 如果没有额度数据，隐藏整个区域
  if (!rateLimits || cards.length === 0) {
    return null;
  }

  return (
    <div className={`account-limits-section ${className || ""}`}>
      <button
        type="button"
        className="account-limits-trigger"
        onClick={handleToggleExpand}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`account-limits-chevron ${isExpanded ? "expanded" : ""}`}
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
        </svg>
        <span className="account-limits-trigger-text">{t("accountLimits.title")}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="account-limits-arrow"
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
        </svg>
      </button>

      {isExpanded && (
        <div className="account-limits-content">
          <div className="account-limits-grid">
            {cards.map((card) => (
              <AccountLimitCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
