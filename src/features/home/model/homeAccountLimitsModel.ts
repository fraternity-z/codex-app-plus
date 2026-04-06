import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { RateLimitWindow } from "../../../protocol/generated/v2/RateLimitWindow";

export interface AccountLimitCardData {
  label: string;
  value: string;
  caption: string;
  badge?: string;
}

export function buildAccountLimitCards(
  rateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  t: (key: string, params?: Record<string, string>) => string,
): AccountLimitCardData[] {
  if (!rateLimits) {
    return [];
  }

  const cards: AccountLimitCardData[] = [];

  if (rateLimits.primary) {
    cards.push(buildLimitCard(rateLimits.primary, showRemaining, "session", t, rateLimits.credits?.unlimited));
  }

  if (rateLimits.secondary) {
    cards.push(buildLimitCard(rateLimits.secondary, showRemaining, "weekly", t, rateLimits.credits?.unlimited));
  }

  if (rateLimits.credits?.hasCredits && rateLimits.credits.balance) {
    cards.push({
      label: t("accountLimits.creditsBalance"),
      value: rateLimits.credits.balance,
      caption: "",
      badge: rateLimits.credits.unlimited ? t("accountLimits.unlimited") : undefined,
    });
  }

  return cards;
}

function buildLimitCard(
  window: RateLimitWindow,
  showRemaining: boolean,
  type: "session" | "weekly",
  t: (key: string, params?: Record<string, string>) => string,
  isUnlimited?: boolean,
): AccountLimitCardData {
  const percent = showRemaining ? 100 - window.usedPercent : window.usedPercent;
  const value = isUnlimited ? t("accountLimits.unlimited") : `${Math.round(percent)}%`;
  const label = type === "session"
    ? t(showRemaining ? "accountLimits.sessionRemaining" : "accountLimits.sessionUsage")
    : t(showRemaining ? "accountLimits.weeklyRemaining" : "accountLimits.weeklyUsage");
  const caption = buildWindowCaption(
    formatResetTime(window.resetsAt),
    formatWindowDuration(window.windowDurationMins),
    t,
  );

  return {
    label,
    value,
    caption,
    badge: isUnlimited ? t("accountLimits.unlimited") : undefined,
  };
}

function formatResetTime(resetsAt: number | null): string {
  if (resetsAt === null) {
    return "Unknown";
  }

  const diffSeconds = Math.floor(resetsAt - Date.now() / 1000);
  if (diffSeconds <= 0) {
    return "Unknown";
  }
  if (diffSeconds < 60) {
    return formatRelativeUnit(diffSeconds, "second");
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return formatRelativeUnit(diffMinutes, "minute");
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return formatRelativeUnit(diffHours, "hour");
  }

  const diffDays = Math.floor(diffHours / 24);
  return formatRelativeUnit(diffDays, "day");
}

function formatWindowDuration(windowDurationMins: number | null): string {
  if (windowDurationMins === null || windowDurationMins <= 0) {
    return "";
  }

  if (windowDurationMins % (24 * 60) === 0) {
    return formatRelativeUnit(windowDurationMins / (24 * 60), "day");
  }
  if (windowDurationMins % 60 === 0) {
    return formatRelativeUnit(windowDurationMins / 60, "hour");
  }
  return formatRelativeUnit(windowDurationMins, "minute");
}

function buildWindowCaption(
  resetLabel: string,
  windowDuration: string,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (resetLabel === "Unknown") {
    return t("accountLimits.unknown");
  }

  const resetText = t("accountLimits.resetsIn", { time: resetLabel });
  if (windowDuration.length === 0) {
    return resetText;
  }
  return `${resetText} (${t("accountLimits.windowDuration", { duration: windowDuration })})`;
}

function formatRelativeUnit(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
