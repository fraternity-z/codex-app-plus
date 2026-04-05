// 账户额度卡片组件
// 参考: spec/03-功能实现/20260404-1140-账户额度显示/plan.md

import { memo } from "react";
import "./AccountLimitCard.css";

export interface AccountLimitCardProps {
  label: string;
  value: string;
  caption: string;
  badge?: string;
  className?: string;
}

export const AccountLimitCard = memo(function AccountLimitCard({
  label,
  value,
  badge,
  className,
}: AccountLimitCardProps) {
  return (
    <div className={`account-limit-card ${className || ""}`}>
      <div className="account-limit-card-left">
        <div className="account-limit-card-label">{label}</div>
        {badge && <div className="account-limit-card-badge">{badge}</div>}
      </div>
      <div className="account-limit-card-right">
        <div className="account-limit-card-value">{value}</div>
      </div>
    </div>
  );
});
