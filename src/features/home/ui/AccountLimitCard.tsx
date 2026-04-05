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
        <div className="account-limit-card-copy">
          <div className="account-limit-card-label">{label}</div>
          {caption ? <div className="account-limit-card-caption">{caption}</div> : null}
        </div>
        {badge ? <div className="account-limit-card-badge">{badge}</div> : null}
      </div>
      <div className="account-limit-card-right">
        <div className="account-limit-card-value">{value}</div>
      </div>
    </div>
  );
});
