import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider, type UiLanguage } from "../../../i18n";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { SettingsPopover } from "./SettingsPopover";

describe("SettingsPopover", () => {
  function renderPopoverWithLanguage(initialLanguage: UiLanguage): void {
    function Wrapper(): JSX.Element {
      const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
      return (
        <I18nProvider language={language} setLanguage={setLanguage}>
          <SettingsPopover
            authStatus="needs_login"
            authMode={null}
            authBusy={false}
            authLoginPending={false}
            onOpenSettings={vi.fn()}
            onLogin={vi.fn().mockResolvedValue(undefined)}
            onLogout={vi.fn().mockResolvedValue(undefined)}
          />
        </I18nProvider>
      );
    }

    render(<Wrapper />);
  }

  it("shows the logout action for authenticated users", () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPopover
        authStatus="authenticated"
        authMode="chatgpt"
        authBusy={false}
        authLoginPending={false}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={onLogout}
      />,
      { wrapper: createI18nWrapper() }
    );

    expect(screen.getByText("● 已通过 ChatGPT 登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "→ 退出登录" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("shows the login action for logged out users", () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={false}
        authLoginPending={false}
        onOpenSettings={vi.fn()}
        onLogin={onLogin}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createI18nWrapper() }
    );

    expect(screen.getByText("● 未登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "→ 登录 ChatGPT" }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("disables auth actions while busy", () => {
    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={true}
        authLoginPending={true}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createI18nWrapper() }
    );

    expect(screen.getByRole("button", { name: "→ 正在登录..." })).toBeDisabled();
  });

  it("lets the user change language from the popover", () => {
    const originalLanguages = window.navigator.languages;

    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["zh-CN", "en-US"]
    });

    try {
      renderPopoverWithLanguage("auto");

      fireEvent.click(screen.getByRole("button", { name: /语言.*自动检测（跟随系统）/ }));

      expect(screen.getByRole("menuitemradio", { name: /自动检测（跟随系统）/ })).toHaveAttribute("aria-checked", "true");

      fireEvent.click(screen.getByRole("menuitemradio", { name: "English (US)" }));

      expect(document.documentElement.lang).toBe("en-US");
      expect(screen.getByRole("button", { name: /Language.*English \(US\)/ })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, "languages", {
        configurable: true,
        value: originalLanguages
      });
    }
  });

  it("renders translated English labels", () => {
    render(
      <SettingsPopover
        authStatus="needs_login"
        authMode={null}
        authBusy={false}
        authLoginPending={false}
        onOpenSettings={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: createI18nWrapper("en-US") }
    );

    expect(screen.getByText("● Signed out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→ Sign in with ChatGPT" })).toBeInTheDocument();
  });
});
