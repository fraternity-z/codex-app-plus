// 账户额度显示 ViewModel 层
// 参考: spec/03-功能实现/20260404-1140-账户额度显示/plan.md

import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";
import type { RateLimitWindow } from "../../../protocol/generated/v2/RateLimitWindow";

/**
 * 账户额度卡片数据
 */
export interface AccountLimitCardData {
  label: string;
  value: string;
  caption: string;
  badge?: string;
}

/**
 * 构建账户额度卡片数据
 * @param rateLimits - 额度快照数据
 * @param showRemaining - 是否显示剩余量（false 则显示已使用）
 * @param t - 国际化翻译函数
 * @returns 卡片数据数组
 */
export function buildAccountLimitCards(
  rateLimits: RateLimitSnapshot | null,
  showRemaining: boolean,
  t: (key: string, params?: Record<string, string>) => string
): AccountLimitCardData[] {
  if (!rateLimits) {
    return [];
  }

  const cards: AccountLimitCardData[] = [];

  // 处理 primary 限额（5 小时限额）
  if (rateLimits.primary) {
    cards.push(buildLimitCard(rateLimits.primary, showRemaining, "session", t, rateLimits.credits?.unlimited));
  }

  // 处理 secondary 限额（周限额）
  if (rateLimits.secondary) {
    cards.push(buildLimitCard(rateLimits.secondary, showRemaining, "weekly", t, rateLimits.credits?.unlimited));
  }

  // 处理 Credits 余额
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

/**
 * 构建单个限额卡片
 */
function buildLimitCard(
  window: RateLimitWindow,
  showRemaining: boolean,
  type: "session" | "weekly",
  t: (key: string, params?: Record<string, string>) => string,
  isUnlimited?: boolean
): AccountLimitCardData {
  // 计算百分比
  const percent = showRemaining ? 100 - window.usedPercent : window.usedPercent;
  const value = isUnlimited ? t("accountLimits.unlimited") : `${Math.round(percent)}%`;

  // 构建标签
  const labelKey = type === "session" ? "accountLimits.fiveHours" : "accountLimits.oneWeek";
  const label = t(labelKey);

  // 构建说明文字
  const caption = formatResetTime(window.resetsAt, t);

  return {
    label,
    value: `${value} ${caption}`,
    caption: "",
    badge: isUnlimited ? t("accountLimits.unlimited") : undefined,
  };
}

/**
 * 格式化重置时间
 * @param resetsAt - Unix 时间戳（秒）
 * @param t - 国际化翻译函数
 * @returns 格式化后的重置时间字符串
 */
function formatResetTime(
  resetsAt: number | null,
  t: (key: string, params?: Record<string, string>) => string
): string {
  if (resetsAt === null) {
    return t("accountLimits.unknown");
  }

  const now = Date.now();
  const resetTime = resetsAt * 1000; // 转换为毫秒
  const diffMs = resetTime - now;

  if (diffMs <= 0) {
    return t("accountLimits.unknown");
  }

  // 构建标签
  const resetDate = new Date(resetTime);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const month = resetDate.getMonth() + 1;
    const day = resetDate.getDate();
    return t("accountLimits.resetDate", { month: month.toString(), day: day.toString() });
  } else {
    const hours = resetDate.getHours().toString().padStart(2, "0");
    const minutes = resetDate.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}




