import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, detectSystemLocale, resolveLocale } from "./locale";

describe("i18n locale", () => {
  it("maps supported Chinese variants to zh-CN", () => {
    expect(detectSystemLocale(["zh-TW", "en-US"])).toBe("zh-CN");
  });

  it("falls back to the default locale when the system language is unsupported", () => {
    expect(detectSystemLocale(["ja-JP"])).toBe(DEFAULT_LOCALE);
  });

  it("keeps an explicit user language instead of auto detection", () => {
    expect(resolveLocale("en-US", ["zh-CN"])).toBe("en-US");
  });
});
