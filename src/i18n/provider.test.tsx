import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "./provider";
import { useI18n } from "./useI18n";

function LocaleProbe(): JSX.Element {
  const { locale, t } = useI18n();
  return <div>{`${locale}:${t("auth.choice.title")}`}</div>;
}

describe("I18nProvider", () => {
  it("updates document metadata when locale changes", () => {
    const { rerender } = render(
      <I18nProvider language="zh-CN" setLanguage={() => undefined}>
        <LocaleProbe />
      </I18nProvider>
    );

    expect(screen.getByText("zh-CN:选择登录方式")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("Codex App Plus 桌面端");

    rerender(
      <I18nProvider language="en-US" setLanguage={() => undefined}>
        <LocaleProbe />
      </I18nProvider>
    );

    expect(screen.getByText("en-US:Choose sign-in method")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.title).toBe("Codex App Plus Desktop");
  });

  it("resolves auto mode from the system language", () => {
    const originalLanguages = window.navigator.languages;

    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["zh-TW", "en-US"]
    });

    try {
      render(
        <I18nProvider language="auto" setLanguage={() => undefined}>
          <LocaleProbe />
        </I18nProvider>
      );

      expect(screen.getByText("zh-CN:选择登录方式")).toBeInTheDocument();
      expect(document.documentElement.lang).toBe("zh-CN");
    } finally {
      Object.defineProperty(window.navigator, "languages", {
        configurable: true,
        value: originalLanguages
      });
    }
  });
});
