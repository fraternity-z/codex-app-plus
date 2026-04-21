// 账户额度显示 ViewModel 层单元测试
// 参考: spec/03-功能实现/20260404-1140-账户额度显示/test-plan.md

import { describe, it, expect } from "vitest";
import { buildAccountLimitCards } from "./homeAccountLimitsModel";
import type { RateLimitSnapshot } from "../../../protocol/generated/v2/RateLimitSnapshot";

// Mock 翻译函数
const mockT = (key: string, params?: Record<string, string>): string => {
  const translations: Record<string, string> = {
    "accountLimits.sessionUsage": "Session usage",
    "accountLimits.sessionRemaining": "Session left",
    "accountLimits.weeklyUsage": "Weekly usage",
    "accountLimits.weeklyRemaining": "Weekly left",
    "accountLimits.creditsBalance": "Credits balance",
    "accountLimits.unlimited": "Unlimited",
    "accountLimits.resetsIn": `Resets in ${params?.time || "{time}"}`,
    "accountLimits.resetsAt": `Resets at ${params?.time || "{time}"}`,
    "accountLimits.windowDuration": `${params?.duration || "{duration}"} window`,
    "accountLimits.unknown": "Unknown",
  };
  return translations[key] || key;
};

function createRateLimitSnapshot(overrides: Partial<RateLimitSnapshot>): RateLimitSnapshot {
  return {
    limitId: "test-limit-id",
    limitName: "test-limit",
    planType: null,
    primary: null,
    secondary: null,
    credits: null,
    rateLimitReachedType: null,
    ...overrides,
  };
}

describe("homeAccountLimitsModel", () => {
  describe("buildAccountLimitCards", () => {
    // TC-B-001: rateLimits 为 null
    it("should return empty array when rateLimits is null", () => {
      const cards = buildAccountLimitCards(null, false, mockT);
      expect(cards).toEqual([]);
    });

    // TC-F-001: 正常显示 5 小时限额
    it("should display primary limit correctly", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 7200, // 2 hours later
          windowDurationMins: 300, // 5 hours
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).toBe("Session usage");
      expect(cards[0].value).toBe("45%");
      expect(cards[0].caption).toContain("Resets in");
      expect(cards[0].caption).toContain("5 hours window");
    });

    // TC-F-002: 正常显示周限额
    it("should display secondary limit correctly", () => {
      const rateLimits = createRateLimitSnapshot({
        secondary: {
          usedPercent: 60,
          resetsAt: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days later
          windowDurationMins: 10080, // 7 days
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).toBe("Weekly usage");
      expect(cards[0].value).toBe("60%");
      expect(cards[0].caption).toContain("Resets in");
      expect(cards[0].caption).toContain("7 days window");
    });

    // TC-F-003: 百分比计算准确性
    it("should calculate percentage accurately", () => {
      const testCases = [
        { usedPercent: 0, expected: "0%" },
        { usedPercent: 50, expected: "50%" },
        { usedPercent: 99.9, expected: "100%" }, // 四舍五入
        { usedPercent: 100, expected: "100%" },
      ];

      testCases.forEach(({ usedPercent, expected }) => {
        const rateLimits = createRateLimitSnapshot({
          primary: {
            usedPercent,
            resetsAt: Math.floor(Date.now() / 1000) + 3600,
            windowDurationMins: 300,
          },
        });

        const cards = buildAccountLimitCards(rateLimits, false, mockT);
        expect(cards[0].value).toBe(expected);
      });
    });

    // TC-M-001: 切换到"剩余"模式
    it("should display remaining percentage when showRemaining is true", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, true, mockT);
      expect(cards[0].label).toBe("Session left");
      expect(cards[0].value).toBe("55%"); // 100 - 45
    });

    // TC-M-002: 切换到"已使用"模式
    it("should display used percentage when showRemaining is false", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].label).toBe("Session usage");
      expect(cards[0].value).toBe("45%");
    });

    // TC-B-002: primary 为 null
    it("should hide primary card when primary is null", () => {
      const rateLimits = createRateLimitSnapshot({
        secondary: {
          usedPercent: 60,
          resetsAt: Math.floor(Date.now() / 1000) + 86400,
          windowDurationMins: 10080,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).toBe("Weekly usage");
    });

    // TC-B-003: secondary 为 null
    it("should hide secondary card when secondary is null", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).toBe("Session usage");
    });

    // TC-B-004: resetsAt 为 null
    it("should display Unknown when resetsAt is null", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: null,
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].caption).toContain("Unknown");
    });

    // TC-B-005: windowDurationMins 为 null
    it("should not display window duration when windowDurationMins is null", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: null,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].caption).not.toContain("window");
      expect(cards[0].caption).toContain("Resets in");
    });

    // TC-B-006: usedPercent 为 0
    it("should display 0% when usedPercent is 0", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 0,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cardsUsed = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cardsUsed[0].value).toBe("0%");

      const cardsRemaining = buildAccountLimitCards(rateLimits, true, mockT);
      expect(cardsRemaining[0].value).toBe("100%");
    });

    // TC-B-007: usedPercent 为 100
    it("should display 100% when usedPercent is 100", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 100,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cardsUsed = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cardsUsed[0].value).toBe("100%");

      const cardsRemaining = buildAccountLimitCards(rateLimits, true, mockT);
      expect(cardsRemaining[0].value).toBe("0%");
    });

    // TC-B-008: 所有字段都为 null
    it("should return empty array when both primary and secondary are null", () => {
      const rateLimits = createRateLimitSnapshot({});

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toEqual([]);
    });

    // TC-C-001: 显示 Unlimited 标签
    it("should display Unlimited badge when credits.unlimited is true", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
        credits: {
          unlimited: true,
          hasCredits: false,
          balance: null,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].badge).toBe("Unlimited");
      expect(cards[0].value).toBe("Unlimited");
    });

    // TC-C-002: 显示 Credits 余额
    it("should display Credits balance when credits.balance exists", () => {
      const rateLimits = createRateLimitSnapshot({
        credits: {
          unlimited: false,
          hasCredits: true,
          balance: "1000",
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).toBe("Credits balance");
      expect(cards[0].value).toBe("1000");
    });

    // TC-C-003: 无 Credits 信息
    it("should not display Credits card when credits is null", () => {
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(Date.now() / 1000) + 3600,
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards).toHaveLength(1);
      expect(cards[0].label).not.toBe("Credits balance");
    });

    // TC-F-004: 重置时间格式化 - 小时
    it("should format reset time in hours", () => {
      const now = Date.now();
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(now / 1000) + 7200, // 2 hours
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].caption).toContain("hour");
    });

    // TC-F-004: 重置时间格式化 - 天
    it("should format reset time in days", () => {
      const now = Date.now();
      const rateLimits = createRateLimitSnapshot({
        primary: {
          usedPercent: 45,
          resetsAt: Math.floor(now / 1000) + 172800, // 2 days
          windowDurationMins: 300,
        },
      });

      const cards = buildAccountLimitCards(rateLimits, false, mockT);
      expect(cards[0].caption).toContain("day");
    });

    // TC-F-005: 窗口时长显示
    it("should display window duration correctly", () => {
      const testCases = [
        { windowDurationMins: 300, expected: "5 hours window" },
        { windowDurationMins: 10080, expected: "7 days window" },
      ];

      testCases.forEach(({ windowDurationMins, expected }) => {
        const rateLimits = createRateLimitSnapshot({
          primary: {
            usedPercent: 45,
            resetsAt: Math.floor(Date.now() / 1000) + 3600,
            windowDurationMins,
          },
        });

        const cards = buildAccountLimitCards(rateLimits, false, mockT);
        expect(cards[0].caption).toContain(expected);
      });
    });
  });
});
